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

export const ASSISTANT_MEDIA_CAPABILITIES: Record<
  AI_ADAPTER_TYPES,
  { image: boolean; video: boolean }
> = {
  [AI_ADAPTER_TYPES.OPENAI]: { image: true, video: false },
  [AI_ADAPTER_TYPES.GEMINI]: { image: true, video: true },
  [AI_ADAPTER_TYPES.DEEPSEEK]: { image: false, video: false },
  [AI_ADAPTER_TYPES.ANTHROPIC]: { image: false, video: false },
  [AI_ADAPTER_TYPES.DASHSCOPE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.VOLCENGINE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.BYTEPLUS]: { image: false, video: false },
  [AI_ADAPTER_TYPES.MINIMAX]: { image: false, video: false },
  [AI_ADAPTER_TYPES.MINIMAX_CN]: { image: false, video: false },
  [AI_ADAPTER_TYPES.HUGGINGFACE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.FAL]: { image: false, video: false },
  [AI_ADAPTER_TYPES.RUNWAY]: { image: false, video: false },
  [AI_ADAPTER_TYPES.REPLICATE]: { image: false, video: false },
  [AI_ADAPTER_TYPES.NOVELAI]: { image: false, video: false },
  [AI_ADAPTER_TYPES.FISH_AUDIO]: { image: false, video: false },
  [AI_ADAPTER_TYPES.HYPER3D_RODIN]: { image: false, video: false },
  [AI_ADAPTER_TYPES.RUNNER]: { image: false, video: false },
  [AI_ADAPTER_TYPES.ELEVENLABS]: { image: false, video: false },
}

export function assistantAdapterSupportsMedia(
  adapterType: AI_ADAPTER_TYPES,
  kind: 'image' | 'video',
): boolean {
  return ASSISTANT_MEDIA_CAPABILITIES[adapterType][kind]
}

export type AssistantMediaCapabilityLabel =
  | 'imageVideo'
  | 'imageOnly'
  | 'textOnly'

export function getAssistantMediaCapabilityLabel(
  adapterType: AI_ADAPTER_TYPES,
): AssistantMediaCapabilityLabel {
  const capability = ASSISTANT_MEDIA_CAPABILITIES[adapterType]
  if (capability.video) return 'imageVideo'
  if (capability.image) return 'imageOnly'
  return 'textOnly'
}
