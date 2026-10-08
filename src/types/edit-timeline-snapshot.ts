import { z } from 'zod'

import { EDIT_TRACKS_TUPLE, EDIT_TRACK_MAX_CLIPS } from '@/constants/edit-desk'

/**
 * 时间线 → 给模型读的快照（`docs/references/mcp.md` §4.1）。外部 Claude（MCP
 * `read_project`）与站内助手的画布快照读的是**同一个**形状；站内那一份随请求体
 * 上来，所以要有 schema 守（Hard Rule 2）。秒数一律时间线秒，素材秒另标。
 */

const IdSchema = z.string().trim().min(1).max(160)
const SecondsSchema = z.number().min(0).max(36_000)

/** 台词 / 字幕挂在主线哪一段的哪一帧（素材本地秒）。 */
export const TimelineSnapshotAttachSchema = z.object({
  clipId: IdSchema,
  atSec: SecondsSchema,
})

export const TimelineSnapshotClipSchema = z.object({
  clipId: IdSchema,
  track: z.enum(EDIT_TRACKS_TUPLE),
  /** 这条轨上的第几段（0 起）。 */
  index: z.number().int().min(0),
  sourceNodeId: IdSchema,
  sourceName: z.string().max(200).optional(),
  /** 来源卡已经不在画布上了。 */
  sourceMissing: z.literal(true).optional(),
  startSec: SecondsSchema,
  endSec: SecondsSchema,
  /** 素材本地秒（裁剪入出点）。 */
  inSec: SecondsSchema,
  outSec: SecondsSchema,
  speed: z.number().min(0).max(100),
  /** 段尾接下一段的转场；缺席 = 硬切。 */
  transitionOut: z.string().max(40).optional(),
  /** 转场重叠多久（秒，5a）；只在有转场时出。 */
  transitionSec: z.number().optional(),
  /** 原声关了（只对 V 轨有意义）。 */
  muted: z.literal(true).optional(),
  gain: z.number().min(0).max(10).optional(),
  /** 来源卡的当前版不是这段在用的那一版（画布上换了版，没换进时间线）。 */
  stale: z.literal(true).optional(),
  /** 台词（A 轨）挂在主线哪一段的哪一帧；主线还空着时缺席。 */
  attachedTo: TimelineSnapshotAttachSchema.optional(),
  /** 挂点那一帧被裁掉了：导出时不出声，挪一下就按落点重新挂上。 */
  cut: z.literal(true).optional(),
})

export const TimelineSnapshotTextSchema = z.object({
  textId: IdSchema,
  text: z.string().max(2_000),
  startSec: SecondsSchema,
  endSec: SecondsSchema,
  anchor: z.string().max(20),
  size: z.string().max(20),
  tone: z.string().max(20),
  fadeSec: z.number().min(0).max(60),
  attachedTo: TimelineSnapshotAttachSchema.optional(),
  /** 挂点那一帧被裁掉了：导出时不出字。 */
  cut: z.literal(true).optional(),
})

export const TimelineSnapshotSchema = z.object({
  name: z.string().max(200),
  durationSec: SecondsSchema,
  aspect: z.string().max(20),
  resolution: z.string().max(20),
  clips: z.array(TimelineSnapshotClipSchema).max(EDIT_TRACK_MAX_CLIPS * 3),
  texts: z.array(TimelineSnapshotTextSchema).max(EDIT_TRACK_MAX_CLIPS),
})

/**
 * 画布上**剪得进时间线**的一张卡（有产物的视频 / 音频）—— 剪辑台左栏「画布素材」
 * 那一列。模型加段时 `sourceNodeId` 只能从这里挑。
 */
export const TimelineSnapshotAssetSchema = z.object({
  nodeId: IdSchema,
  name: z.string().max(200),
  kind: z.enum(['video', 'audio']),
  /** 默认落哪条轨（视频 → video，台词 → audio，配乐 → music）。 */
  track: z.enum(EDIT_TRACKS_TUPLE),
  /** 素材长度（秒）；量不到时缺席。 */
  durationSec: SecondsSchema.optional(),
})

export type TimelineSnapshotAttach = z.infer<
  typeof TimelineSnapshotAttachSchema
>
export type TimelineSnapshotClip = z.infer<typeof TimelineSnapshotClipSchema>
export type TimelineSnapshotText = z.infer<typeof TimelineSnapshotTextSchema>
export type TimelineSnapshot = z.infer<typeof TimelineSnapshotSchema>
export type TimelineSnapshotAsset = z.infer<typeof TimelineSnapshotAssetSchema>
