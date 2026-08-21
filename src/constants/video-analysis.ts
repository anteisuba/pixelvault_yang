/**
 * 视频分析的旋钮与失败语义（AI 导演内核切片 2 §4.3 / §4.3.1 / §4.3.2）。
 *
 * 本文件管三件事：**哪个任务需要哪一档**（§4.3 第三条）、**抽帧策略**
 * （§4.3「通用退路」）、**超阈值怎么先降级再问**（§4.3.1）。
 *
 * @see src/services/vision/video-analysis-route.service.ts — 这些表的判定逻辑
 *
 * 🔬 Gemini 视觉 token **≈ 5,450 / 分钟，随时长线性**（18m41s = 101,923；
 * 1h00m02s = 326,504，两点算出来一致）。`videoMetadata` 是比「超阈值弹确认卡」
 * 便宜得多的两个旋钮：
 *
 * | 配置                                    | VIDEO token | 相对全片 |
 * | --------------------------------------- | ----------- | -------- |
 * | 全片 18m41s（默认帧率）                  | 101,923     | 100%     |
 * | `{ startOffset: 0, endOffset: 60 }`     | 5,460       | **5%**   |
 * | `{ fps: 0.2 }` 全片                      | 42,787      | 42%      |
 *
 * ✅ 2026-08-21：「先降级再问」已接线（`VIDEO_ANALYSIS_TASK_DOWNGRADES` +
 * `resolveNativeVideoWindow`）。下面这三个 `default*` 仍是**不指定时的默认**
 * （全片默认帧率）—— 降级是按任务算出来一个显式 window 传下去，不是改默认值：
 * 默认值改了就没人能要求「我就是要全片满帧」了。
 */

import {
  ASSISTANT_VIDEO_TIERS,
  type AssistantVideoTier,
} from '@/constants/assistant'
import { VISION_TASKS, VISION_TASK_VALUES } from '@/constants/vision'

export const VIDEO_ANALYSIS = {
  /** `null` = 用 provider 默认帧率。降档实测值是 0.2（见上表），本批不接线。 */
  defaultFps: null,
  /** `null` = 不裁，全片。裁窗单位是秒，序列化成 Gemini 要的 `"60s"`。 */
  defaultStartOffsetSeconds: null,
  defaultEndOffsetSeconds: null,
} as const

// ─── 任务 → 需要哪一档（§4.3 第三条）───────────────────────────

/**
 * 「你想从这个视频里知道什么」—— 路由的唯一输入。
 *
 * ⚠ **四个结构化任务直接复用 `VISION_TASKS` 的值，不另造一套词汇**：同一件事在
 * 两处各有一个名字，迟早会出现「视频线叫 style，图片线叫 style_study」这种要靠
 * 映射表连起来的局面，而映射表就是漂移的家。
 *
 * `conversational` 是第五个，也是**唯一不带 schema 的那个**：聊天里对着视频自由
 * 提问。它按最严的档算 —— 用户可能问运镜、问节奏、问动作有没有崩，而这三类
 * 🔬 帧序列里根本看不见（两帧之间发生了什么，帧本身不说）。§4.3 点名的
 * 「运镜 / 节奏 / 动作质量 → 要求 native」落的就是这一行。
 */
export const VIDEO_ANALYSIS_TASKS = {
  conversational: 'conversational',
  characterIdentity: VISION_TASKS.characterIdentity,
  styleStudy: VISION_TASKS.styleStudy,
  qualityReview: VISION_TASKS.qualityReview,
  compare: VISION_TASKS.compare,
} as const

export const VIDEO_ANALYSIS_TASK_VALUES = [
  VIDEO_ANALYSIS_TASKS.conversational,
  VIDEO_ANALYSIS_TASKS.characterIdentity,
  VIDEO_ANALYSIS_TASKS.styleStudy,
  VIDEO_ANALYSIS_TASKS.qualityReview,
  VIDEO_ANALYSIS_TASKS.compare,
] as const

export type VideoAnalysisTask = (typeof VIDEO_ANALYSIS_TASK_VALUES)[number]

/**
 * 每个任务**至少**需要哪一档。`Record` 穷举、⛔ 无 `default` ——
 * 加一个任务而忘了表态，编译期就红；兜底会让新任务安静地按最松的档跑。
 *
 * 「至少」是有序的：要 `frames` 的任务落到 `native` 路上照样成立（视频本体都在了），
 * 反过来不行。判定见 `assistantAdapterSatisfiesVideoTier`。
 */
export const VIDEO_ANALYSIS_TASK_TIERS: Record<
  VideoAnalysisTask,
  AssistantVideoTier
