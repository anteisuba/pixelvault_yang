import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * 助手正文的「打字机」节奏（owner 2026-08-18 定的统一标准）。
 *
 * **传输和呈现解耦**：provider 给的是逐 token 的 SSE 还是一整块缓冲，呈现层一律
 * 是「思考中 → 一个字一个字打出来」。这样能力矩阵（谁支持 SSE）不会泄漏成三种
 * 不同的体验，也把渲染次数从「provider 的 chunk 个数」换成「动画自己的节奏」。
 */
export const ASSISTANT_TYPEWRITER = {
  /** 每一拍的间隔。约 30fps —— 再快肉眼收益递减，只多烧渲染。 */
  tickMs: 33,
  /** 每拍至少吐一个字，短回复也有打字感而不是一次蹦完。 */
  minCharsPerTick: 1,
  /**
   * **每拍最多吐几个字 —— 决定「像打字」还是「像跳字」的就是这一条。**
   *
   * owner 2026-08-18 实测反馈「字跳得太快」：当时没有上限，积压大时一拍吐十几个
   * 字，速率其实不高（约 52 字/秒）但**粒度**太粗，看起来是一块一块蹦出来的。
   * 压到 2 之后上限约 71 字/秒，肉眼是连续的打字而不是跳。
   *
   * ⚠ 想调快慢先动 `tickMs`，别动这个 —— 放大它会直接把打字感换回跳字感。
   */
  maxCharsPerTick: 2,
  /**
   * 落后越多吐得越快：每拍吐 `pending/divisor`，再夹在 min/max 之间。
   * 缓冲式 provider 会一次塞进整段，没有这条就会慢慢爬到天荒地老。
   */
  backlogDivisor: 50,
  /**
   * 追平积压的时间上限。超长回答（数千字）按 max 2 字/帧要跑四十多秒 —— 数据早
   * 就到了却让人干等，这是另一种坏。超过这个预算就允许放大步长：**宁可那种极端
   * 长度看起来跳一点，也不让人等**。常见长度（几百字）落不到这条上，仍是 2 字/帧。
   */
  maxDrainMs: 12_000,
} as const

/**
 * 工作台状态块的体量上限（§3.0b）。
 *
 * 目的是**便宜地防幻觉**：把应用自己知道的事实喂进上下文，别让模型猜、更别让用户
 * 口述。既然是「便宜」，就不能反过来吃掉上下文——所以每一项都有硬上限。
 *
 * ⚠ 三条实测依据（子 agent 2026-08-20 盘点）：
 *  - 缩略图 URL 每条 ~120 字符，**一律不发**：纯文本模型看不了图，当句柄用也没人
 *    消费，8 张的批次光 URL 就 ~1000 字符。要看图走附件引用那条路。
 *  - 用户 prompt 的 UI 上限是 2000、请求边界 32000，**不能信**，必须自己截。
 *  - 逐项只留「模型名 / 状态 / seed」，按模型聚合计数，整块稳定落在几百字。
 */
export const ASSISTANT_WORKBENCH_STATE_LIMITS = {
  /** 提示词 / 负面提示词各自的截断长度。 */
  promptChars: 400,
  /** 最近一批生成里那条提示词的截断长度（比编辑器里的更短，它只是回顾）。 */
  runPromptChars: 200,
  /** 最多列几条 LoRA 挂载明细。 */
  maxLoraMounts: 12,
  /** 最多列几个模型的聚合计数。 */
  maxRunModels: 8,
  /** 单个自由文本字段（模型名、家族名等）的截断长度。 */
  labelChars: 80,
  /**
   * 最多列几个「现在能选的模型」。
   *
   * ⚠ 这张表是**为了让 `[[setup]]` 的选模型提案落到实处**才加的 —— 不告诉模型
   * 有哪些 id 可选，它只会编一个，chip 于是永远不出现，看起来像功能坏了。
   * 列表只放用户真的能跑的（有 key 或 provider 有 key），推荐一个跑不了的
   * 等于把人推去配置页，不是帮忙。
   */
  maxCatalogModels: 24,
} as const

export const ASSISTANT_MEDIA_LIMITS = {
  /**
   * **送进模型的上限**。超出的部分由 `getAssistantMediaInputs` 截断，并把丢了
   * 几个如实告诉模型（模型被要求主动说出来），不是静默丢弃。
   */
  maxReferences: 8,
  /**
   * **请求体的绝对天花板**，只用于 Zod 校验，比 `maxReferences` 宽。
   *
   * ⚠ 两个数是两件事，别合并：schema 若也卡 8，第 9 个附件会让**整轮对话** 400
   * （用户连打好的字一起丢掉），而且吐的是 Zod 的英文裸串。放宽之后，9–32 走
   * 「截断 + 告知」那条体面路径；超过 32 才判为异常载荷拒掉，防滥用的作用仍在。
   */
  maxReferencesPayload: 32,
  maxUrlLength: 4000,
  maxLabelLength: 160,
  maxVideoBytes: 50 * 1024 * 1024,
  geminiInlineMaxBytes: 20 * 1024 * 1024,
  geminiFilePollIntervalMs: 1000,
  geminiFilePollTimeoutMs: 60_000,
} as const

