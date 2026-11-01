import 'server-only'

import { after } from 'next/server'

import { USAGE_KINDS, type UsageFunding } from '@/constants/credits'
import { logger } from '@/lib/logger'
import { createApiUsageEntry } from '@/services/usage.service'

/**
 * 谁在花这次 LLM 调用的钱（平台点数第 1 片，`docs/design/platform-credits.md`）。
 * 由 `resolveLlmTextRoute` 定下、随路由一起交给调用方，调用方原样放进 `meter`。
 * `null` = 这次调用不属于任何用户（健康检查、离线评测），不入账。
 */
export interface LlmUsageMeter {
  userId: string
  funding: UsageFunding
}

/** provider 自报的 token，口径同 `LlmTextUsage`（在 llm-text.service）。 */
export interface LlmUsageTokens {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

export interface RecordLlmUsageInput {
  /** 缺 / `null` = 不入账（同 `LlmTextInput.meter`）。 */
  meter: LlmUsageMeter | null | undefined
  adapterType: string
  modelId: string
  usage: LlmUsageTokens | null
  ok: boolean
  durationMs: number
  errorMessage?: string
}

/**
 * 每次 LLM 请求记一行账（kind = llm）。⛔ 不等、不抛：账本写不进去绝不能拖慢或弄坏这次回答，
 * 失败只留一行日志。点数（`points`）等 LLM 单价表上线（第 2 片）再填，这里先记 token。
 */
export function recordLlmUsage(input: RecordLlmUsageInput): void {
  const meter = input.meter
  if (!meter) return
  const pending = createApiUsageEntry({
    userId: meter.userId,
    adapterType: input.adapterType,
    provider: input.adapterType,
    modelId: input.modelId,
    requestCount: 1,
    outputImageCount: 0,
    durationMs: input.durationMs,
    wasSuccessful: input.ok,
    errorMessage: input.errorMessage,
    kind: USAGE_KINDS.llm,
    funding: meter.funding,
    inputTokens: input.usage?.inputTokens,
    cachedInputTokens: input.usage?.cachedInputTokens,
    outputTokens: input.usage?.outputTokens,
    reasoningTokens: input.usage?.reasoningTokens,
  }).catch((error: unknown) => {
    logger.warn('llm usage entry not recorded', {
      adapterType: input.adapterType,
      modelId: input.modelId,
      error: error instanceof Error ? error.message : String(error),
    })
  })
  try {
    // 调用常在响应收尾时才结束，`after` 让函数等这一行写完再退。
    after(() => pending)
  } catch {
    // 不在请求作用域里（cron 接力 / 脚本 / 测试）：已经发出去了。
  }
}
