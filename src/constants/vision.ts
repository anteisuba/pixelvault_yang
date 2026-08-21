/**
 * Vision Analyzer 的全部配置（AI 导演内核 · 切片 2 · §4.1）。
 *
 * 这条线统一了项目里**两条互不相识的图片理解链**：
 *  - `image-analysis.service.ts` 的五维 dimensions（只回前端不落库，DB 仅存反推 prompt）
 *  - `character-card.service.ts` 的 `extractCharacterAttributes`（不写 ImageAnalysis 表）
 *
 * 统一后的语义只有一句：**按任务出结构化观察，落 `ResearchRun`，不写 `CharacterCard`**
 * （边界 13 角色卡冻结）。
 *
 * ⚠ **视觉线不联网** —— `grounded` 恒为 `false`，`basis` 恒不含 `'source'`。
 * 这是硬语义不是默认值：`source` 的含义是「某个可点开的外部出处这么说」，
 * 而看图看到的东西没有出处，只有观察者。写成 true 会让 UI 的
 * 「已取得联网证据」badge 对着一张图撒谎。
 */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  ASSISTANT_MEDIA_CAPABILITIES,
  assistantAdapterSupportsImage,
} from '@/constants/assistant'
import {
  RESEARCH_CONCLUSION_BASES,
  RESEARCH_GOALS,
  RESEARCH_SOURCE_IDS,
  EVIDENCE_SOURCE_TIERS,
  type ResearchGoal,
} from '@/constants/research'

// ─── 任务 ───────────────────────────────────────────────────────

/**
 * 视觉任务枚举。
 *
 * **可扩展但穷举**：下面每一张按任务分档的表都写成 `Record<VisionTask, …>` ——
 * 加一个任务而漏了某张表，编译期就红。⛔ 一律不写 `default:` 分支：
 * 兜底会把「漏配了」变成「安静地按别的任务跑」。
 */
export const VISION_TASKS = {
  /** 身份特征（稳定层）/ 可变层 / 画风 —— 角色卡与「这是谁」类问题的落点。 */
  characterIdentity: 'character_identity',
  /** 画风轴：媒介、笔触、色彩、光照、线条、构图。 */
  styleStudy: 'style_study',
  /** 质量与缺陷：解剖 / 手脸眼 / 构图 / 画风漂移。将来审片循环的入口。 */
  qualityReview: 'quality_review',
  /** 多图差异：同一角色/同一提示词的两张或多张之间差在哪。 */
  compare: 'compare',
} as const

export const VISION_TASK_VALUES = [
  VISION_TASKS.characterIdentity,
  VISION_TASKS.styleStudy,
  VISION_TASKS.qualityReview,
  VISION_TASKS.compare,
] as const

export type VisionTask = (typeof VISION_TASK_VALUES)[number]

/**
 * 任务 → `ResearchRun.goal`。
 *
 * ⚠ 值取自**现有的** `RESEARCH_GOALS`，不新造一个视觉专用 goal：`goal` 是检索线
 * 与视觉线共用的一列，多一个只在一条线上出现的值，等于让读这张表的人每次都要
 * 先判断「这行是哪条线写的」。`compare` 归到 `review_shot` —— 比较多张出图本来
 * 就是审片动作的一种，不是第三件事。
 */
export const VISION_TASK_GOALS: Record<VisionTask, ResearchGoal> = {
  [VISION_TASKS.characterIdentity]: RESEARCH_GOALS.analyzeCharacter,
  [VISION_TASKS.styleStudy]: RESEARCH_GOALS.studyStyle,
  [VISION_TASKS.qualityReview]: RESEARCH_GOALS.reviewShot,
  [VISION_TASKS.compare]: RESEARCH_GOALS.reviewShot,
}

