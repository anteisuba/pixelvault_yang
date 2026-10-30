import 'server-only'

import { z } from 'zod'

import { ASSISTANT_MEMORY_SCOPE_IDS } from '@/constants/assistant-memory'
import {
  CHARACTER_PERSONA_LIMITS,
  CHARACTER_REFLECTION,
  CHARACTER_REFLECTION_EDITABLE_FIELDS,
  CHARACTER_REVISION_LIMITS,
  CHARACTER_REVISION_SOURCE_IDS,
  type CharacterReflectionEditableField,
} from '@/constants/cards'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  listAssistantMemoriesForReview,
  recordAssistantMemories,
} from '@/services/assistant-memory.service'
import { resolveMemoryChanges } from '@/services/kernel/assistant-operator.service'
import { todayFor } from '@/lib/memory-until'
import type { AssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { readPinnedFields } from '@/services/cards/character-card.mapper'
import { CharacterPersonaSchema, type CharacterPersona } from '@/types'
import type { AssistantMemory } from '@/types/assistant-memory'
import { AssistantRoundMemoriesDraftSchema } from '@/types/assistant-operator'

import { recordCharacterRevision } from './character-revision.service'

/**
 * **她自己整理**（10-26「更像真人」C）：你在对话里每说 30 句，她在后台把最近这段从头看一遍，
 * 一次模型调用做四件事：写一篇短日记、更新「和你的关系」、合并 / 忘掉记忆、需要时改自己的人设卡。
 *
 * ⭐ 改卡不用你确认（owner 10-26），但每一笔都记进「她改了什么」，设置里能撤回。
 * ⛔ 名字和身份她不能改；「学到的说法」有自己那条学法，这里不碰。
 * ⛔ 你钉住的格（第 ② 步）她也不改：提示里不列、草稿里给了也丢掉；钉住「和你的关系」就不更新它。
 * ⚠ 不碰卡的 `updatedAt`（同学说法）：她整理一次不该把她顶到角色列表最前面。
 * ⚠ 锦上添花：哪一步失败都只记日志，⛔ 影响聊天。
 */

/** 这次她能改哪几格：能改的减去钉住的。 */
function editableFields(
  pinned: readonly string[],
): CharacterReflectionEditableField[] {
  return CHARACTER_REFLECTION_EDITABLE_FIELDS.filter(
    (field) => !pinned.includes(field),
  )
}

const ReflectionDraftSchema = z.object({
  journal: z.string().optional(),
  relationship: z.string().optional(),
  memories: AssistantRoundMemoriesDraftSchema.shape.memories,
  forget: AssistantRoundMemoriesDraftSchema.shape.forget,
  persona: z
    .array(
      z.object({
        field: z.string(),
        text: z.string(),
        reason: z.string().optional(),
      }),
    )
    .optional(),
})

export type CharacterReflectionDraft = z.infer<typeof ReflectionDraftSchema>

export interface ReflectionMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 你在这段里说的第 N 句正好是间隔的倍数 → 这一轮之后整理一次。 */
export function shouldReflect(userLineCount: number): boolean {
  return (
    userLineCount > 0 &&
    userLineCount % CHARACTER_REFLECTION.everyUserLines === 0
  )
}

function systemPrompt(
  name: string,
  editable: readonly CharacterReflectionEditableField[],
  relationshipPinned: boolean,
  today: string,
): string {
  return `You are ${name}, a character who chats with the person who created you ("the creator"). Every so often you look back over your recent chats with them, the way a person thinks over their day. Write in the language the creator chats in.

Output ONLY JSON:
{"journal": "...", "relationship": "...", "memories": [{"kind": "preference|fact|rule", "text": "...", "replaces": 2, "until": "YYYY-MM-DD"}], "forget": [3], "persona": [{"field": "...", "text": "...", "reason": "..."}]}

- journal: your diary entry, first person, 2–5 sentences, at most ${CHARACTER_REFLECTION.journalChars} characters: what happened between you two lately and how you feel about it. A diary, not a report.
- relationship: ${relationshipPinned ? 'the creator fixed this one; leave it out.' : `one or two sentences, at most ${CHARACTER_PERSONA_LIMITS.relationship} characters: what you call the creator, what they call you, how close you are now. Relationships move slowly; if nothing changed, repeat the current one.`}
- memories: things worth remembering about the creator from these chats, one line each (at most 200 characters). "replaces": N merges it into numbered memory N. "until": for plans and other dated things, the last day it still matters (today is ${today}); after it the line drops out on its own. Leave it out when it stays true. "forget" lists numbers that are outdated or duplicated. Never invent anything they did not say.
- persona: ${editable.length ? `change your own card only when the chats really settled something new about you (a habit, something you like, a phrase you keep using, how you treat them now). At most ${CHARACTER_REFLECTION.maxPersonaChanges} fields, usually none. Fields you may change: ${editable.join(', ')}. Never your name, who you are, or any other field.` : 'leave it empty; the creator fixed every field you could change.'} "text" replaces the whole field, so keep what still holds; catchphrases and moods are one per line. "reason" is one short sentence in your own words.`
}

function describeCard(name: string, persona: CharacterPersona): string {
  const fields = CHARACTER_REFLECTION_EDITABLE_FIELDS.map((field) => {
    const value = persona[field]
    const text = (Array.isArray(value) ? value.join('\n') : value).slice(
      0,
      CHARACTER_REFLECTION.cardFieldChars,
    )
    return `[${field}]\n${text || '(empty)'}`
  })
  return [
    `YOUR CARD (${name})`,
    `[who you are]\n${persona.identity.slice(0, CHARACTER_REFLECTION.cardFieldChars) || '(empty)'}`,
    ...fields,
    `[relationship]\n${persona.relationship || '(not written yet)'}`,
  ].join('\n\n')
}

function describeMemories(shown: readonly AssistantMemory[]): string {
  if (shown.length === 0) return 'WHAT YOU REMEMBER ABOUT THEM:\n(nothing yet)'
  return `WHAT YOU REMEMBER ABOUT THEM (numbered):\n${shown
    .map((memory, index) => `#${index + 1} [${memory.kind}] ${memory.text}`)
    .join('\n')}`
}

function describeChat(name: string, messages: readonly ReflectionMessage[]) {
  return `YOUR RECENT CHAT (oldest first):\n${messages
    .slice(-CHARACTER_REFLECTION.readMessages)
    .map(
      (message) =>
        `${message.role === 'user' ? 'Creator' : name}: ${message.content
          .trim()
          .slice(0, CHARACTER_REFLECTION.messageChars)}`,
    )
    .join('\n')}`
}

export function parseReflectionDraft(
  raw: string,
): CharacterReflectionDraft | null {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = ReflectionDraftSchema.safeParse(
      JSON.parse(cleaned.slice(start, end + 1)),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function fieldValue(
  field: CharacterReflectionEditableField,
  text: string,
): CharacterPersona[CharacterReflectionEditableField] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (field === 'catchphrases')
    return lines
      .map((line) => line.slice(0, CHARACTER_PERSONA_LIMITS.catchphraseChars))
      .slice(0, CHARACTER_PERSONA_LIMITS.catchphrases)
  if (field === 'moods')
    return lines
      .map((line) => line.slice(0, CHARACTER_PERSONA_LIMITS.moodChars))
      .slice(0, CHARACTER_PERSONA_LIMITS.moods)
  return text.trim().slice(0, CHARACTER_PERSONA_LIMITS[field])
}

/**
 * 草稿 → 新的人设：只收能改的格、最多几格；「和你的关系」单独一格。
 * 回 `null` = 什么都没变。
 */
export function applyReflectionToPersona(
  persona: CharacterPersona,
  draft: CharacterReflectionDraft,
  pinned: readonly string[] = [],
): { persona: CharacterPersona; reasons: string[] } | null {
  const next: CharacterPersona = { ...persona }
  const reasons: string[] = []
  const editable: ReadonlySet<string> = new Set(editableFields(pinned))
  const changes = (draft.persona ?? [])
    .filter((change) => editable.has(change.field))
    .slice(0, CHARACTER_REFLECTION.maxPersonaChanges)
  for (const change of changes) {
    const field = change.field as CharacterReflectionEditableField
    Object.assign(next, { [field]: fieldValue(field, change.text) })
    if (change.reason?.trim()) reasons.push(change.reason.trim())
  }
  const relationship = draft.relationship
    ?.trim()
    .slice(0, CHARACTER_PERSONA_LIMITS.relationship)
  if (relationship && !pinned.includes('relationship'))
    next.relationship = relationship
  const checked = CharacterPersonaSchema.safeParse(next)
  if (!checked.success) return null
  return JSON.stringify(checked.data) === JSON.stringify(persona)
    ? null
    : { persona: checked.data, reasons }
}

/** 写一篇日记，超了每张卡的上限就删最旧的（出门回来那篇也走这里）。 */
export async function writeJournal(
  userId: string,
  cardId: string,
  text: string,
) {
  const entry = text.trim().slice(0, CHARACTER_REFLECTION.journalChars)
  if (!entry) return
  await db.characterJournal.create({
    data: { userId, characterCardId: cardId, text: entry },
  })
  const stale = await db.characterJournal.findMany({
    where: { characterCardId: cardId },
    orderBy: { createdAt: 'desc' },
    skip: CHARACTER_REFLECTION.journalsPerCard,
    select: { id: true },
  })
  if (stale.length)
    await db.characterJournal.deleteMany({
      where: { id: { in: stale.map(({ id }) => id) } },
    })
}

export async function reflectOnChat(input: {
  userId: string
  cardId: string
  messages: readonly ReflectionMessage[]
  assistant: Pick<AssistantRoute, 'route' | 'modelId'>
  conversationId?: string
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
        updatedAt: true,
      },
    })
    if (!card) return false
    const pinned = readPinnedFields(card.extensions)
    const persona = CharacterPersonaSchema.safeParse(card.persona ?? {})
    if (!persona.success) return false
    const shown = await listAssistantMemoriesForReview(
      input.userId,
      ASSISTANT_MEMORY_SCOPE_IDS.cards,
      null,
      card.id,
    )
    const userPrompt = [
      describeCard(card.name, persona.data),
      describeMemories(shown),
      describeChat(card.name, input.messages),
    ]
      .join('\n\n')
      .slice(-CHARACTER_REFLECTION.promptChars)
    const raw = await llmTextCompletion({
      systemPrompt: systemPrompt(
        card.name,
        editableFields(pinned),
        pinned.includes('relationship'),
        todayFor(undefined),
      ),
      userPrompt,
      promptGuardMaxLength: CHARACTER_REFLECTION.promptChars,
      responseFormat: 'json_object',
      adapterType: input.assistant.route.adapterType,
      apiKey: input.assistant.route.apiKey,
      providerConfig: input.assistant.route.providerConfig,
      modelId: input.assistant.modelId,
    })
    const draft = parseReflectionDraft(raw)
    if (!draft) return false

    if (draft.journal) await writeJournal(input.userId, card.id, draft.journal)

    const memories = resolveMemoryChanges(draft, shown)
    if (
      memories.candidates.length ||
      memories.replacements.length ||
      memories.forget.length
    )
      await recordAssistantMemories({
        userId: input.userId,
        scope: ASSISTANT_MEMORY_SCOPE_IDS.cards,
        characterCardId: card.id,
        ...memories,
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
      })

    const changed = applyReflectionToPersona(persona.data, draft, pinned)
    if (changed) {
      await db.characterCard.update({
        where: { id: card.id },
        data: {
          persona: changed.persona,
          version: { increment: 1 },
          updatedAt: card.updatedAt,
        },
      })
      const side = {
        name: card.name,
        tags: card.tags,
        look: null,
      }
      await recordCharacterRevision({
        userId: input.userId,
        cardId: card.id,
        source: CHARACTER_REVISION_SOURCE_IDS.reflection,
        before: { ...side, persona: persona.data },
        after: { ...side, persona: changed.persona },
        reason:
          changed.reasons
            .join(' ')
            .slice(0, CHARACTER_REVISION_LIMITS.reasonChars) || null,
      })
    }
    return true
  } catch (error) {
    logger.warn('Character reflection failed', {
      cardId: input.cardId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
