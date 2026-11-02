import 'server-only'

import { z } from 'zod'

import {
  CHARACTER_CARD,
  CHARACTER_PERSONA_LIMITS,
  CHARACTER_TIDY,
} from '@/constants/cards/character-card'
import { CHARACTER_REVISION_SOURCE_IDS } from '@/constants/cards/character-revision'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { CharacterPersonaSchema, type CharacterPersona } from '@/types'
import type { AppLocale } from '@/i18n/routing'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import { readPinnedFields } from '@/features/cards/services/character-card.mapper'
import { recordCharacterRevision } from '@/features/cards/services/character-revision.service'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'

/**
 * **导入后自动整理**（角色大项目 ⑪，owner 10-31「那就自动整理」）：酒馆卡的「描述」一整段导进来时塞在
 * 「经历」里，身份、说话方式那几格是空的；卡多半是英文、开场白是一大段旁白、没有对话示例。
 * 导完当场跑一次助手那一家，一次做完：
 * - 把描述拆回各格，**写成你的界面语言**（owner 10-31「可以」：英文卡按你的语言整理）；
 * - 名字换成这个角色在你的语言里的官方叫法（确定有才换；拿不准留原名，⛔ 自己音译——实测把 Aemeath 写成「艾梅丝」）；
 * - 开场白改成她会发的一两句话，原来那段挪进备选开场白；
 * - 对话示例：卡上有就译成只剩说的话，没有就照设定写 5 段（口吻最靠它）。
 *
 * ⭐ 刚导进来的卡每一格都是导入填的，整格换掉；你钉住的格不动（导入时不会有，留着防以后复用）。
 * ⭐ 整理记进「她改了什么」（来源记成整理），能一格一格撤回；原卡全文一直留在 `st.card`。
 * ⚠ 锦上添花：没 key、超时、读不出来都只记日志，卡照原样导进来（⛔ 让导入失败）。
 */

const LANGUAGE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
}

export function tidySystemPrompt(locale: AppLocale): string {
  const language = LANGUAGE_NAMES[locale]
  return `You tidy a character card imported from SillyTavern for a chat app where the character texts with the user as herself. The author wrote most of it into one long description; rebuild the card's fields from the material, written in ${language}.

Fields (leave a field "" or [] when the material says nothing about it — never invent facts):
- name: the character's official name in ${language} only when you are sure it exists (e.g. the localisation the game or anime itself uses); when unsure, keep the original name exactly — never transliterate it yourself.
- identity: who they are — age, occupation, affiliation, world. One or two sentences.
- behavior: personality as concrete behaviour — what they do, how they treat people, habits. Not a list of adjectives.
- speech: how they talk — tone, sentence length, verbal tics, how they address others.
- backstory: their history and what shaped them.
- boundaries: what they won't do, and their flaws.
- scenario: the setting the chat starts from, one or two sentences.
- catchphrases: phrases they actually say in the material, in ${language}, at most ${CHARACTER_TIDY.maxCatchphrases}.
- opening: the first message she would send the user — one or two short spoken sentences, no narration.
- examples: ${CHARACTER_TIDY.examples} short exchanges, each {"user": one line from the user, "reply": her answer in one to three spoken sentences}: a greeting, the user asking for help, an emotional moment, her pushing back, a joke. When the material has example dialogue, base them on it.

Rules:
- Everything in ${language}; keep names of places and things as they are known in ${language}.
- Only spoken words in opening, examples and catchphrases: no *actions*, no narration, no stage directions.
- Use the character's name instead of {{char}}; keep {{user}} as is.
- Output ONLY JSON: {"name":"","identity":"","behavior":"","speech":"","backstory":"","boundaries":"","scenario":"","catchphrases":[],"opening":"","examples":[]}`
}

function clipped(max: number) {
  return z
    .string()
    .catch('')
    .transform((text) => text.trim().slice(0, max))
}

