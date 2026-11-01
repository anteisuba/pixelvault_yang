import { LLM_TEXT_MODEL_IDS } from '@/constants/config'

/**
 * LLM 每百万 token 单价（USD）—— 平台点数第 2 片（`docs/design/platform-credits.md` §2.6）。
 *
 * ## 口径
 *
 * - `input` = 没命中缓存的输入；`cachedInput` = 命中缓存的输入；`output` = 输出**含思考**。
 *   账本的 `outputTokens` 已按这个口径记（Gemini 的思考另报，入账时加回去）。
 * - 有阶段价的（推出价到某天）按时间分段，`until` 是该段**最后一天**（UTC，含当天）；最后一段不写 `until`。
 * - DeepSeek 分高峰 / 低谷：按**高峰价**记（宁可多算，⛔ 不按低谷价报给用户）。
 * - 长上下文涨价档（Haiku > 10 万、Grok ≥ 20 万、OpenAI > 27.2 万）不分：助手一轮远在门槛下。
 *   Claude 写缓存的 1.25 倍溢价也不单算（量小）。
 * - 同 `unit-prices.ts`：**宁可留空，不填没核实过的数**。缺价的模型账本 `points` 留空。
 */
export interface LlmTokenPricePeriod {
  /** 这一段价格的最后一天 YYYY-MM-DD（UTC）；缺 = 之后一直是这个价。 */
  until?: string
  input: number
  cachedInput: number
  output: number
}

export interface LlmTokenPrice {
  periods: readonly LlmTokenPricePeriod[]
  source: string
  verifiedAt: string
}

const ANTHROPIC_SOURCE =
  'platform.claude.com/docs/en/about-claude/pricing（Base input / Cache hits / Output）'

export const LLM_TOKEN_PRICES: Record<string, LlmTokenPrice> = {
  [LLM_TEXT_MODEL_IDS.GEMINI_3_5_FLASH_LITE]: {
    periods: [{ input: 0.3, cachedInput: 0.03, output: 2.5 }],
    source: 'ai.google.dev/gemini-api/docs/pricing（Standard paid tier）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.GEMINI_3_8_FLASH]: {
    periods: [
      { until: '2026-12-31', input: 0.75, cachedInput: 0.075, output: 3.75 },
      { input: 1.5, cachedInput: 0.15, output: 7.5 },
    ],
    source:
      'ai.google.dev/gemini-api/docs/pricing（推出价到 2026-12-31，2027-01-01 起翻倍）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.GEMINI_4_ARGON]: {
    periods: [
      { until: '2026-11-30', input: 2, cachedInput: 0.1, output: 10 },
      { input: 4, cachedInput: 0.2, output: 20 },
    ],
    source:
      'ai.google.dev/gemini-api/docs/pricing（推出价到 2026-11-30，12-01 起翻倍）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_ASTRA]: {
    periods: [{ input: 10, cachedInput: 1, output: 50 }],
    source: 'developers.openai.com/api/docs/pricing（Standard，≤272K 输入）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_SOL]: {
    periods: [{ input: 2, cachedInput: 0.1, output: 10 }],
    source: 'developers.openai.com/api/docs/pricing（Standard，≤272K 输入）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_1_TERRA]: {
    periods: [{ input: 1, cachedInput: 0.05, output: 5 }],
    source: 'developers.openai.com/api/docs/pricing（Standard，≤272K 输入）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.OPENAI_GPT_6_LUNA]: {
    periods: [{ input: 0.1, cachedInput: 0.01, output: 0.5 }],
    source: 'developers.openai.com/api/docs/pricing（Standard，≤272K 输入）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH]: {
    periods: [{ input: 0.3, cachedInput: 0.006, output: 1.2 }],
    source:
      'api-docs.deepseek.com/quick_start/pricing（高峰价；低谷 $0.15 / $0.003 / $0.6）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO]: {
    periods: [{ input: 1.32, cachedInput: 0.044, output: 3.96 }],
    source:
      'api-docs.deepseek.com/quick_start/pricing（高峰价；低谷 $0.66 / $0.022 / $1.98）',
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.CLAUDE_FABLE_5_1]: {
    periods: [{ input: 10, cachedInput: 0.25, output: 50 }],
    source: ANTHROPIC_SOURCE,
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5]: {
    periods: [{ input: 4, cachedInput: 0.2, output: 20 }],
    source: ANTHROPIC_SOURCE,
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5]: {
    periods: [{ input: 2, cachedInput: 0.1, output: 10 }],
    source: ANTHROPIC_SOURCE,
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.CLAUDE_HAIKU_5_5]: {
    periods: [{ input: 0.1, cachedInput: 0.01, output: 0.5 }],
    source: `${ANTHROPIC_SOURCE}（≤10 万 token 提示档）`,
    verifiedAt: '2026-11-01',
  },
  [LLM_TEXT_MODEL_IDS.XAI_GROK_4_7]: {
    periods: [{ input: 2, cachedInput: 0.5, output: 6 }],
    source: 'docs.x.ai/docs/models（< 20 万 token 提示档）',
    verifiedAt: '2026-11-01',
  },
}

/** `at` 那天适用的那一段价；模型没有核实过的价 → `null`。 */
export function getLlmTokenPrice(
  modelId: string,
  at: Date = new Date(),
): LlmTokenPricePeriod | null {
  const entry = Object.hasOwn(LLM_TOKEN_PRICES, modelId)
    ? LLM_TOKEN_PRICES[modelId]
    : undefined
  if (!entry) return null
  const day = at.toISOString().slice(0, 10)
  return (
    entry.periods.find((period) => !period.until || day <= period.until) ?? null
  )
}
