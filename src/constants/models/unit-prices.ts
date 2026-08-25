import { AI_MODELS } from '@/constants/models/enum'
import type { VideoResolution } from '@/constants/video-options'

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
 * - **图片 = 单张、1:1、不含参考图**（模型强制要参考图的除外，那种在 `source`
 *   里写清算了几张输入）。⚠ **不是「1024² 一刀切」** —— 图片按输出像素分档，而
 *   各家 adapter 发出去的尺寸并不一样，口径必须跟着**产品实际发的那个尺寸**走：
 *   · fal 恒发 `image_size: square_hd` = 1024×1024（1MP）
 *   · OpenAI 恒发 `size: 1024x1024`
 *   · Gemini 不发 imageSize，走官方默认 1K
 *   · **火山发的是 2K 档 2048×2048**（`VOLCENGINE_IMAGE_SIZES`）= 419 万像素
 *   所以火山 Seedream Pro 落在官方「> 261 万像素」的**高档位 0.60 元**，不是低档位
 *   的 0.30 元。按低档位标价会把它腰斩，正是首页那张表犯过的错。
 *   ⛔ **别按 UI 上的「清晰度」推算**：四个图片 adapter（fal / openai / gemini /
 *   volcengine）的图片路径**都只读 `aspectRatio`，一个都不读 `advancedParams.resolution`**
 *   （2026-08-18 逐个查实）。那个选项对图片是空转，拿它算价会算出一个产品根本发不出去的档。
 * - 一律 **USD**。人民币计价的渠道在 `source` 里注明原始金额与换算汇率 ——
 *   ⚠ 汇率会漂，复核时连同 `verifiedAt` 一起更新。**换算汇率统一 7.1**，与既有
 *   视频条目同口径；要改就整表一起改，不许新旧两个汇率并存。
 * - 这是**给用户看的参考价，不是计费依据**。计费走服务端 credit policy，两者
 *   不可互相推导。
 *
 * ## 首页也从这里取值（2026-08-08 owner 拍板）
 *
 * `constants/homepage.ts` 曾经并存着第二张价格表，给 Seedance 2.0 标 $0.1/s ——
 * 比火山官方算例**低了 3 倍**。一个数字两个来源必然漂，这就是漂的样子。
 *
 * 现在 homepage 走 `resolveHomepageReferencePrice`：先问本表，本表没有的才退回它
 * 自己的存量表（图片/音频那批还没核实）。**补价格请补到本表**，别往那张加新条目。
 *
 * ⚠ owner 选的口径是「**按产品默认档**」——哪个开关默认开就报哪个价。当前目录里
 * 12 个有价视频模型**全部** `generateAudio: true`，所以默认档恰好等于本表已有的
 * 含音频口径，不需要存第二个数字。**哪天出现默认关音频的模型，这条就不再自动成立**，
 * 那时才需要在本表加一列区分。
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
  /**
   * 视频专用：**逐档**每秒单价（USD）。有它的时候它是权威，`amount` 只作为
   * 720p 基准档留给横向比价。
   *
   * ⚠ 为什么不用倍率推：各家的档位间距不一样（Wan 是 1:2:4，Seedance 2.0 是
   * 720p→1080p 2.25 倍，HappyHorse 只有 1.29 倍）。一个统一倍率必然对不上。
   *
   * ⚠ **只填核实过的档**。没填的档不会退回 `amount` —— 那正是「按低档位标价
   * 把高档腰斩」的老错（见文件头首页那张表）。查不到的档由调用方按缺价处理，
   * 显示成「起」而不是等号。
   */
  resolutionAmounts?: Partial<Record<VideoResolution, number>>
  /** 数据出处，写到能让下一个人原样复核的程度。 */
  source: string
  /** 最后核对日期 YYYY-MM-DD。 */
  verifiedAt: string
}

/** 本表视频口径的基准档（文件头：视频 = 720p、每秒、含音频、无视频输入）。 */
export const VIDEO_UNIT_PRICE_BASE_RESOLUTION =
  '720p' as const satisfies VideoResolution