const TidyDraftSchema = z.object({
  name: clipped(CHARACTER_CARD.NAME_MAX_LENGTH),
  identity: clipped(CHARACTER_PERSONA_LIMITS.identity),
  behavior: clipped(CHARACTER_PERSONA_LIMITS.behavior),
  speech: clipped(CHARACTER_PERSONA_LIMITS.speech),
  backstory: clipped(CHARACTER_PERSONA_LIMITS.backstory),
  boundaries: clipped(CHARACTER_PERSONA_LIMITS.boundaries),
  scenario: clipped(CHARACTER_PERSONA_LIMITS.scenario),
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
  opening: clipped(CHARACTER_PERSONA_LIMITS.opening),
  examples: z
    .array(
      z.object({
        user: clipped(CHARACTER_PERSONA_LIMITS.exampleUserChars),
        reply: clipped(CHARACTER_PERSONA_LIMITS.exampleReplyChars),
      }),
    )
    .catch([])
    .transform((examples) =>
      examples
        .filter((example) => example.reply)
        .slice(0, CHARACTER_PERSONA_LIMITS.examples),
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
 * 整理出来的换进刚导入的卡：有内容的格整格换（刚导入的都是导入填的），钉住的不动。
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
    'backstory',
    'boundaries',
    'scenario',
    'opening',
  ] as const) {
    if (open(field) && draft[field]) next[field] = draft[field]
  }
  if (open('catchphrases') && draft.catchphrases.length)
    next.catchphrases = draft.catchphrases
  if (open('examples') && draft.examples.length) next.examples = draft.examples
  return JSON.stringify(next) === JSON.stringify(persona) ? null : next
}

/** 原来那段开场白挪进备选开场白的最前面（换了才挪）。 */
export function keepOriginalOpening(
  extensions: unknown,
  original: string,
): Record<string, unknown> | null {
  if (!original.trim()) return null
  const all = {
    ...((extensions as Record<string, unknown> | null) ?? {}),
  }
  const kept = {
    ...((all[TAVERN_CARD.EXTENSION_KEY] as Record<string, unknown>) ?? {}),
  }
  const greetings = Array.isArray(kept.alternateGreetings)
    ? (kept.alternateGreetings as unknown[]).filter(
        (item): item is string => typeof item === 'string',
      )
    : []
  if (greetings.includes(original)) return null
  kept.alternateGreetings = [original, ...greetings].slice(
    0,
    TAVERN_CARD.MAX_ALTERNATE_GREETINGS,
  )
  all[TAVERN_CARD.EXTENSION_KEY] = kept
  return all
}

/** 导入刚建好的那张卡整理一次。整理过 = `true`。 */
export async function tidyImportedCard(input: {
  userId: string
  cardId: string
  locale: AppLocale
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
      persona.opening
        ? `FIRST MESSAGE:\n${persona.opening.slice(0, CHARACTER_TIDY.openingChars)}`
        : null,
      persona.examples.length
        ? `EXAMPLE DIALOGUE:\n${persona.examples
            .slice(0, CHARACTER_TIDY.exampleLines)
            .map(
              (example) =>
                `${example.user ? `{{user}}: ${example.user}\n` : ''}${card.name}: ${example.reply}`,
            )
            .join('\n')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n\n')
    const { route, modelId } = await resolveAssistantRoute(input.userId)
    const raw = await llmTextCompletion({
      systemPrompt: tidySystemPrompt(input.locale),
      userPrompt: material,
      promptGuardMaxLength: CHARACTER_TIDY.promptChars,
      responseFormat: 'json_object',
      adapterType: route.adapterType,
      apiKey: route.apiKey,
      meter: route.meter,
      providerConfig: route.providerConfig,
      modelId,
      signal: AbortSignal.timeout(CHARACTER_TIDY.timeoutMs),
    })
    const draft = parseTidyDraft(raw)
    if (!draft) return false
    const pinned = readPinnedFields(card.extensions)
    const next = mergeTidyDraft(persona, draft, pinned) ?? persona
    const name =
      draft.name && !(pinned as readonly string[]).includes('name')
        ? draft.name
        : card.name
    if (next === persona && name === card.name) return false
    const extensions =
      next.opening !== persona.opening
        ? keepOriginalOpening(card.extensions, persona.opening)
        : null
    await db.characterCard.update({
      where: { id: card.id },
      data: {
        name,
        persona: next as Prisma.InputJsonObject,
        ...(extensions
          ? { extensions: extensions as Prisma.InputJsonObject }
          : {}),
      },
    })
    await recordCharacterRevision({
      userId: input.userId,
      cardId: card.id,
      source: CHARACTER_REVISION_SOURCE_IDS.reflection,
      before: { name: card.name, tags: card.tags, look: null, persona },
      after: { name, tags: card.tags, look: null, persona: next },
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