> = {
  // 自由提问 = 可能问运镜/节奏/动作 → 只有视频本体看得见。
  [VIDEO_ANALYSIS_TASKS.conversational]: ASSISTANT_VIDEO_TIERS.native,
  // 下面四个都是**静态观察**：角色长什么样、画风是什么、这一帧崩没崩、两张差在哪。
  // 🔬 owner 规则许可依据：「使用系统明确抽取的关键帧序列」合法（禁的是封面冒充）。
  [VIDEO_ANALYSIS_TASKS.characterIdentity]: ASSISTANT_VIDEO_TIERS.frames,
  [VIDEO_ANALYSIS_TASKS.styleStudy]: ASSISTANT_VIDEO_TIERS.frames,
  [VIDEO_ANALYSIS_TASKS.qualityReview]: ASSISTANT_VIDEO_TIERS.frames,
  // 一致性审片本质就是逐帧比对 —— frames 够用**且便宜**（§4.3）。
  [VIDEO_ANALYSIS_TASKS.compare]: ASSISTANT_VIDEO_TIERS.frames,
}

/** 带结构化 schema 的那几个（`conversational` 走聊天，没有 schema）。 */
export const VIDEO_ANALYSIS_STRUCTURED_TASK_VALUES = VISION_TASK_VALUES

// ─── 抽帧策略（§4.3「通用退路」）─────────────────────────────────

/**
 * **确定性抽帧**的全部参数。改这里的任何一个数都必须 `planVersion + 1`。
 *
 * ⭐ 为什么必须确定性（不是洁癖，是「建议模式」的前提）：将来审片循环会拿帧集
 * 判「这一版比上一版好还是坏」，而 owner 有权翻案 —— 翻案时他看的必须是模型当时
 * 看的**同一组帧**。随机采样（或「取最有代表性的 N 帧」这类自适应策略）意味着
 * 复跑一次结论可能就变了，而变的原因查不出来是模型抖动还是帧变了。
 * ⛔ 所以：不许随机、不许按内容自适应、不许「跳过黑帧再取一张」。
 *
 * `planVersion` 记进 `ResearchRun`，老行因此不会被新策略重新解释。
 */
export const VIDEO_FRAME_PLAN = {
  /**
   * 抽几帧。8 = 与 `ASSISTANT_MEDIA_LIMITS.maxReferences` / `VISION_LIMITS.maxMedia`
   * 同一个数 —— 一个帧集必须能整体当成一次分析的输入，三处各说各话时用户会撞见
   * 「抽得出来但分析不了」。
   */
  frameCount: 8,
  /** 改算法/改数就 +1，否则老 run 会被新策略重新解释。 */
  planVersion: 1,
  /**
   * 采样点 = 把片长切成 `frameCount` 段，各取**段中点**：
   * `t_k = (k + 0.5) × duration / frameCount`。
   *
   * ⚠ 为什么是中点而不是 `k × duration / (frameCount - 1)` 那种端点均分：
   *  - `t = 0` 常常是黑场/台标（`video-thumbnail.ts` 早就为此偏移了 0.1s）；
   *  - `t = duration` 在不同浏览器/容器上 seek 行为不一致（有的落到最后一帧，
   *    有的直接触发 `ended` 什么都不画）。
   * 中点两头都不碰，且每一帧代表的是「这一段」，语义比端点更好解释。
   */
  strategy: 'segment-midpoints',
  /** 时间戳保留到毫秒 —— 浮点尾差不能让同一个视频算出两组请求。 */
  timestampDecimals: 3,
} as const

export const VIDEO_FRAME_LIMITS = {
  /**
   * 服务端复算计划后允许的偏差。浏览器 seek 到的是**最近的可解码帧**，不是数学上
   * 的那一刻，所以要留容差；但容差存在不等于随便传 —— 超出就判 `NOT_DETERMINISTIC`，
   * 因为那说明客户端没按计划走，帧集也就不再可复跑。
   */
  timestampToleranceSeconds: 0.5,
  /** 单帧编码后的字节上限（客户端已按 maxEdgePixels 缩过，正常在 100KB 量级）。 */
  maxFrameBytes: 2_000_000,
  /** 长边像素上限。视觉模型本来就会把大图缩到自己的 tile 网格，多传是纯浪费。 */
  maxEdgePixels: 1024,
  /** 客户端编码格式与质量（`captureVideoThumbnail` 同款，webp 0.8）。 */
  encodeMimeType: 'image/webp',
  encodeQuality: 0.8,
  /** 客户端整套抽帧的墙钟上限 —— 一个损坏的容器不该让页面永远转圈。 */
  captureTimeoutMs: 30_000,
  /** 单次 seek 的等待上限。 */
  seekTimeoutMs: 8_000,
  /** 太短的视频抽 8 帧没意义（每段不到一帧），但仍然要给出结果。 */
  minDurationSeconds: 0.2,
} as const

/** 帧集在 R2 里的落点前缀。一次抽帧 = 一个目录，便于回看时整组取。 */
export const VIDEO_FRAME_STORAGE_PREFIX = 'vision-frames'

/** 帧证据的 id 前缀（run 内稳定，给 `[n]` 回填用）。 */
export const VIDEO_FRAME_EVIDENCE_ID_PREFIX = 'video-frame'

/**
 * 客户端送上来的帧集不符合确定性计划 / 不是真图片 / 超体量。
 *
 * ⚠ 这条**不是**用户操作错误，是客户端与服务端对不上账 —— 大声失败，别静默接受：
 * 接受了就等于 `ResearchRun` 里躺着一组「声称按计划抽、其实不是」的帧，
 * 而这正是复跑与翻案要依赖的东西。
 */
