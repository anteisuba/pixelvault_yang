import { CREDIT_POINT_USD } from '@/constants/credits'
import { getLlmTokenPrice } from '@/constants/models/llm-prices'

/**
 * 点数换算（平台点数，`docs/design/platform-credits.md`）。1 点 = 1 美分。
 * 纯函数、前后端共用；单价只住 `constants/models/*`，⛔ 这里不存数字。
 */

/** 美元 → 点，留三位小数（账本 `points` 是 Decimal(12,3)）。 */
export function usdToPoints(usd: number): number {
  return Math.round((usd / CREDIT_POINT_USD) * 1000) / 1000
}

/** 账本口径的 token：`inputTokens` 含命中缓存的那部分，`outputTokens` 含思考。 */
export interface BillableLlmTokens {
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
}

/**
 * 一次 LLM 调用值多少点。没有可信单价、或 provider 没报 token → `null`（⛔ 不当 0：
 * 没报不等于没花）。
 */
export function pointsOfLlmUsage(
  modelId: string,
  tokens: BillableLlmTokens | null,
  at: Date = new Date(),
): number | null {
  const price = getLlmTokenPrice(modelId, at)
  if (!price || !tokens) return null
  if (tokens.inputTokens === undefined && tokens.outputTokens === undefined)
    return null
  const input = tokens.inputTokens ?? 0
  const cached = Math.min(tokens.cachedInputTokens ?? 0, input)
  const output = tokens.outputTokens ?? 0
  const usd =
    ((input - cached) * price.input +
      cached * price.cachedInput +
      output * price.output) /
    1_000_000
  return usdToPoints(usd)
}
