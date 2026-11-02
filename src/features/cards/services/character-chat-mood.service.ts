import 'server-only'

import { after } from 'next/server'

import { ASSISTANT_REASONING_EFFORT_IDS } from '@/constants/assistant-persona'
import { CHAT_MOOD } from '@/constants/chat-voice'
import type { AssistantPromptCharacter } from '@/types/assistant-persona'
import type { ChatMoodState, ChatPlan } from '@/types/chat-mood'
import {
  chatMoodFromPlan,
  fadeChatMood,
  parseChatPlan,
  readChatMood,
  settleChatPlan,
  silentRunOf,
} from '@/lib/chat-mood'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { logger } from '@/lib/logger'
import type { AssistantRoute } from '@/services/kernel/assistant-route.service'
import { llmTextCompletion } from '@/services/llm-text.service'

/**
 * **回之前先想一步**（10-31 owner「聊天加入这三层」，学麦麦的 planner）：你这句话让她什么心情、怎么对你、
 * 回不回。只在聊天（收台）里跑；工作台照旧每句都回、照做。
 *
 * ⭐ 心情全由聊天内容判断（owner「不是应该交给聊天内容判断吗」），⛔ 卡上预设；⛔ 给你看。
 * ⚠ 型号：这一轮的那一家、那个型号、那把 key（与学说法同一条），档位 `low`、自己的时限；
 *   超时 / 读不出来 = 没想，照常回（⛔ 掀翻这一轮）。
 * ⚠ 存回卡上用 `after`（⛔ 拖慢这一轮），⛔ 碰 `updatedAt`（同学说法）。
 */

export const CHAT_PLAN_SYSTEM_PROMPT = `You decide how a character takes the latest message in a private text chat with the creator, before she replies. You do not write the reply.

You get who she is, how she felt before this message, how many of the creator's messages she has left unanswered in a row, the recent chat and the latest message. Decide as this person really would — not as a helpful assistant who must keep the creator happy.
- mood: one or two words for how she feels after reading it, in the creator's language.
- intensity: 0 calm, 1 a little, 2 clearly, 3 strongly. Moods fade on their own: unless something in the chat keeps it alive, let it drop a step.
- why: one short line — what in the chat made her feel this.
- stance: one short line on how she treats this message (warm, playful, curt, brushes it off, pushes back, sulks, teases, earnest…).
- reply: "full" a normal reply; "brief" only a word or a few; "none" she leaves it unanswered — only when she is genuinely upset (intensity 2 or more) and silence is what this person would do.
She reacts to what is said about her, being compared or replaced, ignored, teased, praised, apologised to — the way this person would, and an apology does not have to fix things at once. Most messages get a normal reply in a calm mood; never invent drama the chat does not support.
Output ONLY JSON: {"mood":"","intensity":0,"why":"","stance":"","reply":"full"}`

function clip(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

function hoursLabel(hours: number): string {
  if (hours < 1) return 'just now'
  return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} ago`
}

export function chatPlanPrompt(input: {
  character: AssistantPromptCharacter
  name: string
  before: (ChatMoodState & { hoursAgo: number }) | null
  silentRun: number
  messages: readonly { role: string; content: string }[]
}): string {
  const { character } = input
  const traits = [
    character.identity && `Who she is: ${character.identity}`,
    character.behavior && `How she acts: ${character.behavior}`,
    character.speech && `How she talks: ${character.speech}`,
    character.boundaries && `What she won't do: ${character.boundaries}`,
    character.relationship &&
      `Between her and the creator now: ${character.relationship}`,
  ]
    .filter((line): line is string => Boolean(line))
    .map((line) => `- ${clip(line, CHAT_MOOD.traitChars)}`)
  const said = input.messages.filter((message) => message.content.trim())
  const latest = said.at(-1)
  const recent = said
    .slice(0, -1)
    .slice(-CHAT_MOOD.recentLines)
    .map(
      (message) =>
        `${message.role === 'user' ? 'creator' : input.name}: ${clip(message.content, CHAT_MOOD.lineChars)}`,
    )
  const before = input.before
    ? `${input.before.mood} (intensity ${input.before.intensity}, ${hoursLabel(input.before.hoursAgo)}) — ${input.before.why}`
    : 'calm'
  return [
    `CHARACTER: ${input.name}`,
    ...traits,
    '',
    `HOW SHE FELT BEFORE THIS MESSAGE: ${before}`,
    `MESSAGES SHE LEFT UNANSWERED IN A ROW: ${input.silentRun}`,
    '',
    'RECENT CHAT:',
    recent.length ? recent.join('\n') : '(none)',
    '',
    `LATEST MESSAGE FROM THE CREATOR: ${latest ? clip(latest.content, CHAT_MOOD.lineChars * 3) : ''}`,
  ].join('\n')
}