/**
 * 「能看视频」有两档，不是一个布尔（AI 导演内核 · 切片 2 · §4.3）。
 *
 * 布尔的问题是它把两件成本、覆盖面、可复现性都不同的事压成了同一个 true：
 *  - `native` = **视频本体**进模型（Gemini `fileData` / `inlineData`）。运镜、节奏、
 *    动作连贯性只有这一档看得见 —— 帧序列里两帧之间发生了什么，帧本身不说。
 *    代价是 🔬 实测 ≈5,450 token/分钟，随时长线性。
 *  - `frames` = 看不了视频本体，但能吃图。由抽帧管线把视频变成 N 张**确定性**
 *    关键帧再当图片送进去。一致性审片、画风、角色长相这类静态观察它够用，
 *    而且便宜、可复跑（同一个视频＋同一份参数 → 同一组帧）。
 *
 * ⚠ **`false` 是「连图都吃不了」**，不是「只是没接视频」：`frames` 档的前提就是
 * `image: true`，所以纯文本模型永远是 `false`。
 */
export const ASSISTANT_VIDEO_TIERS = {
  native: 'native',
  frames: 'frames',
} as const

export type AssistantVideoTier =
  (typeof ASSISTANT_VIDEO_TIERS)[keyof typeof ASSISTANT_VIDEO_TIERS]

export interface AssistantMediaCapability {
  image: boolean
  /** `false` = 一档都没有。两档的区别见 `ASSISTANT_VIDEO_TIERS`。 */
  video: AssistantVideoTier | false
}

/**
 * ⚠ **`video` 的档位跟着 `image` 走**：能吃图就至少是 `frames`（抽帧管线把视频
 * 降级成图，不需要 provider 那边有任何新能力），吃不了图就只能是 `false`。
 * 新开一个 provider 时先把 `image` 定对，`video` 只在**实测过视频直传**之后
 * 才允许写 `native`。
 *
 * 🔬 Qwen（DASHSCOPE）的 DashScope 原生视频分支 **owner 2026-08-21 拍板本轮跳过**
 * （缺 key 无法实测，不拿没测过的形态当能力）。它按图片能力归档即可。
 * ⚠ 注意它此刻 `image: false` —— `llm-text.service.ts` 的 dashscope 分支其实
 * 已经支持图片输入（VL 模型），这张表里的 false 是另一件事（助手路由默认模型
 * 未必是 VL 档），**要翻它得先实测，别顺手改**。
 */
export const ASSISTANT_MEDIA_CAPABILITIES: Record<
  AI_ADAPTER_TYPES,
  AssistantMediaCapability
> = {
  [AI_ADAPTER_TYPES.OPENAI]: {
    image: true,
    video: ASSISTANT_VIDEO_TIERS.frames,
  },
  [AI_ADAPTER_TYPES.GEMINI]: {
    image: true,
    video: ASSISTANT_VIDEO_TIERS.native,
  },
  [AI_ADAPTER_TYPES.DEEPSEEK]: { image: false, video: false },
  [AI_ADAPTER_TYPES.ANTHROPIC]: { image: false, video: false },
  // grok-4.6 takes `text, image → text` (20MiB, jpg/png), and
  // `xaiTextCompletion` sends images as OpenAI multimodal content parts — so
  // this `true` is backed by a real code path, not just a spec sheet.
  [AI_ADAPTER_TYPES.XAI]: { image: true, video: false },
  [AI_ADAPTER_TYPES.DASHSCOPE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.VOLCENGINE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.BYTEPLUS]: { image: false, video: false },
  [AI_ADAPTER_TYPES.MINIMAX]: { image: false, video: false },
  [AI_ADAPTER_TYPES.MINIMAX_CN]: { image: false, video: false },
  [AI_ADAPTER_TYPES.HUGGINGFACE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.FAL]: { image: false, video: false },
  [AI_ADAPTER_TYPES.RUNWAY]: { image: false, video: false },
  [AI_ADAPTER_TYPES.REPLICATE]: { image: false, video: false },
  // NovelAI is an image generator (BYOK), not an assistant LLM. The
  // assistant can *recommend* NovelAI catalog ids via workbench state;
  // it cannot route chat/vision through this adapter.
  [AI_ADAPTER_TYPES.NOVELAI]: { image: false, video: false },
  [AI_ADAPTER_TYPES.FISH_AUDIO]: { image: false, video: false },
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: { image: false, video: false },
  [AI_ADAPTER_TYPES.RUNNER]: { image: false, video: false },
  [AI_ADAPTER_TYPES.ELEVENLABS]: { image: false, video: false },
}

/**
 * Adapter defaults describe the first assistant model for that provider. A
 * provider may also expose a tier with a different modality contract; those
 * exceptions live here so selecting one tier never changes its siblings.
 */
const ASSISTANT_MODEL_MEDIA_CAPABILITIES: Readonly<
  Partial<Record<string, AssistantMediaCapability>>
> = {
  [LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_FLASH_VISION_EXP]: {
    image: true,
    video: ASSISTANT_VIDEO_TIERS.frames,
  },
}

