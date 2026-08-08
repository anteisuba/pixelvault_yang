import { AI_MODELS } from '@/constants/models/enum'

/**
 * 模型单价 —— 模型选择器**第三层「渠道比价」**的数据源。
 *
 * 设计见 `docs/plans/canvas-video-domain-cleanup-2026-08-08.md` §8.4：同一个型号
 * 在不同渠道上价差可以很大（Seedance 2.5 在 fal 是 BytePlus 的 2.06 倍），不把
 * 这个差别摆到用户眼前，他会在毫不知情的情况下多付一倍。
 *
 * ## 口径（改数据前先读，混档会让比价失去意义）
 *
 * - **视频 = 720p、每秒、含音频、无视频输入**。分辨率和有无视频输入都影响单价，
 *   必须钉死一个基准档才能横向比。
 * - 一律 **USD**。人民币计价的渠道在 `source` 里注明原始金额与换算汇率 ——
 *   ⚠ 汇率会漂，复核时连同 `verifiedAt` 一起更新。
 * - 这是**给用户看的参考价，不是计费依据**。计费走服务端 credit policy，两者
 *   不可互相推导。
 *
 * ## ⚠ 与 `HOMEPAGE_MODEL_REFERENCE_PRICES` 的关系
 *
 * `constants/homepage.ts` 里那张表是**首页营销展示**用的，自称 display-only，
 * 且口径未标注。2026-08-08 抽查发现它给 Seedance 2.0 标 $0.1/s，而火山官方算例
 * 换算下来是 $0.14/s、fal 的 2.5 官网标价是 $0.473/s —— 2.5 只比 2.0 贵约 50%，
 * 差不出 4.7 倍，所以那张表要么过时要么是另一个档位。
 *
 * **两张表并存是已知的坏味道**（一个数字两个来源，早晚漂）。本表不去动它，是因为
 * 核实那张表要逐个查 20 多个模型的官方定价，不在本切片范围。立案：等它核实过
 * 之后合并成一张，homepage 从这里取值。
 *
 * ## 覆盖策略：宁可留空，不填没核实过的数字
 *
 * 缺失的条目 UI 应当**不显示价格**，而不是显示一个猜的数。比价的价值全在可信度上，
 * 一个错的数比没有数更糟。补数据时务必附 `source` 与 `verifiedAt`。
 */
export type ModelPriceUnit = 'second' | 'image' | 'kchars'

export interface ModelUnitPrice {
  /** USD。视频按 720p 每秒计，见文件头口径。 */
  amount: number
  unit: ModelPriceUnit
  /** 数据出处，写到能让下一个人原样复核的程度。 */
  source: string
  /** 最后核对日期 YYYY-MM-DD。 */
  verifiedAt: string
}

export const MODEL_UNIT_PRICES: Partial<Record<AI_MODELS, ModelUnitPrice>> = {
  // ── Seedance 2.5 · 火山方舟（cn）────────────────────────────────────────
  // 官方算例：720p / 5s / 无输入视频 = 7.56 元 → 1.512 元/秒 ÷ 7.1 ≈ $0.213
  [AI_MODELS.SEEDANCE_25_VOLCENGINE]: {
    amount: 0.213,
    unit: 'second',
    source: '火山方舟定价页算例 720p·5s·无输入视频 = 7.56 元（汇率 7.1）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: {
    amount: 0.213,
    unit: 'second',
    source:
      '同 SEEDANCE_25_VOLCENGINE —— 参考端点与普通端点同价，火山按 token 计费不分端点',
    verifiedAt: '2026-08-08',
  },

  // ── Seedance 2.0 · 火山方舟（cn）────────────────────────────────────────
  // 官方算例：720p / 5s / 无输入视频 = 4.97 元 → 0.994 元/秒 ÷ 7.1 ≈ $0.140
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: {
    amount: 0.14,
    unit: 'second',
    source: '火山方舟定价页算例 720p·5s·无输入视频 = 4.97 元（汇率 7.1）',
    verifiedAt: '2026-07-31',
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: {
    amount: 0.14,
    unit: 'second',
    source: '同 SEEDANCE_20_VOLCENGINE',
    verifiedAt: '2026-07-31',
  },

  // ── fal ────────────────────────────────────────────────────────────────
  // 全部取自 fal 公开索引 `fal.ai/api/models` 的 `pricingInfoOverride` 官方文本
  // （2026-08-08 实读）。⚠ 该接口能打，但 fal 的 HTML 模型页对脚本直连返 429。
  //
  // ⚠ 口径统一取 **720p、含音频**。Kling 与 Veo 的标价分「audio on/off」两档，
  // 这里取 audio on —— 与火山那几条（生成即含音频）可比。
  [AI_MODELS.SEEDANCE_20]: {
    amount: 0.3034,
    unit: 'second',
    source: 'fal pricingInfoOverride：720p $0.3034/s（1080p $0.682/s）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE]: {
    amount: 0.3034,
    unit: 'second',
    source:
      'fal pricingInfoOverride，reference 端点与 text-to-video 同价（已逐字核对）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.SEEDANCE_20_FAST]: {
    amount: 0.2419,
    unit: 'second',
    source: 'fal pricingInfoOverride：720p $0.2419/s',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: {
    amount: 0.2419,
    unit: 'second',
    source: 'fal pricingInfoOverride，reference 端点同价（已逐字核对）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.KLING_V3_PRO]: {
    amount: 0.168,
    unit: 'second',
    source:
      'fal pricingInfoOverride：audio on $0.168/s（audio off $0.112，voice control $0.196）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.KLING_O3_PRO]: {
    amount: 0.14,
    unit: 'second',
    source: 'fal pricingInfoOverride：audio on $0.14/s（audio off $0.112）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.VEO_31]: {
    amount: 0.4,
    unit: 'second',
    source:
      'fal pricingInfoOverride：720p/1080p 含音频 $0.40/s（不含音频 $0.20；4k 含音频 $0.60）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.HAPPYHORSE_10]: {
    amount: 0.14,
    unit: 'second',
    source: 'fal pricingInfoOverride：720p $0.14/s（1080p $0.18/s）',
    verifiedAt: '2026-08-08',
  },

  // ── ⬜ 待补 ───────────────────────────────────────────────────────────────
  //   · LTX 2.3 —— fal 索引里这条没有 pricingInfoOverride 文本，要开页面看
  //   · 火山的 2.0 fast 双条 —— 火山定价页只给了 2.0 的算例，fast 档单价未取到
  //   · MiniMax H3 四条 / Gemini Omni —— 都不按 token 计费，得逐个抄官网标价，
  //     §9.6 的 token 推算法对它们不适用
  //   · BytePlus 全部 —— adapter 尚未接入（任务包 §3.9）。届时按 §9.6 推算：
  //     720p ≈ 21,600 tokens/秒 × $10.70/M = $0.231/s
}

/** 取模型单价；没有可信数据时返回 null，调用方应当隐藏价格而非显示占位。 */
export const getModelUnitPrice = (modelId: AI_MODELS): ModelUnitPrice | null =>
  MODEL_UNIT_PRICES[modelId] ?? null
