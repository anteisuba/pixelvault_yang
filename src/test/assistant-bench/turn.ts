/**
 * 真开一轮助手（L2a）：真 `prepareOperatorTurn`（真库里的用户 / 人设 / key）+ 现行内核同一个
 * `benchContext`，给直接测执行函数（`runLibraryChange`、`runFind`…）的用例用。
 * ⛔ 不调模型：这里只开轮、不跑主循环。
 */
import type { PromptAssistantResponseLanguage } from '@/types'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
/* eslint-disable no-restricted-imports -- 测试底座：照内核那样开轮，要直接用助手域内部的开轮与板子 */
import {
  benchContext,
  benchFaceOf,
  boardEntry,
} from '@/features/assistant/bench'
import { prepareOperatorTurn } from '@/features/assistant/services/assistant-operator-turn.service'
import type { V3Context } from '@/features/assistant/services/assistant-v3-steps.service'
/* eslint-enable no-restricted-imports */

export type BenchRequest = Partial<AssistantOperatorRequest> &
  Pick<AssistantOperatorRequest, 'domain'>

export async function openBenchTurn(
  clerkId: string,
  request: BenchRequest,
  options: {
    language?: PromptAssistantResponseLanguage
    modelId?: string
  } = {},
): Promise<V3Context> {
  const full = {
    messages: [{ role: 'user' as const, content: '帮我改一下' }],
    workspaceKey: request.domain === 'image' ? 'image-natural' : request.domain,
    snapshot: { prompt: '', availableModels: [] },
    ...request,
  } as AssistantOperatorRequest
  const prepared = await prepareOperatorTurn(
    clerkId,
    full,
    new AbortController().signal,
  )
  prepared.run.nextKernel = true
  const face = benchFaceOf(full.domain)
  if (!face) throw new Error(`没有这张脸：${full.domain}`)
  return benchContext({
    face,
    clerkId,
    prepared,
    request: full,
    language: options.language ?? 'chinese',
    stepPrefix: 'n1',
    board: boardEntry('', []),
    modelId: options.modelId ?? prepared.modelId,
  })
}

/** 把一个执行函数跑完：事件收齐，返回值照给。 */
export async function drainSteps<E, T>(
  steps: AsyncGenerator<E, T>,
): Promise<{ events: E[]; value: T }> {
  const events: E[] = []
  for (;;) {
    const next = await steps.next()
    if (next.done) return { events, value: next.value }
    events.push(next.value)
  }
}