/** 每个任务最少要几张图。`compare` 一张图无从比起 —— 这是结构闸不是提示词请求。 */
export const VISION_TASK_MIN_MEDIA: Record<VisionTask, number> = {
  [VISION_TASKS.characterIdentity]: 1,
  [VISION_TASKS.styleStudy]: 1,
  [VISION_TASKS.qualityReview]: 1,
  [VISION_TASKS.compare]: 2,
}

// ─── basis（§3.4 第 3 闸的视觉线版本）───────────────────────────

/**
 * 视觉线的三态 basis。
 *
 * ⚠ **没有 `source`**：那一档的含义是「某个可点开的外部出处这么说」，看图得不到
 * 出处。检索线的四态里去掉一个，不是复制一份新枚举 —— 值本身仍来自
 * `RESEARCH_CONCLUSION_BASES`，所以两条线的结论落进同一列时是同一套词汇。
 */
export const VISION_BASIS_VALUES = [
  RESEARCH_CONCLUSION_BASES.observation,
  RESEARCH_CONCLUSION_BASES.inference,
  RESEARCH_CONCLUSION_BASES.unknown,
] as const

export type VisionBasis = (typeof VISION_BASIS_VALUES)[number]

/**
 * 「具体断言」允许的 basis —— **只有看见和不知道两种**。
 *
 * 🔬 切片 0 实测的教训（§3.4 第 3 闸）：模型先声明「我无法实时获取」，然后仍给出
 * 「大约 1,500 到 2,500 张」（真值 3,644）。**声明不确定不豁免编造**。所以凡是
 * 具体的数字 / 日期 / 名称 / 称号，schema 层直接把 `inference` 拿掉 ——
 * 让它在类型上就说不出口，比在提示词里求它别说可靠。
 */
export const VISION_CONCRETE_BASIS_VALUES = [
  RESEARCH_CONCLUSION_BASES.observation,
  RESEARCH_CONCLUSION_BASES.unknown,
] as const

export type VisionConcreteBasis = (typeof VISION_CONCRETE_BASIS_VALUES)[number]

/**
 * 自由描述里出现这些形态就按「具体断言」处理（同样禁 `inference`）。
 *
 * 只认阿拉伯数字与全角数字：一句「三个人」漏网是可以接受的代价，
 * 而把「a warm palette」误判成数值断言会让正常的描述性推断全部打回重试。
 */
export const VISION_CONCRETE_VALUE_PATTERN = /[0-9０-９]/

// ─── 质量审查的缺陷分类 ─────────────────────────────────────────

export const VISION_DEFECT_CATEGORIES = {
  anatomy: 'anatomy',
  hands: 'hands',
  face: 'face',
  eyes: 'eyes',
  composition: 'composition',
  styleDrift: 'style_drift',
  artifacts: 'artifacts',
  text: 'text',
} as const

export const VISION_DEFECT_CATEGORY_VALUES = [
  VISION_DEFECT_CATEGORIES.anatomy,
  VISION_DEFECT_CATEGORIES.hands,
  VISION_DEFECT_CATEGORIES.face,
  VISION_DEFECT_CATEGORIES.eyes,
  VISION_DEFECT_CATEGORIES.composition,
  VISION_DEFECT_CATEGORIES.styleDrift,
  VISION_DEFECT_CATEGORIES.artifacts,
  VISION_DEFECT_CATEGORIES.text,
] as const

export type VisionDefectCategory =
  (typeof VISION_DEFECT_CATEGORY_VALUES)[number]

export const VISION_DEFECT_SEVERITIES = {
  low: 'low',
  medium: 'medium',
  high: 'high',
} as const

export const VISION_DEFECT_SEVERITY_VALUES = [
  VISION_DEFECT_SEVERITIES.low,
  VISION_DEFECT_SEVERITIES.medium,
  VISION_DEFECT_SEVERITIES.high,
] as const

export type VisionDefectSeverity =
  (typeof VISION_DEFECT_SEVERITY_VALUES)[number]

// ─── 路由（借路）─────────────────────────────────────────────────