/**
 * ## `resolutionAmounts` 的覆盖现状（2026-08-25 补全那一轮）
 *
 * **全覆盖**（模型开几档就填了几档，任何档都报得出精确价）：
 * Wan 3.0 ×2 · HappyHorse · Kling V3/O3 · MiniMax H3 ×4 · 火山 Seedance 2.0 ×2 ·
 * Veo 3.1（退役，预填）。
 *
 * **部分覆盖**：fal Seedance 2.0 / 2.0 Reference —— 有 720p 与 1080p，**没有
 * 480p**（fal 的标价原文就没给），480p 档照缺价处理。
 *
 * **故意留空，别"顺手补全"**：
 * - **BytePlus 六条** —— 官方例表只给 720p 一档。想推 1080p 就得假设费率不随
 *   分辨率变，而**火山那边它是变的**（720p 46 元/M token vs 1080p 51）。同一家
 *   字节系都不一致，推算就是编数。
 * - **Seedance 2.5 全族（三站）** —— 同上，只有 720p 有官方数。
 * - **fal Seedance 2.0 Fast ×2** —— 只有 720p 有数，而 720p 本来就走 `amount`
 *   兜底，填了等于没填；480p 仍然缺。
 * - **Gemini Omni Flash** —— 整条根本不在本表里（它的每秒价是从 token 单价推的
 *   估算，见 model-pricing.md），补它是"给本表加新条目"，不是补分档。
 *
 * 补空档的唯一正确姿势：回官方页重新核一次那一档的价，附 `source` 与
 * `verifiedAt`。⛔ 不许拿已有档位打折/加倍推。
 */

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
  // 逐档来自火山定价页的每秒价（480p 0.46 · 720p 0.99 · 1080p 2.48 元/秒）。
  // ⭐ 用 token 公式反算对过：1080p = 1920×1080×24÷1024 = 48,600 token/s ×
  // 51 元/M = 2.479 元/s ✓；720p = 21,600 × 46/M = 0.9936 元/s ✓。两档分毫不差，
  // 所以这张分档表不是抄了个孤立数字。（480p 差 4% 以内，差在 480p 的宽度官方
  // 没写死，公式那侧是我假设的 854 宽 —— 以页面公布的 0.46 为准。）
  // ⚠ 4k 档（5.05 元/秒）不填：`VideoResolution` 里没有这个成员，产品也发不出去。
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: {
    amount: 0.14,
    unit: 'second',
    resolutionAmounts: { '480p': 0.065, '720p': 0.14, '1080p': 0.349 },
    source:
      '火山方舟定价页算例 720p·5s·无输入视频 = 4.97 元（汇率 7.1）；逐档 480p 0.46 / 720p 0.99 / 1080p 2.48 元/秒，与 token 公式互校',
    verifiedAt: '2026-07-31',
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: {
    amount: 0.14,
    unit: 'second',
    resolutionAmounts: { '480p': 0.065, '720p': 0.14, '1080p': 0.349 },
    source: '同 SEEDANCE_20_VOLCENGINE',
    verifiedAt: '2026-07-31',
  },

  // ── fal ────────────────────────────────────────────────────────────────
  // 全部取自 fal 公开索引 `fal.ai/api/models` 的 `pricingInfoOverride` 官方文本
  // （2026-08-08 实读）。⚠ 该接口能打，但 fal 的 HTML 模型页对脚本直连返 429。
  //
  // ⚠ 口径统一取 **720p、含音频**。Kling 与 Veo 的标价分「audio on/off」两档，
  // 这里取 audio on —— 与火山那几条（生成即含音频）可比。
  // ⚠ 分档只填 720p / 1080p —— fal 的 pricingInfoOverride 没给 480p 价，而
  // 目录里这两条是开着 480p 档的。480p 因此仍按缺价处理（预览显示「起」）。
  // 补它要回 fal 重新核一次价，不是照着 720p 打个折。
  [AI_MODELS.SEEDANCE_20]: {
    amount: 0.3034,
    unit: 'second',
    resolutionAmounts: { '720p': 0.3034, '1080p': 0.682 },
    source: 'fal pricingInfoOverride：720p $0.3034/s（1080p $0.682/s）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE]: {
    amount: 0.3034,
    unit: 'second',
    resolutionAmounts: { '720p': 0.3034, '1080p': 0.682 },
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
  // Kling 两条**没有分辨率旋钮**（send contract `resolution: false`），固定出
  // 1080p。填 `'1080p'` 不是为了让用户切档 —— 是把「这个数说的是哪一档」写死：
  // 今天它们的 `videoDefaults` 不带 resolution，解析器落到 720p 基准档拿到
  // `amount`（同一个数，没问题）；哪天有人给 videoDefaults 补上 `'1080p'`，
  // 没有这张表价格就会**凭空消失**。
  [AI_MODELS.KLING_V3_PRO]: {
    amount: 0.168,
    unit: 'second',
    resolutionAmounts: { '1080p': 0.168 },
    source:
      'fal pricingInfoOverride：audio on $0.168/s（audio off $0.112，voice control $0.196）',
    verifiedAt: '2026-08-08',
  },
  [AI_MODELS.KLING_O3_PRO]: {
    amount: 0.14,
    unit: 'second',
    resolutionAmounts: { '1080p': 0.14 },
    source: 'fal pricingInfoOverride：audio on $0.14/s（audio off $0.112）',
    verifiedAt: '2026-08-08',
  },
  // 退役条目（`available: false`），填了今天没人读 —— 但 fal 的标价原文就写着
  // 两档同价，现在填比将来复活时再回查便宜。
  [AI_MODELS.VEO_31]: {
    amount: 0.4,
    unit: 'second',
    resolutionAmounts: { '720p': 0.4, '1080p': 0.4 },
    source:
      'fal pricingInfoOverride：720p/1080p 含音频 $0.40/s（不含音频 $0.20；4k 含音频 $0.60）',
    verifiedAt: '2026-08-08',
  },
  // 两档全覆盖 —— 目录里 HappyHorse 只开 720p / 1080p，正好都有价。
  [AI_MODELS.HAPPYHORSE_10]: {
    amount: 0.14,
    unit: 'second',
    resolutionAmounts: { '720p': 0.14, '1080p': 0.18 },
    source: 'fal pricingInfoOverride：720p $0.14/s（1080p $0.18/s）',
    verifiedAt: '2026-08-08',
  },
  // Wan 3.0 —— fal 三个端点同价，所以 base 与 reference 是同一个数（本表的
  // 「参考端点与主端点同价」断言也要求如此）。
  // ⚠ 分辨率跨度是本表最大的一档：480p $0.05 / 720p $0.10 / 1080p $0.20。按
  // 口径取 720p，但 1080p 的实付是这个数的两倍 —— 价格预览要按用户选的档算，
  // 不能直接拿这个数乘时长（见 StudioCostPreview 的 resolution 处理）。
  [AI_MODELS.WAN_30]: {
    amount: 0.1,
    unit: 'second',
    resolutionAmounts: { '480p': 0.05, '720p': 0.1, '1080p': 0.2 },
    source:
      'fal 定价页：480p $0.05/s · 720p $0.10/s · 1080p $0.20/s（页面例子「5s 720p = $0.50」）',
    verifiedAt: '2026-08-25',
  },
  [AI_MODELS.WAN_30_REFERENCE]: {
    amount: 0.1,
    unit: 'second',
    resolutionAmounts: { '480p': 0.05, '720p': 0.1, '1080p': 0.2 },
    source: 'fal 定价页：与 text-to-video 同价，三端点不分档',
    verifiedAt: '2026-08-25',
  },

  // ── BytePlus ModelArk（国际站）─────────────────────────────────────────
  // 2026-08-23 补。BytePlus **按 token 计费**（公式：(输入视频时长 + 输出时长)
  // × 宽 × 高 × 帧率 / 1024），官方定价页另给一张 Price examples 表把 token
  // 换算成每秒/每条 —— 下面的每秒价直接抄官方例表，不是我推算的。720p·16:9·
  // 24fps = 21,600 tokens/秒，三个模型逐一对得上。
  //
  // ⚠ 该页是 SPA：WebFetch / 脚本直连只拿得到侧边栏，必须实跑浏览器等正文渲染。
  // ⚠ 下面全是**刊例价**。核价时页面上有两档限时折扣（2.5 仅 1080p 打 72 折至
  //   09-17；2.0 Fast 480p+720p 打 75 折至 09-07，720p 约 $0.09/s）——折扣不进
  //   本表，因为它会到期，而本表是长期比价基准。
  // ⚠ 「有视频输入」是另一套更低的费率且带最低 token 门槛；本表按文件头口径取
  //   **无视频输入**档。
  [AI_MODELS.SEEDANCE_25_BYTEPLUS]: {
    amount: 0.231,
    unit: 'second',
    source:
      'BytePlus ModelArk 定价页官方例表：720p·16:9·5s·无视频输入 = $1.156/条 → $0.231/s（费率 $10.70/M tokens）',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: {
    amount: 0.231,
    unit: 'second',
    source:
      '同 SEEDANCE_25_BYTEPLUS —— token 公式只数「输入视频时长 + 输出时长」，参考图不进计费，故两端点同价',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.SEEDANCE_20_BYTEPLUS]: {
    amount: 0.151,
    unit: 'second',
    source:
      'BytePlus ModelArk 定价页官方例表：720p·5s·无视频输入 = $0.76/条 → $0.151/s（费率 $7.0/M tokens）',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: {
    amount: 0.151,
    unit: 'second',
    source: '同 SEEDANCE_20_BYTEPLUS（参考图不进 token 计费）',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS]: {
    amount: 0.121,
    unit: 'second',
    source:
      'BytePlus ModelArk 定价页官方例表：720p·5s·无视频输入 = $0.60/条 → $0.121/s（刊例费率 $5.6/M tokens）',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]: {
    amount: 0.121,
    unit: 'second',
    source: '同 SEEDANCE_20_FAST_BYTEPLUS（参考图不进 token 计费）',
    verifiedAt: '2026-08-23',
  },

  // ── MiniMax H3（两站分开计价）───────────────────────────────────────────
  // 2026-08-23 补。⚠ **这四条不严格适用文件头的 720p 基准**：H3 根本没有 720p
  // 档，官方只有 768P 和 2K，而产品 `videoDefaults` 恒发 2K（video.ts:461/478/
  // 494/511）。按 owner 定的「**按产品默认档**」口径取 2K 价 —— 若改填 768P 价
  // 来凑 720p 可比性，标的就是产品根本发不出去的档，正是文件头警告过的「按低
  // 档位标价把它腰斩」。跨模型横比这四条时请记得它们是 2K。
  // ⚠ 两站价格**确实不同**（国际 $0.13 vs 国内 ≈$0.113，差约 13%），两个 adapter
  //   两套 key，不许共用一个数。
  // ⚠ 输入图片前 5 张免费、之后另计（国际 $0.04/张，国内 0.20 元/张），本表按
  //   文件头「不含参考图」口径不计。
  // ⭐ 这四条的 `resolutionAmounts` **不是可选补充，是必需的**：H3 没有分辨率
  // 旋钮，`videoDefaults.resolution` 恒发 `'2k'`，而 `getVideoUnitPricePerSecond`
  // 的兜底只认 720p 基准档。不写这张表，一个明明有价的模型会被判成「未标价」。
  // ⚠ 768P 档（$0.08 / 0.50 元）**故意不填**：产品发不出那一档，填了就是给一个
  // 用户永远选不到的档标价，反而会在将来误导比价。
  [AI_MODELS.MINIMAX_H3]: {
    amount: 0.13,
    unit: 'second',
    resolutionAmounts: { '2k': 0.13 },
    source:
      'MiniMax 国际站 Pay-as-you-go 定价页：MiniMax-H3 2K $0.13/秒（768P $0.08/秒）。⚠ 2K 档，非 720p',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.MINIMAX_H3_REFERENCE]: {
    amount: 0.13,
    unit: 'second',
    resolutionAmounts: { '2k': 0.13 },
    source: '同 MINIMAX_H3 —— 按输出秒数计价，与端点无关',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.MINIMAX_H3_CN]: {
    amount: 0.113,
    unit: 'second',
    resolutionAmounts: { '2k': 0.113 },
    source:
      'MiniMax 国内站 按量计费页：MiniMax-H3 2K 0.80 元/秒 ÷ 7.1 ≈ $0.113（768P 0.50 元/秒）。⚠ 2K 档，非 720p',
    verifiedAt: '2026-08-23',
  },
  [AI_MODELS.MINIMAX_H3_REFERENCE_CN]: {
    amount: 0.113,
    unit: 'second',
    resolutionAmounts: { '2k': 0.113 },
    source: '同 MINIMAX_H3_CN',
    verifiedAt: '2026-08-23',
  },

  // ══ 图片 ══════════════════════════════════════════════════════════════════
  // 2026-08-18 补（任务包 studio-workbench-redesign-2026-08-14 §4.11 切片 4：
  // owner 拍板「先把单价表补齐」再做成本预览）。口径见文件头「图片」那条 ——
  // 每条都按**产品实际发出去的尺寸**取档，不是按 UI 上的清晰度选项。

  // ── fal ────────────────────────────────────────────────────────────────
  // 有 pricingInfoOverride 的从 `fal.ai/api/models` 索引取（可脚本复核）；没有
  // 那段文本的从模型页正文取。两种来源在 source 里分别注明。
  [AI_MODELS.FLUX_2_PRO]: {
    amount: 0.03,
    unit: 'image',
    source:
      'fal pricingInfoOverride：$0.03 首个输出百万像素（+$0.015/额外百万像素，输入输出都算）。产品恒发 1024×1024=1MP → $0.03',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.FLUX_2_PRO_EDIT]: {
    amount: 0.045,
    unit: 'image',
    source:
      'fal pricingInfoOverride（与 flux-2-pro 同一段文本）：$0.03 首个输出百万像素 + $0.015/额外百万像素。⚠ 本条 requiresReferenceImage，$0.03 那个下限实际取不到 —— 基准取「1MP 输出 + 1 张 ≤1MP 参考图」= $0.045；参考图更大时按 $0.015/百万像素递增',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.FLUX_2_FLASH]: {
    amount: 0.005,
    unit: 'image',
    source:
      'fal 模型页：「Your request will cost $0.005 per megapixel」。产品恒发 1MP → $0.005',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.FLUX_LORA]: {
    amount: 0.035,
    unit: 'image',
    source:
      'fal 模型页：「$0.035 per megapixel. Images are billed by rounding up to the nearest megapixel」。产品恒发 1MP → $0.035',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.FLUX_KONTEXT_MAX]: {
    amount: 0.08,
    unit: 'image',
    source:
      'fal 模型页：「Your request will cost $0.08 per image」（无分辨率档位）',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.RECRAFT_V4_PRO]: {
    amount: 0.21,
    unit: 'image',
    source:
      'fal 模型页：「Your request will cost $0.21 per image」（无分辨率档位）',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.SEEDREAM_50_PRO]: {
    amount: 0.0675,
    unit: 'image',
    source:
      'fal pricingInfoOverride：「$0.0675 per image for images of total area ≤ 1536x1536」（1536²–2048² 档是 $0.135）。产品恒发 1024² → 低档位',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.SEEDREAM_50_LITE]: {
    amount: 0.035,
    unit: 'image',
    source:
      'fal 模型页：「Your request will cost $0.035 per image」（无分辨率档位）',
    verifiedAt: '2026-08-18',
  },

  // ── 火山方舟（cn）· Seedream 5.0 ───────────────────────────────────────
  // 官方「模型价格」页 图片生成模型 表（页面自报更新时间 2026.08.17）。
  // ⚠ 火山 adapter 发 2K 档 2048×2048 = 419 万像素，落 Pro 的「> 261 万像素」高档。
  [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE]: {
    amount: 0.085,
    unit: 'image',
    source:
      '火山方舟模型价格页 图片生成模型表：doubao-seedream-5-0-pro 单图生成 > 261 万像素（1.5K 以上）0.60 元/张 ÷ 7.1 ≈ $0.0845。⚠ 取高档位因为 adapter 恒发 2048×2048=419 万像素；低档位 0.30 元产品发不出去',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE]: {
    amount: 0.031,
    unit: 'image',
    source:
      '火山方舟模型价格页 图片生成模型表：doubao-seedream-5-0-lite 输出图 0.22 元/张（无像素分档，输入图免费）÷ 7.1 ≈ $0.0310',
    verifiedAt: '2026-08-18',
  },

  // ── Gemini（Google AI）─────────────────────────────────────────────────
  // 官方 pricing 页。三条互相校验：同一张 1K 图都是 1120 output tokens，
  // 乘各自的图片输出费率正好对上官方自己给的每张价 —— $120/$60/$30 每百万 token。
  // adapter 不发 imageSize，走官方默认 1K。
  [AI_MODELS.GEMINI_PRO_IMAGE]: {
    amount: 0.134,
    unit: 'image',
    source:
      'Gemini API pricing：「Output images from 1024x1024px (1K) and up to 2048x2048px (2K) consume 1120 tokens and are equivalent to $0.134 per image」（4K 档 $0.24）',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.GEMINI_FLASH_IMAGE]: {
    amount: 0.067,
    unit: 'image',
    source:
      'Gemini API pricing：「$0.045 per 0.5K image, $0.067 per 1K image, $0.101 per 2K image, $0.151 per 4K image」→ 默认 1K 档',
    verifiedAt: '2026-08-18',
  },
  [AI_MODELS.GEMINI_FLASH_LITE_IMAGE]: {
    amount: 0.0336,
    unit: 'image',
    source:
      'Gemini API pricing：「Equivalent to $0.0336 per 1K resolution image」（Standard 档；Batch 档 $0.0168）',
    verifiedAt: '2026-08-18',
  },

  // ── Replicate ──────────────────────────────────────────────────────────
  [AI_MODELS.ILLUSTRIOUS_XL]: {
    amount: 0.14,
    unit: 'image',
    source:
      'Replicate 模型页 delta-lock/noobai-xl：「This model costs approximately $0.14 to run on Replicate, or 7 runs per $1」（H100）。⚠ Replicate 按 GPU 秒计费，**不存在**固定单张价 —— 这是官方按实测耗时给的每次估算，不是我们算的近似值；实际会随出图耗时浮动',
    verifiedAt: '2026-08-18',
  },

  // ── ⬜ 待补 ───────────────────────────────────────────────────────────────
  //   【视频】
  //   · LTX 2.3 —— fal 索引里这条没有 pricingInfoOverride 文本，要开页面看
  //   · 火山的 2.0 fast 双条 —— 火山定价页只给了 2.0 的算例，fast 档单价未取到
  //     ⚠ 2026-08-18 顺带看到：火山页面现在同时挂着 fast / mini 的**限时折扣**
  //     （2.0-fast 75 折、2.0-mini 4 折，均至 9 月 7 日）。补这两条时要决定标刊例价
  //     还是折后价 —— 本表现有条目全是刊例价口径。
  //   · MiniMax H3 四条 / Gemini Omni —— 都不按 token 计费，得逐个抄官网标价，
  //     §9.6 的 token 推算法对它们不适用
  //   · BytePlus 全部 —— adapter 尚未接入（任务包 §3.9）。届时按 §9.6 推算：
  //     720p ≈ 21,600 tokens/秒 × $10.70/M = $0.231/s
  //
  //   【图片 · 2026-08-18 查过但**故意留空**，不是漏了】
  //   · OPENAI_GPT_IMAGE_2 —— 官方按 quality 分三档，1024²：low $0.006 /
  //     medium $0.053 / high $0.211（developers.openai.com 生图指南的算价表）。
  //     ⚠ **35 倍价差**，而我们的 adapter **不发 quality**（只有 advancedParams
  //     给了才发，Studio 图片面板不给）→ 落到 OpenAI 的 `auto`，官方没写 auto
  //     映射到哪一档。三个数里挑一个就是猜。**解锁条件**：产品把 quality 钉死
  //     一档（那时按对应档填），或 OpenAI 文档写明 auto 的映射。
  //   · SEEDREAM_50_VOLCENGINE（基础款 `doubao-seedream-5-0-260128`）——
  //     火山模型价格页的图片表只列了 `-pro` / `-lite` / 4-5 / 4-0 **四条，没有
  //     不带后缀的 5-0**。基础款按哪档计费官方未公开 → 留空。pro / lite 两条已补。
  //   · 五个 runner 模型（RunPod Serverless ComfyUI）—— 自托管按 GPU 秒计费，
  //     没有「每张多少钱」这种东西；要报价得先定义一个平均出图耗时，那就是猜。
}

/** 取模型单价；没有可信数据时返回 null，调用方应当隐藏价格而非显示占位。 */
export const getModelUnitPrice = (modelId: AI_MODELS): ModelUnitPrice | null =>
  MODEL_UNIT_PRICES[modelId] ?? null

/**
 * 同上，但按 string 查。
 *
 * 目录是 **DB-first**（`ModelConfig` 命中即覆盖代码常量），所以运行时会出现代码
 * 枚举里没有的 id —— `StudioModelOption.modelId` 因此是 string 而不是 `AI_MODELS`。
 * 断言成枚举等于假装它一定在表里。查不到返回 null，调用方隐藏价格。
 */
export const getModelUnitPriceByStringId = (
  modelId: string,
): ModelUnitPrice | null =>
  (MODEL_UNIT_PRICES as Record<string, ModelUnitPrice | undefined>)[modelId] ??
  null

/**
 * 视频：取**用户选中的那一档**的每秒单价。
 *
 * 返回 null = 这一档没有可信数据，调用方按缺价处理（显示「起」而不是等号）。
 * 只有两种情况给得出数：
 * 1. 该模型填了 `resolutionAmounts` 且命中这一档 —— 逐档核实过，精确；
 * 2. 选的正好是基准档 720p —— `amount` 本来就是这一档的价。
 *
 * ⛔ 其它档**不退回** `amount`。24 个有价视频模型里目前只有 Wan 3.0 逐档核过，
 * 拿 720p 的数去顶 1080p 会把 Seedance 2.0 说便宜 2.25 倍。宁可报「起」。
 */
export const getVideoUnitPricePerSecond = (
  modelId: string,
  resolution: VideoResolution,
): number | null => {
  const price = getModelUnitPriceByStringId(modelId)
  if (!price || price.unit !== 'second') return null

  const tiered = price.resolutionAmounts?.[resolution]
  if (tiered !== undefined) return tiered

  return resolution === VIDEO_UNIT_PRICE_BASE_RESOLUTION ? price.amount : null
}

/**
 * 金额显示格式。两位小数为主；小于 1 分的（如 FLUX 2 Flash 的 $0.005）退到三位，
 * 否则会被四舍五入成 `$0.01` —— 那是**翻倍**，正好把最便宜那档说贵一倍。
 * 尾随 0 去掉，`$0.030` 显示成 `$0.03`。
 */
export function formatUnitPriceAmount(amount: number): string {
  if (amount >= 0.01) return `$${amount.toFixed(2)}`
  return `$${amount.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
}
