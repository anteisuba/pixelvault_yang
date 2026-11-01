import 'server-only'

import { z } from 'zod'

import { CHARACTER_PERSONA_LIMITS } from '@/constants/cards/character-card'
import { db } from '@/lib/db'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'
import {
  CharacterPersonaSchema,
  type CharacterDialogueDraft,
  type CharacterDialogueDraftKind,
} from '@/types'

/**
 * **试读**（卡片页「设定」一行，owner 09-26）：让助手用这个角色的口吻说两句，
 * 用户一眼判断设定写得像不像——和外观的「试镜」对称，但不花出图的钱。
 * **起草**（10-26「更像真人」A）：对话示例 / 开场白空着时，照设定写几段 / 一句。
 *
 * ⚠ 只读卡、不写卡：试读点「像她」、起草写回卡都由页面走普通的保存。语言跟着设定原文走。
 * ⭐ 用**助手那一家**（`resolveAssistantRoute`，owner 2026-10-15「全跟助手」）：没 key 就照实
 * 抛（翻译过的一句），⛔ 不拿别家的 key 顶上。
 */

const SAMPLE_LINE_COUNT = 2
const SAMPLE_LINE_MAX_LENGTH = 120
const DRAFT_EXAMPLE_COUNT = 5

const SampleLinesSchema = z.object({
  lines: z
    .array(z.string().trim().min(1).max(SAMPLE_LINE_MAX_LENGTH))
    .min(1)
    .max(SAMPLE_LINE_COUNT),
})

const DraftExamplesSchema = z.object({
  examples: z
    .array(
      z.object({
        user: z
          .string()
          .trim()
          .max(CHARACTER_PERSONA_LIMITS.exampleUserChars)
          .default(''),
        reply: z
          .string()
          .trim()
          .min(1)
          .max(CHARACTER_PERSONA_LIMITS.exampleReplyChars),
      }),
    )
    .min(1)
    .max(DRAFT_EXAMPLE_COUNT),
})

const DraftOpeningSchema = z.object({
  opening: z.string().trim().min(1).max(CHARACTER_PERSONA_LIMITS.opening),
})

const VOICE_RULES = `- Follow the profile's way of speaking, catchphrases and forms of address exactly; show personality through what they say, not by describing it.
- Sound like a real person, not an assistant: no summing up, no stock phrases, not always agreeable.
- Use the same language as the profile.
- Only spoken words: no narration, no action or stage directions, no quotes around a line.`

const SAMPLE_SYSTEM_PROMPT = `You write short lines of dialogue spoken by a fictional character, to let the author check whether the character profile reads right.
Rules:
- Write exactly ${SAMPLE_LINE_COUNT} different lines the character would say to the user in everyday situations.
${VOICE_RULES}
- Each line at most ${SAMPLE_LINE_MAX_LENGTH} characters.
- Output ONLY JSON: {"lines": ["...", "..."]}`

const EXAMPLES_SYSTEM_PROMPT = `You write example exchanges for a character card: what the user says and how the character answers. A chat model imitates them to get the character's voice, so they matter more than the profile text.
Rules:
- Write exactly ${DRAFT_EXAMPLE_COUNT} short exchanges, each a different kind of moment, in this order: a greeting; the user asking for help with something real; an emotional moment; the character refusing or pushing back; a joke or teasing.
- "user" is one short line from the user; "reply" is the character's answer, one to three spoken sentences.
${VOICE_RULES}
- Output ONLY JSON: {"examples": [{"user": "...", "reply": "..."}]}`

const OPENING_SYSTEM_PROMPT = `You write the opening line of a chat for a character card: the first thing the character says when the user opens a chat. Its length and tone set how the whole chat sounds.
Rules:
- One to three spoken sentences, natural for this character meeting the user in their usual setting.
${VOICE_RULES}
- Output ONLY JSON: {"opening": "..."}`

const DRAFT_SYSTEM_PROMPTS: Record<CharacterDialogueDraftKind, string> = {
  examples: EXAMPLES_SYSTEM_PROMPT,
  opening: OPENING_SYSTEM_PROMPT,
}

function parseJson<T>(raw: string, schema: z.ZodType<T>): T | null {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = schema.safeParse(JSON.parse(cleaned.slice(start, end + 1)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** 读卡 → 设定写成提示 → 助手那一家补全一次。不是本人的卡 = `null`。 */
async function completeForCard(
  clerkId: string,
  cardId: string,
  systemPrompt: string,
): Promise<string | null> {
  const dbUser = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: dbUser.id, isDeleted: false },
    select: { name: true, persona: true },
  })
  if (!card) return null

  const persona = CharacterPersonaSchema.nullable().safeParse(card.persona)
  const profile = persona.success ? persona.data : null
  const userPrompt = [
    `Name: ${card.name}`,
    profile?.identity ? `Identity: ${profile.identity}` : null,
    profile?.behavior ? `Personality (behaviour): ${profile.behavior}` : null,
    profile?.speech ? `Way of speaking: ${profile.speech}` : null,
    profile?.catchphrases.length
      ? `Catchphrases: ${profile.catchphrases.join(' / ')}`
      : null,
    profile?.boundaries
      ? `What they won't do, and their flaws: ${profile.boundaries}`
      : null,
    profile?.backstory ? `Backstory: ${profile.backstory}` : null,
    profile?.scenario ? `Setting: ${profile.scenario}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const { route, modelId } = await resolveAssistantRoute(dbUser.id)
  return llmTextCompletion({
    systemPrompt,
    userPrompt,
    adapterType: route.adapterType,
    apiKey: route.apiKey,
    providerConfig: route.providerConfig,
    modelId,
  })
}

export async function sampleCharacterLines(
  clerkId: string,
  cardId: string,
): Promise<{ lines: string[] } | null> {
  const raw = await completeForCard(clerkId, cardId, SAMPLE_SYSTEM_PROMPT)
  if (raw === null) return null
  const parsed = parseJson(raw, SampleLinesSchema)
  if (!parsed) throw new Error('The assistant did not return usable lines.')
  return { lines: parsed.lines }
}

/** 起草对话示例（5 段，各一种情境）或开场白（一句）。 */
export async function draftCharacterDialogue(
  clerkId: string,
  cardId: string,
  kind: CharacterDialogueDraftKind,
): Promise<CharacterDialogueDraft | null> {
  const raw = await completeForCard(clerkId, cardId, DRAFT_SYSTEM_PROMPTS[kind])
  if (raw === null) return null
  if (kind === 'examples') {
    const parsed = parseJson(raw, DraftExamplesSchema)
    if (!parsed) throw new Error('The assistant did not return usable lines.')
    return { examples: parsed.examples }
  }
  const parsed = parseJson(raw, DraftOpeningSchema)
  if (!parsed) throw new Error('The assistant did not return usable lines.')
  return { opening: parsed.opening }
}