/**
 * 借路时先问谁。
 *
 * ⚠ 这**不是**第二张能力表，只是排序 —— 成员资格仍然只由
 * `ASSISTANT_MEDIA_CAPABILITIES` 说了算（见下面的 `VISION_CAPABLE_ADAPTERS`）。
 * Gemini 排前面是跟着仓里既有的两处顺位走：`llm-text.service` 的自动回落
 * （`LLM_TEXT_ADAPTERS` 以 Gemini 打头）与 `research-route.service` 的
 * `GROUNDING_CAPABLE_ADAPTERS`。平台兜底 key 也是 Gemini —— 三处一致，
 * 用户不会因为「哪条路借的」而看到不同的模型行为。
 */
const VISION_ADAPTER_PREFERENCE: readonly AI_ADAPTER_TYPES[] = [
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
]

/**
 * 谁能吃图 —— **从 `ASSISTANT_MEDIA_CAPABILITIES` 推导，不另立一张表**。
 *
 * 项目里已经有一张「谁能看图 / 谁能看视频」的能力矩阵，助手附件那条路在用它。
 * 视觉线再抄一份的下场是可预期的：某天给某个 provider 开了看图，两张表只改一张，
 * 于是「助手能看图但结构化分析说它不能」。
 *
 * 排过序的成员没进 `VISION_ADAPTER_PREFERENCE` 也不会掉队 —— 它们接在后面，
 * 所以新开一个能看图的 provider **只需要改矩阵那一处**。
 */
export const VISION_CAPABLE_ADAPTERS: readonly AI_ADAPTER_TYPES[] = (() => {
  const capable = (
    Object.keys(ASSISTANT_MEDIA_CAPABILITIES) as AI_ADAPTER_TYPES[]
  ).filter(assistantAdapterSupportsImage)
  const preferred = VISION_ADAPTER_PREFERENCE.filter((adapterType) =>
    capable.includes(adapterType),
  )
  return [
    ...preferred,
    ...capable.filter((adapterType) => !preferred.includes(adapterType)),
  ]
})()

/**
 * 都借不到时的平台兜底 key 用哪个 adapter。
 * 与 `research-route.service.ts` 的 `findGroundingRoute` 同一个选择。
 */
export const VISION_PLATFORM_FALLBACK_ADAPTER = AI_ADAPTER_TYPES.GEMINI

/**
 * 一条都借不到时的结构化错误。
 *
 * ⛔ **不静默降级成「用文本模型瞎猜」** —— 那会产出一份看起来完整、实际一眼没看过
 * 图的观察，比报错坏得多。Hard Rule 8：不禁用 UI，把用户引到 `QuickSetupDialog`
 * 内联配置一把能看图的 key。
 *
 * ⚠ `normalizeI18nKey` 会剥掉 `errors.` 前缀 —— 文案批要建的节点是
 * **`Errors.vision.noCapableRoute`**，别照字面建小写 `errors`（切片 1 踩过）。
 */
export const VISION_NO_CAPABLE_ROUTE_ERROR = {
  errorCode: 'VISION_NO_CAPABLE_ROUTE',
  httpStatus: 400,
  i18nKey: 'errors.vision.noCapableRoute',
  message:
    'No image-capable model is available. Add a Gemini or OpenAI key to analyze images.',
} as const

/** 结构化输出两次都不合规。打回重试是 `withRetry` 的活，这是它最终放弃时的错。 */
export const VISION_INVALID_OUTPUT_ERROR = {
  errorCode: 'VISION_INVALID_OUTPUT',
  httpStatus: 502,
  i18nKey: 'errors.vision.invalidOutput',
  message: 'The vision model returned an unusable analysis. Please try again.',
} as const

// ─── 证据 ───────────────────────────────────────────────────────

/**
 * 视觉输入落进 `ResearchRun.evidence` 时用哪个 `sourceId`。
 *
 * ✅ 2026-08-21 已改为专属的 `vision_input`（原先借 `url_reader` 是将就，会让
 * 「用户传的图」和「我们去读的网页」在回看时混成一类）。它**不是可打的源**——
 * 视觉线恒 `grounded:false` / `perSource:[]`，别把它排进并发检索。
 */
