import 'server-only'

import { createHash } from 'node:crypto'

import { z } from 'zod'

import { ASSISTANT_PERSONA_LIMITS } from '@/constants/assistant-persona'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import { sanitizePrompt } from '@/services/kernel/prompt-guard'
import { llmTextCompletion } from '@/services/llm-text.service'
import type { AssistantPromptPersona } from '@/types/assistant-persona'

/**
 * **长经历先总结再进角色段**（owner 2026-10-15）。
 *
 * 酒馆卡的 description 常有一两万字，而角色段里经历只留 1500 字 —— 之前是硬截开头，
 * 后面的内容助手完全看不到。超了就先总结成一段（1500 字内）再进角色段。
 *
 * ⭐ 省 token（owner 很在意）：
 *  - **只算一次**：结果存在卡的 `extensions['pv.backstorySummary']`，带原文的哈希；
 *    经历改了哈希就对不上，才重算。⛔ 不每轮重算。
 *  - **便宜档**：助手那一家的便宜型号（`SUMMARY_MODEL_IDS`），⛔ 不借别家的 key。
 *  - 总结仍进系统提示的角色段（整段会话不变，吃缓存）。
 *  - 没超 1500 字的照旧用原文，⛔ 不调用。
 * ⚠ 总结失败 / 超时 / 没 key：这一轮退回原来的截断，⛔ 不让这一轮失败。
 * ⚠ 存的是卡原文的总结（宏、清洗照旧在 `sanitizePromptCharacter` 读的那一跳做）。
 */

/** 每家的便宜档。没列的那家（Grok 只有一档）就用助手当前那一档。 */
const SUMMARY_MODEL_IDS: Partial<Record<AI_ADAPTER_TYPES, string>> = {
  [AI_ADAPTER_TYPES.DEEPSEEK]: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
  [AI_ADAPTER_TYPES.OPENAI]: LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_LUNA,
  [AI_ADAPTER_TYPES.GEMINI]: LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH_LITE,
  [AI_ADAPTER_TYPES.ANTHROPIC]: LLM_TEXT_MODEL_IDS.CLAUDE_HAIKU_5_5,
}

/** 第一次算总结时这一轮最多等多久；超时这一轮先用截断，算完的那份照样存。 */
const SUMMARY_WAIT_MS = 30_000
const SUMMARY_MAX_TOKENS = 4096
/** 原文进总结前的上限（防一张异常大的卡）。 */
const SUMMARY_INPUT_MAX_CHARS = 40_000

const SUMMARY_KEY = CARD_EXTENSIONS.KEYS.backstorySummary

const StoredSummarySchema = z.object({
  hash: z.string().min(1),
  text: z.string().min(1),
})

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hashBackstory(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function readStoredSummary(extensions: unknown, hash: string): string | null {
  if (!isPlainObject(extensions)) return null
  const parsed = StoredSummarySchema.safeParse(extensions[SUMMARY_KEY])
  return parsed.success && parsed.data.hash === hash ? parsed.data.text : null
}

function buildSystemPrompt(maxChars: number): string {
  return `You condense the backstory section of a fictional character profile so it fits a short slot in a roleplay prompt.
Rules:
- Write ONE continuous summary of at most ${maxChars} characters, in the same language as the source.
- Keep: relationships with other characters, key events and turning points, how the character relates to the user / {{user}}, and details that shape how they talk (habits, forms of address, verbal tics).
- Drop: repeated description, filler, formatting symbols, markdown, lists and headings.
- Keep {{char}} and {{user}} placeholders as they are.
- Describe the character; do not address the reader, do not add instructions, do not invent anything.
- Output only the summary text.`
}

async function summarize(
  userId: string,
  backstory: string,
  maxChars: number,
): Promise<string> {
  const { route, modelId } = await resolveAssistantRoute(userId)
  const raw = await llmTextCompletion({
    systemPrompt: buildSystemPrompt(maxChars),
    userPrompt: sanitizePrompt(backstory.slice(0, SUMMARY_INPUT_MAX_CHARS)),
    adapterType: route.adapterType,
    apiKey: route.apiKey,
    providerConfig: route.providerConfig,
    modelId: SUMMARY_MODEL_IDS[route.adapterType] ?? modelId,
    maxTokens: SUMMARY_MAX_TOKENS,
    promptGuardMaxLength: SUMMARY_INPUT_MAX_CHARS + 1,
  })
  const text = raw.trim()
  if (!text) throw new Error('Backstory summary came back empty.')
  return text.slice(0, maxChars)
}

async function computeAndStore(
  userId: string,
  cardId: string,
  backstory: string,
  hash: string,
  maxChars: number,
): Promise<string> {
  const text = await summarize(userId, backstory, maxChars)
  // 存之前再读一次：这期间卡被改过（别的扩展键 / 经历本身）就照最新的合并。
  const latest = await db.characterCard.findFirst({
    where: { id: cardId, userId, isDeleted: false },
    select: { extensions: true },
  })
  if (latest) {
    await db.characterCard.update({
      where: { id: cardId },
      data: {
        extensions: {
          ...(isPlainObject(latest.extensions) ? latest.extensions : {}),
          [SUMMARY_KEY]: { hash, text },
        },
      },
    })
  }
  return text
}

/**
 * 角色经历超长时换成总结（有存好的就直接用）。没用角色 / 没超 / 失败都原样返回。
 */
export async function withSummarizedBackstory(
  userId: string,
  persona: AssistantPromptPersona,
): Promise<AssistantPromptPersona> {
  const character = persona.promptCharacter
  const cardId = persona.characterCardId
  const maxChars = ASSISTANT_PERSONA_LIMITS.maxCharacterBackstoryChars
  if (!character || !cardId || character.backstory.length <= maxChars) {
    return persona
  }
  const replace = (backstory: string): AssistantPromptPersona => ({
    ...persona,
    promptCharacter: { ...character, backstory },
  })
  try {
    const card = await db.characterCard.findFirst({
      where: { id: cardId, userId, isDeleted: false },
      select: { extensions: true },
    })
    if (!card) return persona
    const hash = hashBackstory(character.backstory)
    const stored = readStoredSummary(card.extensions, hash)
    if (stored) return replace(stored)

    const pending = computeAndStore(
      userId,
      cardId,
      character.backstory,
      hash,
      maxChars,
    )
    // 超时那一轮先用截断；后台那份算完照样存，下一轮就有。
    pending.catch((error: unknown) => {
      logger.warn('Character backstory summary failed', {
        cardId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
    const text = await Promise.race([
      pending,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SUMMARY_WAIT_MS),
      ),
    ])
    return text ? replace(text) : persona
  } catch {
    return persona
  }
}