function saveChatMood(input: {
  userId: string
  cardId: string
  state: ChatMoodState | null
}) {
  const save = async () => {
    try {
      const card = await db.characterCard.findFirst({
        where: { id: input.cardId, userId: input.userId, isDeleted: false },
        select: { id: true, extensions: true, updatedAt: true },
      })
      if (!card) return
      const extensions = {
        ...((card.extensions as Record<string, unknown> | null) ?? {}),
      }
      if (input.state) extensions[CHAT_MOOD.extensionKey] = input.state
      else if (CHAT_MOOD.extensionKey in extensions)
        delete extensions[CHAT_MOOD.extensionKey]
      else return
      await db.characterCard.update({
        where: { id: card.id },
        data: {
          extensions: extensions as Prisma.InputJsonObject,
          updatedAt: card.updatedAt,
        },
      })
    } catch (error) {
      logger.warn('Saving chat mood failed', {
        cardId: input.cardId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  try {
    after(save)
  } catch {
    // 不在请求里（单测 / 脚本）：当场存。
    void save()
  }
}

/**
 * 这一轮她怎么对你。`save: false` = 隐身（想照想，⛔ 记下来）。没想出来 = `null`。
 */
export async function planChatTurn(input: {
  userId: string
  cardId: string
  name: string
  character: AssistantPromptCharacter
  messages: readonly { role: string; content: string }[]
  assistant: Pick<AssistantRoute, 'route' | 'modelId'>
  signal: AbortSignal
  save: boolean
  now?: Date
}): Promise<{ plan: ChatPlan; silentRun: number } | null> {
  const now = input.now ?? new Date()
  try {
    const card = await db.characterCard.findFirst({
      where: { id: input.cardId, userId: input.userId, isDeleted: false },
      select: { extensions: true },
    })
    if (!card) return null
    const before = fadeChatMood(readChatMood(card.extensions), now)
    const silentRun = silentRunOf(input.messages)
    const raw = await llmTextCompletion({
      purpose: 'character-chat-mood',
      systemPrompt: CHAT_PLAN_SYSTEM_PROMPT,
      userPrompt: chatPlanPrompt({
        character: input.character,
        name: input.name,
        before,
        silentRun,
        messages: input.messages,
      }),
      promptGuardMaxLength: CHAT_MOOD.promptChars,
      responseFormat: 'json_object',
      reasoningEffort: ASSISTANT_REASONING_EFFORT_IDS.low,
      adapterType: input.assistant.route.adapterType,
      apiKey: input.assistant.route.apiKey,
      meter: input.assistant.route.meter,
      providerConfig: input.assistant.route.providerConfig,
      modelId: input.assistant.modelId,
      signal: AbortSignal.any([
        input.signal,
        AbortSignal.timeout(CHAT_MOOD.timeoutMs),
      ]),
    })
    const parsed = parseChatPlan(raw)
    if (!parsed) return null
    const plan = settleChatPlan(parsed, silentRun)
    if (input.save)
      saveChatMood({
        userId: input.userId,
        cardId: input.cardId,
        state: chatMoodFromPlan(plan, now),
      })
    return { plan, silentRun }
  } catch (error) {
    input.signal.throwIfAborted()
    logger.warn('Chat plan failed, replying as usual', {
      cardId: input.cardId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
