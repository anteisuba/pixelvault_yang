import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'
import { VISION_LIMITS } from '@/constants/vision'

/**
 * 拉片 · 读镜（p-canvas-nodes H4b）—— 切好的每一镜交给 Gemini 看，填景别 / 运镜 /
 * 画面说明 / 单镜风格。设计稿 `docs/design/canvas-shotlist.md` 第 14、28、32 条。
 *
 * 三条硬约束（owner 2026-11-07）：
 *  - **用户自己的 Gemini key、不扣点**（画布规则 #7：只有 `generate` 扣 credit）；
 *    没配 key 就地弹 `QuickSetupDialog`（Hard Rule 8）。
 *  - **每 8 镜一批**：每批只看那几镜的一小段（Gemini 裁窗）+ 每镜一张参考帧，
 *    回来一镜一行；一批坏了只重试那批。
 *  - **读出来的也是草稿，只填空着的格子**；不写库（读到的只落在镜头卡上）。
 */

/** 能读的几样。「台词听声」这一刀不做（owner 11-07：表里还没有台词列）。 */
export const SHOT_READ_FIELD_IDS = {
  /** 景别 + 运镜（一起勾：两格都是「怎么拍」）。 */
  sizeMove: 'size_move',
  /** 画面说明 = 镜头卡的提示词正文。 */
  description: 'description',
  /** 单镜风格；空着时用全片风格，所以默认不勾。 */
  look: 'look',
} as const

export const SHOT_READ_FIELDS = [
  SHOT_READ_FIELD_IDS.sizeMove,
  SHOT_READ_FIELD_IDS.description,
  SHOT_READ_FIELD_IDS.look,
] as const

export type ShotReadField = (typeof SHOT_READ_FIELDS)[number]

export const SHOT_READ_DEFAULT_FIELDS: readonly ShotReadField[] = [
  SHOT_READ_FIELD_IDS.sizeMove,
  SHOT_READ_FIELD_IDS.description,
]

export const SHOT_READ = {
  /**
   * 一批几镜。= 一次视觉分析最多几张图（每镜一张参考帧）——两处各说各话时，
   * 第 9 镜的参考帧会被安静地截掉。
   */
  batchShots: VISION_LIMITS.maxMedia,
  /**
   * 送给 Gemini 的视频采样帧率。默认 1 帧/秒时一个 2 秒的镜只有两帧，看不出摇还是
   * 推；4 帧/秒够分辨运镜。⚠ token 按帧计，一批只送那几镜的一小段，所以敢抬。
   */
  videoFps: 4,
  /** 送给模型的参考帧宽（像素）。景别要看得出人占多大，胶片条那 96px 不够。 */
  keyframeWidthPx: 480,
  /** 画面说明一格的上限（字符）。一两句话，长了就是在写剧本。 */
  descriptionMaxLength: 300,
  /**
   * 结构化输出的 token 预算：8 镜 × 四格。⚠ Gemini 的思考 token 也从这里扣，
   * 视频那一轮会被 `VIDEO_ANALYSIS_MIN_OUTPUT_TOKENS` 再抬一次底。
   */
  maxTokens: 6000,
} as const

/**
 * 读镜时表的卡边怎么走（owner 2026-11-07 看完真机选「批内慢慢爬」）：读完的镜数是底，
 * 在读这一批的份额里按等了多久渐近地往前爬 —— 只有 1 批时线也在动，不再一直停在 0。
 * ⛔ 最多爬到这批份额的 `capShare`，不越过这批的终点（没读完的不能画成读完）；
 * 这批回来就对齐真值，所以线只往前走。
 */
export const SHOT_READ_EDGE_CREEP = {
  /** 一批最多爬到它那一份的多少。 */
  capShare: 0.9,
  /** 渐近的时间常数（秒）：20 秒爬到这一份的一半多，一分钟到八成五。 */
  tauSeconds: 20,
  /** 减弱动态：不连续爬，开读就停在这一份的一半（与估算线「直接跳到阶段终点」同理）。 */
  reducedMotionShare: 0.5,
} as const

/**
 * 读镜自己的错误码（客户端按码说人话，⛔ 不靠猜原话）。
 *
 * - `videoTooLarge`：参考片超过 Gemini 那条腿能收的上限（`ASSISTANT_MEDIA_LIMITS.maxVideoBytes`）。
 *   服务端在花 key 之前先 HEAD 一下量出来，⛔ 不等下载到一半才失败（那样还会被重试再下一遍）。
 */
export const SHOT_READ_ERROR_CODES = {
  videoTooLarge: 'SHOT_READ_VIDEO_TOO_LARGE',
} as const

/** 「片子超过 N MB」那句里的 N（与服务端量片子用的同一个上限）。 */
export const SHOT_READ_MAX_VIDEO_MB = Math.round(
  ASSISTANT_MEDIA_LIMITS.maxVideoBytes / (1024 * 1024),
)

/**
 * `POST /api/vision/read-shots`。与 `VISION_ANALYZE_VIDEO_ENDPOINT` 同一个理由不进
 * `API_ENDPOINTS`（视觉那几条端点放在各自的常量文件里）。
 */
export const SHOT_READ_ENDPOINT = '/api/vision/read-shots'