function getAssistantMediaCapability(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): AssistantMediaCapability {
  return (
    (modelId ? ASSISTANT_MODEL_MEDIA_CAPABILITIES[modelId] : undefined) ??
    ASSISTANT_MEDIA_CAPABILITIES[adapterType]
  )
}

export function assistantAdapterSupportsImage(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): boolean {
  return getAssistantMediaCapability(adapterType, modelId).image
}

/** 这条路能把视频看到哪一档。`false` = 一档都不行。 */
export function assistantAdapterVideoTier(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): AssistantVideoTier | false {
  return getAssistantMediaCapability(adapterType, modelId).video
}

/**
 * 「这条路能不能满足我要的那一档」。
 *
 * ⚠ **调用方必须显式说出自己要哪一档** —— 老的 `assistantAdapterSupportsMedia(
 * adapter, 'video')` 之所以要删掉，就是因为它让「问运镜」和「逐帧比对」共用一个
 * 答案：前者只有 `native` 做得到，后者 `frames` 就够。合成一个布尔的表现是
 * 二选一的坏结果 —— 要么把能抽帧的模型也拒掉，要么让抽帧档去回答运镜问题。
 *
 * 档位是有序的：`native` 能满足 `frames`（视频本体都在了，逐帧比对当然做得到），
 * 反过来不成立。
 */
export function assistantAdapterSatisfiesVideoTier(
  adapterType: AI_ADAPTER_TYPES,
  requiredTier: AssistantVideoTier,
  modelId?: string,
): boolean {
  const tier = assistantAdapterVideoTier(adapterType, modelId)
  if (tier === false) return false
  if (requiredTier === ASSISTANT_VIDEO_TIERS.native) {
    return tier === ASSISTANT_VIDEO_TIERS.native
  }
  return true
}

/**
 * 附件闸的读法：这条路收不收这种附件。
 *
 * `requiredVideoTier` 对 `kind: 'image'` 不起作用（图片只有一档），但仍然是必填 ——
 * 一个只在某个分支起作用的参数比一个隐式默认好：调用方写下 `'native'` 的那一刻
 * 就等于声明了「我要把视频原样送进去」。
 */
export function assistantAdapterAcceptsReferenceKind(
  adapterType: AI_ADAPTER_TYPES,
  kind: 'image' | 'video',
  requiredVideoTier: AssistantVideoTier,
  modelId?: string,
): boolean {
  return kind === 'image'
    ? assistantAdapterSupportsImage(adapterType, modelId)
    : assistantAdapterSatisfiesVideoTier(
        adapterType,
        requiredVideoTier,
        modelId,
      )
}

/**
 * 「这条路吃不了这种附件」的结构化错误 —— **三个抛出点共用一份**
 * （`prompt-assistant` / `node-assistant` / 视频分析路由）。
 *
 * ⚠ 原来三处各写各的字面量，`errorCode` 还是靠 `ASSISTANT_${kind.toUpperCase()}_UNSUPPORTED`
 * 拼出来的 —— 同一个错三份定义，改一处就是漂移。
 *
 * ⚠ `i18nKey` 一字未改：`normalizeI18nKey` 会剥掉 `errors.` 前缀，实际查的是
 * **`Errors.assistant.videoUnsupported`**（三语已在位，文案就是「请选择 Gemini，
 * 或移除视频参考」——§4.3 要求的「明说需 Gemini key」已经落在这句上）。
 * Hard Rule 8 由前端据 `errorCode` 路由到 `QuickSetupDialog`。
 */
export const ASSISTANT_MEDIA_UNSUPPORTED_ERRORS = {
  image: {
    code: 'ASSISTANT_IMAGE_UNSUPPORTED',
    httpStatus: 400,
    i18nKey: 'errors.assistant.imageUnsupported',
    message: 'The selected assistant model cannot analyze images.',
  },
  video: {
    code: 'ASSISTANT_VIDEO_UNSUPPORTED',
    httpStatus: 400,
    i18nKey: 'errors.assistant.videoUnsupported',
    message:
      'The selected assistant model cannot analyze video. A Gemini key analyzes video directly.',
  },
} as const

export type AssistantMediaCapabilityLabel =
  | 'imageVideo'
  | 'imageOnly'
  | 'textOnly'

/**
 * 路由选择器上那个能力标签。
 *
 * ⚠ **`frames` 档标 `imageOnly` 是有意的**：这个标签说的是「你能往这条路上挂什么
 * 附件」，而挂视频这件事今天仍然只有 `native` 做得到（抽帧发生在视觉线，不是聊天
 * 附件面）。把 `frames` 标成「图片＋视频」会让用户挂上去然后撞
 * `ASSISTANT_VIDEO_UNSUPPORTED` —— 标签撒谎比标签保守坏得多。
 */
export function getAssistantMediaCapabilityLabel(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): AssistantMediaCapabilityLabel {
  const capability = getAssistantMediaCapability(adapterType, modelId)
  if (capability.video === ASSISTANT_VIDEO_TIERS.native) return 'imageVideo'
  if (capability.image) return 'imageOnly'
  return 'textOnly'
}
