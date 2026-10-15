import 'server-only'

import { after } from 'next/server'

import { ASSISTANT_REASONING_EFFORT_IDS } from '@/constants/assistant-persona'
import { ASSISTANT_V3_HISTORY } from '@/constants/assistant-v3'
import {
  assistantV3HistorySummaryMaterial,
  mergeAssistantV3HistorySummaries,
  normalizeAssistantV3HistorySummary,
  readAssistantV3HistorySummaryDraft,
  type AssistantV3HistoryPlan,
  type AssistantV3HistoryTurn,
} from '@/lib/assistant-v3-history'
import { logger } from '@/lib/logger'
import type { AssistantV3HistorySummary } from '@/types/assistant-v3'
import { completeAssistantTextWithContextRetry } from '@/services/kernel/assistant-completion.service'
import { assistantV3HistoryStore } from '@/services/kernel/assistant-v3-history-store.service'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

/**
 * 滑出窗口的那几轮的摘要（P2 第三片，设计方案 §2.2）：开轮那一跳读、收尾后在后台补。
 * 窗口怎么开、挑哪一份见 `lib/assistant-v3-history.ts`；存在哪见 `assistant-v3-history-store.service.ts`
 * （⚠ 现在哪都不存：那一列还没加，`persists: false`，这里就一次都不调模型）。
 */

export interface AssistantV3HistoryOwner {
  /** `User.id`。 */
  readonly userId: string
  /** 只进日志。 */
  readonly clerkId: string
  readonly conversationId: string | undefined
  /** 隐身那一轮：照读（隐身只关写入），⛔ 不补、⛔ 不存。 */
  readonly incognito: boolean
}

/**
 * 开轮那一跳：读这段会话上存的那几份。`canSummarize` = 这一轮补得了也存得下（有会话、存得下、
 * 不隐身、读得出来 —— 读都读不出来就 ⛔ 写，免得把存着的那几份冲掉）。
 */
export async function loadAssistantV3HistorySummaries(
  owner: AssistantV3HistoryOwner,
): Promise<{ summaries: AssistantV3HistorySummary[]; canSummarize: boolean }> {
  const store = assistantV3HistoryStore
  if (!owner.conversationId || !store.persists)
    return { summaries: [], canSummarize: false }
  try {
    const summaries = await store.load({
      userId: owner.userId,
      conversationId: owner.conversationId,
    })
    return { summaries, canSummarize: !owner.incognito }
  } catch (error) {
    logger.warn('assistant history summaries not loaded', {
      userId: owner.clerkId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { summaries: [], canSummarize: false }
  }
}

const { maxItems, maxItemChars, timeoutMs } = ASSISTANT_V3_HISTORY.summary

export const ASSISTANT_V3_HISTORY_SUMMARY_SYSTEM_PROMPT = `You keep the notes for an older stretch of a conversation between a creator and their assistant in ANTEI, an AI image and video studio. These turns are leaving the assistant's view; your notes are all it will keep of them.

You get PREVIOUS NOTES (or "(none)") and the TURNS LEAVING VIEW. Merge them into one set of notes and reply with ONE JSON object:
{"decisions": [], "preferences": [], "openItems": [], "names": []}
- decisions: what was settled and still stands — choices, approvals, rejections, fixed settings (aspect ratio, model, style, length…).
- preferences: how this creator wants things done in this conversation.
- openItems: what was asked for or promised and is not finished yet.
- names: names and ids the rest of the conversation may refer to — cards and their handles (img-1a2b3c), characters, model ids, files — each with a few words on what it is.
Keep what still holds, drop what was reversed or finished, never add anything that is not in the material. At most ${maxItems} items per list, one short line each (under ${maxItemChars} characters). Write in the language the creator writes in; copy names, ids and handles exactly.`

/** 同一段会话、管到同一轮的那一份正在补：⛔ 再起一次（同一个进程里两个标签页同时开轮）。 */
const inFlight = new Set<string>()

/**
 * 收尾后在后台补一份（`plan.summarize`）：上一份 + 滑出去的那几轮 → 一份新的，并进会话上存的那几份。
 *
 * ⚠ 型号：**这一轮的那一家、那个型号、那把 key**（与抽记忆同一条：小功能跟助手，同一家也 ⛔ 换快档，
 *   ⛔ 借别家）；档位 `low`；自己的时限，⛔ 不挂这一轮的 signal。
 * ⚠ `after(fn)`：等这一轮的回复发完才开跑（⛔ 与主步抢同一把 key）；不在请求作用域里（脚本）就当场跑。
 * ⚠ 失败（超时、读不出 JSON、存不进去）只记一行警告，存着的那几份不动；下一轮缺口还在，再补一次。
 */
export function scheduleAssistantV3HistorySummary(input: {
  owner: AssistantV3HistoryOwner
  plan: AssistantV3HistoryPlan
  turns: readonly AssistantV3HistoryTurn[]
  route: ResolvedLlmTextRoute
  modelId: string
  domain: string
  cacheKey: string
}): void {
  const { owner, plan, turns } = input
  const target = plan.summarize
  const conversationId = owner.conversationId
  const store = assistantV3HistoryStore
  if (!target || !conversationId || owner.incognito || !store.persists) return
  const through = turns[target.to - 1]?.fingerprint
  if (!through || target.to <= target.from) return
  const flightKey = `${owner.userId}:${conversationId}:${through}`
  if (inFlight.has(flightKey)) return
  inFlight.add(flightKey)

  // ⚠ 原料在这里一次取完：后台那一跳 ⛔ 回头读会变的东西。
  const material = assistantV3HistorySummaryMaterial(
    target.previous,
    turns.slice(target.from, target.to),
  )
  const coverage = {
    through,
    turns: (target.previous?.turns ?? 0) + (target.to - target.from),
  }
  const { route, modelId, domain, cacheKey } = input
  const work = async () => {
    try {
      const raw = await completeAssistantTextWithContextRetry({
        signal: AbortSignal.timeout(timeoutMs),
        systemPrompt: ASSISTANT_V3_HISTORY_SUMMARY_SYSTEM_PROMPT,
        callLog: { purpose: 'historySummary', domain },
        cacheKey,
        buildUserPrompt: (maxLength) =>
          maxLength === undefined || material.length <= maxLength
            ? material
            : `${material.slice(0, Math.max(0, maxLength - 1))}…`,
        route,
        contextCompactionTargetLength:
          ASSISTANT_V3_HISTORY.summary.compactedSourceChars,
        modelId,
        reasoningEffort: ASSISTANT_REASONING_EFFORT_IDS.low,
        responseFormat: 'json_object',
      })
      const draft = readAssistantV3HistorySummaryDraft(raw)
      if (!draft)
        throw new Error('summary reply was not the JSON object asked for')
      const summary = normalizeAssistantV3HistorySummary(draft, coverage)
      await store.update({ userId: owner.userId, conversationId }, (current) =>
        mergeAssistantV3HistorySummaries(current, summary),
      )
    } catch (error) {
      logger.warn('assistant history summary not stored', {
        userId: owner.clerkId,
        adapterType: route.adapterType,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      inFlight.delete(flightKey)
    }
  }
  try {
    after(work)
  } catch {
    // 不在请求作用域里（脚本 / 测试）：当场跑，不必再等。
    void work()
  }
}