export const VIDEO_FRAMES_INVALID_ERROR = {
  code: 'VIDEO_FRAMES_INVALID',
  httpStatus: 400,
  i18nKey: 'errors.vision.framesInvalid',
  message:
    'The submitted frame set does not match the deterministic extraction plan.',
} as const

// ─── 成本杠杆（§4.3.1「先降级再问」）─────────────────────────────

/**
 * 🔬 实测（见文件头那张表）：裁 1 分钟 = 全片的 **5%**，`fps 0.2` = **42%**。
 *
 * ⛔ **不许一超时长就弹确认卡**：在有 5% 这个旋钮的前提下，弹卡只是白打断用户。
 * 确认卡留给唯一一种情况 —— 用户**明确要求**全片满帧分析运镜。
 */
export const VIDEO_ANALYSIS_DOWNGRADE = {
  /** 不到这个长度不降级（🔬 5 分钟 ≈ 27k VIDEO token，在助手一轮的预算内）。 */
  fullFrameMaxSeconds: 300,
  /** `clip` 档裁多长。取 60s —— 实测那一格就是 0:00–1:00。 */
  clipSeconds: 60,
  /** `reduceFps` 档的帧率。实测值，别拍脑袋改。 */
  reducedFps: 0.2,
} as const

export const VIDEO_ANALYSIS_DOWNGRADE_MODES = {
  /** 裁前 N 秒。**代价是后面没看** —— 只给「看一眼就知道」的静态任务用。 */
  clip: 'clip',
  /** 全片但降帧率。**代价是快动作会漏** —— 给需要覆盖整段时间轴的任务用。 */
  reduceFps: 'reduce_fps',
} as const

export type VideoAnalysisDowngradeMode =
  (typeof VIDEO_ANALYSIS_DOWNGRADE_MODES)[keyof typeof VIDEO_ANALYSIS_DOWNGRADE_MODES]

/**
 * 超阈值时按任务降哪一档。⛔ 穷举无兜底。
 *
 * 分法只有一句话：**任务在乎「整段时间轴」还是在乎「长什么样」**。
 * 自由提问可能问到片尾的剪辑点，裁掉后半段等于答错；而「这个角色长什么样」
 * 在第一分钟里就看得完，降帧率反而是把钱花在重复的画面上。
 */
export const VIDEO_ANALYSIS_TASK_DOWNGRADES: Record<
  VideoAnalysisTask,
  VideoAnalysisDowngradeMode
> = {
  [VIDEO_ANALYSIS_TASKS.conversational]:
    VIDEO_ANALYSIS_DOWNGRADE_MODES.reduceFps,
  [VIDEO_ANALYSIS_TASKS.characterIdentity]: VIDEO_ANALYSIS_DOWNGRADE_MODES.clip,
  [VIDEO_ANALYSIS_TASKS.styleStudy]: VIDEO_ANALYSIS_DOWNGRADE_MODES.clip,
  [VIDEO_ANALYSIS_TASKS.qualityReview]: VIDEO_ANALYSIS_DOWNGRADE_MODES.clip,
  // 一致性审片要看的正是「有没有越到后面越漂」——裁掉后半段等于把题目删了。
  [VIDEO_ANALYSIS_TASKS.compare]: VIDEO_ANALYSIS_DOWNGRADE_MODES.reduceFps,
}

/**
 * ⚠ **坑 1（§4.3.2，实测踩过）**：thinking token 从 `maxOutputTokens` 里扣。
 * 给 800 实测得到 `thoughtsTokenCount=765` / 正文 31 字 / `finishReason=MAX_TOKENS`
 * —— 表现是「视频分析回了半句就没了」，极易误判成模型不行或视频太长。
 * 所以**带视频的那一轮**，显式输出预算低于这个数就抬到这个数（只抬不降）。
 *
 * 助手路本身送的是 `providerManagedOutput: true`（根本不发 `maxOutputTokens`，
 * 由模型自己的上限兜着，远高于 3000），这条闸是给**显式指定预算**的调用方兜底的。
 */
export const VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS = 3000

/**
 * ⚠ **坑 2（§4.3.2，实测踩过）**：`fileUri` 指向的视频不可访问时 Gemini 回
 * **403 PERMISSION_DENIED**，不是 404。直译给用户就成了「你的 API key 没权限」，
 * 会把人引去查 key —— 这正是 §3.4 第 1 闸「失败语义要分开」在视觉线的落点。
 */
export const VIDEO_ANALYSIS_UNREACHABLE_ERROR = {
  code: 'ASSISTANT_VIDEO_UNREACHABLE',
  /**
   * 对客户端回 422 而不是原样透传 403：403 在我们自己的信封里读起来仍然是
   * 「你没权限」，那就等于没修。422 = 这条输入我们处理不了。
   */
  httpStatus: 422,
  i18nKey: 'errors.assistant.videoUnreachable',
  message:
    'The linked video is not reachable — it may be private, deleted, or region-locked. This is not an API key problem.',
} as const
