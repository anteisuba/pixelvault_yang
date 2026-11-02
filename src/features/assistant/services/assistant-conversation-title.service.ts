import 'server-only'

import { after } from 'next/server'

import { ASSISTANT_CONVERSATION_TITLE } from '@/constants/assistant'
import { ASSISTANT_REASONING_EFFORT_IDS } from '@/constants/assistant-persona'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { completeAssistantTextWithContextRetry } from '@/services/kernel/assistant-completion.service'
import { resolveAssistantRoute } from '@/services/kernel/assistant-route.service'
import type { AssistantConversationMessageStored } from '@/types/assistant-conversation'

export const ASSISTANT_CONVERSATION_TITLE_SYSTEM_PROMPT = `You name conversations in ANTEI, an AI image and video studio, so the creator can find them again in a list.
You get the creator's first message and, when there is one, the assistant's first reply. Reply with ONE short title and nothing else:
- What this conversation is about — the subject, character, scene or task — not what the creator typed word for word.
- At most ${ASSISTANT_CONVERSATION_TITLE.maxChars} characters; in Chinese or Japanese about 6 to 14 characters, in English 2 to 6 words.
- Write in the language the creator writes in. Keep character names, model names and ids exactly as written.
- No quotes, no ending punctuation, no emoji, no "Title:" prefix.`

/** 第一句 + 第一段回复，按字数截好（⛔ 喂整段对话）。 */
export function assistantConversationTitleMaterial(
  messages: readonly AssistantConversationMessageStored[],
): string | null {
  const firstUser = messages.find((message) => message.role === 'user')
  if (!firstUser?.content.trim()) return null
  const firstReply = messages.find(
    (message) => message.role === 'assistant' && message.content.trim(),
  )
  const material = [
    `CREATOR: ${firstUser.content.trim()}`,
    ...(firstReply ? [`ASSISTANT: ${firstReply.content.trim()}`] : []),
  ].join('\n\n')
  return material.slice(0, ASSISTANT_CONVERSATION_TITLE.materialChars)
}

/** 模型回的那一行收成标题：去引号 / 前缀 / 句末标点，一行，截到上限（⛔ 带「…」）。 */
export function normalizeAssistantConversationTitle(
  raw: string,
): string | null {
  const line = raw
    .split('\n')
    .map((part) => part.trim())
    .find(Boolean)
  if (!line) return null
  let title = line.replace(/^(title|标题|タイトル)\s*[:：]\s*/i, '').trim()
  // 引号与句末标点可能互相挡着（「…」。），剥到不再变为止。
  for (let previous = ''; previous !== title; ) {
    previous = title
    title = title
      .replace(/^["'“”‘’「」『』《》]+|["'“”‘’「」『』《》]+$/g, '')
      .replace(/[。.!！?？、,，;；:：]+$/u, '')
      .trim()
  }
  if (!title) return null
  return Array.from(title)
    .slice(0, ASSISTANT_CONVERSATION_TITLE.maxChars)
    .join('')
    .trim()
}

/**
 * 第一次落库建行之后，在后台给这段对话起个标题。
 *
 * ⚠ 型号：**助手那一家、那个型号、那把 key**（`resolveAssistantRoute`，与摘要、润色同一条：小功能跟助手，
 *   ⛔ 借别家），档位 `low`；没配 key / 起不出来只记一行，标题照旧是截第一句的那一版。
 * ⚠ 只在标题**还是自动那一版**时写（条件更新 `title = autoTitle`）：起标题的这几秒里用户改过名，⛔ 盖掉。
 * ⚠ `after(fn)`：等这次保存的响应发完才跑；不在请求作用域里（脚本 / 测试）就当场跑。
 */
export function scheduleAssistantConversationTitle(input: {
  userId: string
  conversationId: string
  autoTitle: string | null
  messages: readonly AssistantConversationMessageStored[]
}): void {
  const material = assistantConversationTitleMaterial(input.messages)
  if (!material) return
  const work = async () => {
    try {
      const { route, modelId } = await resolveAssistantRoute(input.userId)
      const raw = await completeAssistantTextWithContextRetry({
        signal: AbortSignal.timeout(ASSISTANT_CONVERSATION_TITLE.timeoutMs),
        systemPrompt: ASSISTANT_CONVERSATION_TITLE_SYSTEM_PROMPT,
        callLog: { purpose: 'conversationTitle' },
        buildUserPrompt: () => material,
        route,
        contextCompactionTargetLength:
          ASSISTANT_CONVERSATION_TITLE.materialChars,
        modelId,
        reasoningEffort: ASSISTANT_REASONING_EFFORT_IDS.low,
      })
      const title = normalizeAssistantConversationTitle(raw)
      if (!title || title === input.autoTitle) return
      await db.assistantConversation.updateMany({
        where: {
          id: input.conversationId,
          userId: input.userId,
          title: input.autoTitle,
        },
        data: { title },
      })
    } catch (error) {
      logger.warn('assistant conversation title not stored', {
        userId: input.userId,
        conversationId: input.conversationId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  try {
    after(work)
  } catch {
    void work()
  }
}