export const VISION_EVIDENCE_SOURCE_ID = RESEARCH_SOURCE_IDS.visionInput
export const VISION_EVIDENCE_SOURCE_TIER = EVIDENCE_SOURCE_TIERS.official

/** 证据条目 id 前缀（run 内稳定，用来给 `[n]` 回填）。 */
export const VISION_EVIDENCE_ID_PREFIX = 'vision-input'

// ─── 体量 / 超时 ────────────────────────────────────────────────

export const VISION_LIMITS = {
  /**
   * 一次分析最多几张图。跟助手附件的 `maxReferences` 对齐（8）——
   * 同一批图在两条路上有两个上限，用户会撞见「附件挂得上但分析不了」。
   */
  maxMedia: 8,
  /** 单个媒体 URL 的长度上限。与 `ASSISTANT_MEDIA_LIMITS.maxUrlLength` 同值。 */
  maxUrlLength: 4000,
  /** 用户附加说明的截断长度（进 user prompt，仍过 prompt-guard 的注入扫描）。 */
  instructionChars: 600,
  /** 单条断言的文本长度上限。 */
  claimChars: 400,
  /**
   * 反推分析里单个 dimension 描述的长度上限（`image-analysis.service.ts`）。
   * 比断言宽得多 —— 它的产物是要直接拼进生成提示词的整段描述，不是一句观察。
   */
  dimensionChars: 4000,
  /** 每个列表字段最多几条。 */
  maxListItems: 20,
  /** `uncertainties[]` 最多几条。 */
  maxUncertainties: 12,
  /** 结构化输出的 token 预算。观察比剧本短得多，但多图比较会长。 */
  maxTokens: 2400,
  /**
   * 单次模型调用的墙钟上限。路由 `maxDuration = 60`，而 `withRetry` 最多打两次
   * —— 两次 25 秒 + 退避仍在预算内；不设这道闸的话一次挂起就把整条请求拖成 504。
   */
  timeoutMs: 25_000,
  /**
   * **native 档视频**那一支的墙钟上限（切片 2 §4.3）。
   *
   * ⚠ 别拿 25 秒去卡视频：🔬 实测一条 18 分钟的片子光 VIDEO token 就 10 万，
   * provider 侧的处理时间和图片完全不是一个量级，25 秒的表现会是「每次都超时」
   * 而看起来像模型坏了。配套的路由 `maxDuration = 300`，两次 120 秒 + 退避装得下。
   */
  videoTimeoutMs: 120_000,
  /**
   * 结构化输出的重试次数。照 `node-script-doc.service.ts` 的形态：
   * **打回重试一次就够** —— 同一个模型同一份提示词连错两次，第三次不会变对。
   */
  maxAttempts: 2,
  /** 重试退避基数（与 script-doc 线同值）。 */
  retryBaseDelayMs: 800,
} as const

/**
 * `POST /api/vision/analyze`。
 *
 * ⚠ 放这里而不是 `constants/config.ts` 的 `API_ENDPOINTS`：那个文件本轮有别的
 * 会话在改，两边同时动同一张表必撞。合批时把这一行挪进 `API_ENDPOINTS` 即可，
 * 消费方只认这个常量名。
 */
export const VISION_ANALYZE_ENDPOINT = '/api/vision/analyze'

/**
 * `POST /api/vision/analyze-video`（切片 2 §4.3）。
 *
 * 与上面同一个理由放在这里而不是 `API_ENDPOINTS`。**一个端点吃两条腿**
 * （带帧集 = frames 档，不带 = native 档），路由判定在
 * `resolveVideoAnalysisRoute` 一处 —— 分成两个端点就是把同一个闸写两遍。
 */
export const VISION_ANALYZE_VIDEO_ENDPOINT = '/api/vision/analyze-video'
