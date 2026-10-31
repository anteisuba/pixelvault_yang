import 'server-only'

import { z } from 'zod'

import {
  CHARACTER_PERSONA_LIMITS,
  CHARACTER_TIDY,
} from '@/constants/cards/character-card'
import { CHARACTER_REVISION_SOURCE_IDS } from '@/constants/cards/character-revision'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { CharacterPersonaSchema, type CharacterPersona } from '@/types'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { readPinnedFields } from '@/services/cards/character-card.mapper'
import { recordCharacterRevision } from '@/services/cards/character-revision.service'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'

/**
 * **导入后自动整理**（角色大项目 ⑪，owner 10-31「那就自动整理」）：酒馆卡的「描述」一整段导进来时塞在
 * 「经历」里，身份、说话方式那几格是空的。导完当场跑一次助手那一家，把描述拆回各格。
 *
 * ⭐ 只填空着的格；「经历」导入时装的是整段描述，换成拆出来的经历。你钉住的格不动。
 * ⭐ 整理记进「她改了什么」（来源记成整理），能一格一格撤回；原卡全文一直留在 `st.card`。
 * ⚠ 锦上添花：没 key、超时、读不出来都只记日志，卡照原样导进来（⛔ 让导入失败）。
 */

const TIDY_SYSTEM_PROMPT = `You tidy a character card imported from SillyTavern. Its author wrote everything about the character into one long description; split it into the card's fields so a chat model can use them.

Fields (leave a field "" or [] when the material says nothing about it — never invent):
- identity: who they are — age, occupation, affiliation, world. One or two sentences.
- behavior: personality as concrete behaviour — what they do, how they treat people, habits. Not a list of adjectives.
- speech: how they talk — tone, sentence length, verbal tics, how they address others.
- backstory: their history and what shaped them.
- boundaries: what they won't do, and their flaws.
- catchphrases: phrases they actually say, copied from the material, at most ${CHARACTER_TIDY.maxCatchphrases}.

Rules:
- Use only what is in the material; keep names and facts exact.
- Write in the same language as the description.
- Replace {{char}} with the character's name; keep {{user}} as is.
- Output ONLY JSON: {"identity":"","behavior":"","speech":"","backstory":"","boundaries":"","catchphrases":[]}`

function clipped(max: number) {
  return z
    .string()
    .catch('')
    .transform((text) => text.trim().slice(0, max))
}

const TidyDraftSchema = z.object({
  identity: clipped(CHARACTER_PERSONA_LIMITS.identity),
  behavior: clipped(CHARACTER_PERSONA_LIMITS.behavior),
  speech: clipped(CHARACTER_PERSONA_LIMITS.speech),
  backstory: clipped(CHARACTER_PERSONA_LIMITS.backstory),
  boundaries: clipped(CHARACTER_PERSONA_LIMITS.boundaries),
  catchphrases: z
    .array(z.string())
    .catch([])
    .transform((phrases) =>
      phrases
        .map((phrase) =>
          phrase.trim().slice(0, CHARACTER_PERSONA_LIMITS.catchphraseChars),
        )
        .filter(Boolean)
        .slice(0, CHARACTER_TIDY.maxCatchphrases),
    ),
})

export type CharacterTidyDraft = z.infer<typeof TidyDraftSchema>

export function parseTidyDraft(raw: string): CharacterTidyDraft | null {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = TidyDraftSchema.safeParse(
      JSON.parse(cleaned.slice(start, end + 1)),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** 卡导入时留下的描述全文（经历装不下的那截在 `st.card.description`）。 */
function importedDescription(
  persona: CharacterPersona,
  extensions: unknown,
): string {
  const kept =
    extensions && typeof extensions === 'object'
      ? (extensions as Record<string, unknown>)[TAVERN_CARD.EXTENSION_KEY]
      : null
  const full =
    kept && typeof kept === 'object'
      ? (kept as Record<string, unknown>).description
      : null
  return typeof full === 'string' && full.trim() ? full : persona.backstory
}

/**
 * 拆出来的并进旧的：只填空格；「经历」导入时装的是整段描述，换成拆出来的经历；钉住的不动。
 * 什么都没变 = `null`。
 */
export function mergeTidyDraft(
  persona: CharacterPersona,
  draft: CharacterTidyDraft,
  pinned: readonly string[] = [],
): CharacterPersona | null {
  const next: CharacterPersona = { ...persona }
  const open = (field: string) => !pinned.includes(field)
  for (const field of [
    'identity',
    'behavior',
    'speech',
    'boundaries',
  ] as const) {
    if (open(field) && !persona[field].trim() && draft[field])
      next[field] = draft[field]
  }
  if (open('backstory') && draft.backstory) next.backstory = draft.backstory
  if (
    open('catchphrases') &&
    persona.catchphrases.length === 0 &&
    draft.catchphrases.length
  )
    next.catchphrases = draft.catchphrases
  return JSON.stringify(next) === JSON.stringify(persona) ? null : next
}

/** 导入刚建好的那张卡整理一次。整理过 = `true`。 */
export async function tidyImportedCard(input: {
  userId: string
  cardId: string
}): Promise<boolean> {
  try {
    const card = await db.characterCard.findFirst({
      where: { id: input.cardId, userId: input.userId, isDeleted: false },
      select: {
        id: true,
        name: true,
        tags: true,
        persona: true,
        extensions: true,
      },
    })
    if (!card) return false
    const parsed = CharacterPersonaSchema.safeParse(card.persona ?? {})
    if (!parsed.success) return false
    const persona = parsed.data
    const description = importedDescription(persona, card.extensions)
    if (!description.trim()) return false

    const material = [
      `Name: ${card.name}`,
      `DESCRIPTION:\n${description.slice(0, CHARACTER_TIDY.descriptionChars)}`,
      persona.behavior ? `PERSONALITY:\n${persona.behavior}` : null,
      persona.scenario ? `SCENARIO:\n${persona.scenario}` : null,
      persona.examples.length
        ? `EXAMPLE LINES:\n${persona.examples
            .slice(0, CHARACTER_TIDY.exampleLines)
            .map((example) => example.reply)
            .join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n')
    const { route, modelId } = await resolveAssistantRoute(input.userId)
    const raw = await llmTextCompletion({
      systemPrompt: TIDY_SYSTEM_PROMPT,
      userPrompt: material,
      promptGuardMaxLength: CHARACTER_TIDY.promptChars,
      responseFormat: 'json_object',
      adapterType: route.adapterType,
      apiKey: route.apiKey,
      providerConfig: route.providerConfig,
      modelId,
      signal: AbortSignal.timeout(CHARACTER_TIDY.timeoutMs),
    })
    const draft = parseTidyDraft(raw)
    if (!draft) return false
    const next = mergeTidyDraft(
      persona,
      draft,
      readPinnedFields(card.extensions),
    )
    if (!next) return false
    await db.characterCard.update({
      where: { id: card.id },
      data: { persona: next as Prisma.InputJsonObject },
    })
    const side = { name: card.name, tags: card.tags, look: null }
    await recordCharacterRevision({
      userId: input.userId,
      cardId: card.id,
      source: CHARACTER_REVISION_SOURCE_IDS.reflection,
      before: { ...side, persona },
      after: { ...side, persona: next },
    })
    return true
  } catch (error) {
    logger.warn('Tidying imported character card failed', {
      cardId: input.cardId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
