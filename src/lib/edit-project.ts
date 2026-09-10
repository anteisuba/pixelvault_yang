/**
 * 剪辑台时间线的**纯函数层**（S8 · spec §6 / §8.5）。
 *
 * 这里住着「一条时间线是什么」的全部算术：段长、总时长、播放头落在哪一段、
 * 磁吸补位、裁剪 / 分割 / 排序的合法性、以及「上游已更新」的判据。
 *
 * ⛔ 不碰 React、不碰 DOM、不读时钟（`mintId` 注入）。落图由 op 执行器做 ——
 * 这里只算出**下一份 `EditProject`**，谁把它落进 state 是调用方的事。
 *
 * ── 为什么裁剪存的是「素材本地秒」──────────────────────────────────────
 * 段在时间线上的位置由**它前面那些段的长度**决定，不由一个存下来的 offset 决定。
 * 存 offset 的版本每换一次序就要重算全轨，而且一旦某段的裁剪改了、后面所有 offset
 * 就都成了旧值 —— 那正是「拖一下顺序，第 1 段的裁剪跑到别人身上」那一类 bug 的形状
 * （`node-v4-merge.ts` 头注记着同一条教训的上一次发作）。
 */

import {
  EDIT_ASPECT_DEFAULT,
  EDIT_CLIP_MIN_DURATION_SEC,
  EDIT_CLIP_SPEED_DEFAULT,
  EDIT_RESOLUTION_DEFAULT,
  EDIT_TIMELINE_PX_PER_SECOND,
  EDIT_TRACKS,
  EDIT_TRACK_IDS,
  EDIT_TRACK_MAX_CLIPS,
  EDIT_TRANSITION_IDS,
  type EditTrackId,
} from '@/constants/edit-desk'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { readOutputVersions, readOutputIndex } from '@/lib/node-output-versions'
import type {
  EditClip,
  EditProject,
  NodeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/** 空时间线。⚠ 名字由调用方给（i18n），⛔ 这里不编中文。 */
export function createEmptyEditProject(name: string): EditProject {
  return {
    name,
    tracks: { video: [], audio: [], music: [] },
    settings: {
      aspect: EDIT_ASPECT_DEFAULT,
      resolution: EDIT_RESOLUTION_DEFAULT,
      magnetic: true,
    },
  }
}

/** 一段在**成片时间轴**上占多久 —— 裁剪长度除以倍速。 */
export function clipDurationSec(clip: EditClip): number {
  const raw = Math.max(0, clip.out - clip.in)
  const speed = clip.speed || EDIT_CLIP_SPEED_DEFAULT
  return raw / speed
}

/** 一条轨道的总时长。 */
export function trackDurationSec(clips: readonly EditClip[]): number {
  return clips.reduce((total, clip) => total + clipDurationSec(clip), 0)
}

/**
 * 成片时长 = **最长的那条轨**。
 *
 * ⚠ 不是 V 轨：配乐比画面长是常态（画板的 M 轨就横跨全片），按 V 轨报数会让
 * 顶栏读数和用户听到的东西对不上。
 */
export function projectDurationSec(project: EditProject): number {
  return Math.max(
    ...EDIT_TRACKS.map((track) => trackDurationSec(project.tracks[track])),
    0,
  )
}

/** 段在轨道上的起点（前面所有段之和）。 */
export function clipStartSec(
  clips: readonly EditClip[],
  index: number,
): number {
  return trackDurationSec(clips.slice(0, Math.max(0, index)))
}

/** 播放头落在哪一段。`-1` = 落在轨道之外。 */
export function clipIndexAt(
  clips: readonly EditClip[],
  timeSec: number,
): number {
  let cursor = 0
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index]
    if (!clip) continue
    const end = cursor + clipDurationSec(clip)
    if (timeSec >= cursor && timeSec < end) return index
    cursor = end
  }
  return -1
}

/** 段内的本地播放时刻（喂给 `<video>` 的 `currentTime`）。 */
export function clipLocalTimeSec(
  clip: EditClip,
  offsetInClipSec: number,
): number {
  const speed = clip.speed || EDIT_CLIP_SPEED_DEFAULT
  return clip.in + Math.max(0, offsetInClipSec) * speed
}

/** 秒 → 像素（时间线唯一的换算处）。 */
export function secondsToPx(seconds: number): number {
  return seconds * EDIT_TIMELINE_PX_PER_SECOND
}

/** 像素 → 秒。 */
export function pxToSeconds(px: number): number {
  return px / EDIT_TIMELINE_PX_PER_SECOND
}

/** `0:07.0` / `0:21` 式时钟（顶栏读数与预览时钟共用一处）。 */
export function formatEditClock(seconds: number, withTenths = false): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  const whole = Math.floor(rest)
  const padded = String(whole).padStart(2, '0')
  if (!withTenths) return `${minutes}:${padded}`
  const tenths = Math.floor((rest - whole) * 10)
  return `${minutes}:${padded}.${tenths}`
}

/** `21s` 式短读数（顶栏「21s · 16:9 · 1080p」的第一段）。 */
export function formatEditDurationShort(seconds: number): string {
  return `${Math.round(Number.isFinite(seconds) ? seconds : 0)}s`
}

/* ─── 段的来源与「上游已更新」 ─────────────────────────────────────────── */

/**
 * 这一段指向的节点**现在**的当前版本 id。
 *
 * ⚠ 与段上存的 `sourceVersionId` 一比就是徽标的全部逻辑（spec §6）。节点不在图上
 * （被删了）时返回 `undefined` —— 那不是「更新了」，是「没了」，两者在 UI 上是
 * 两种说法。
 */
export function currentVersionIdOf(
  node: NodeV4 | undefined,
): string | undefined {
  if (!node) return undefined
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return undefined
  const versions = readOutputVersions(data)
  if (versions.length === 0) return undefined
  const index = readOutputIndex(data)
  return versions[index]?.id ?? versions[0]?.id
}

/** 段指向的节点当前版本的 url（预览要播的那一条）。 */
export function currentUrlOf(node: NodeV4 | undefined): string | undefined {
  if (!node) return undefined
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return undefined
  const versions = readOutputVersions(data)
  if (versions.length === 0) return data.url
  const index = readOutputIndex(data)
  return versions[index]?.url ?? versions[0]?.url ?? data.url
}

export interface EditClipSourceFacts {
  readonly node: NodeV4 | undefined
  /** 节点还在不在图上。`false` = 段成了孤儿（画板上不出徽标，出「来源已删」）。 */
  readonly exists: boolean
  /** 上游出了新版本 —— 段右上那颗橙徽标。 */
  readonly stale: boolean
  readonly currentVersionId?: string
  readonly url?: string
}

/**
 * 一段的来源事实。**徽标唯一的判据**（spec §8.5 第 5 条）。
 *
 * ⚠ 段上没记版本（存量 / 从 merge 迁来的段）时**不算 stale**：那是「我们不知道
 * 它当时是哪一版」，不是「它变了」。把未知当成变了，用户会在一条没人动过的时间线上
 * 看到满屏橙点。
 */
export function readClipSource(
  nodes: readonly NodeV4[],
  clip: EditClip,
): EditClipSourceFacts {
  const node = nodes.find((candidate) => candidate.id === clip.sourceNodeId)
  const currentVersionId = currentVersionIdOf(node)
  const url = currentUrlOf(node)
  return {
    node,
    exists: Boolean(node),
    stale: Boolean(
      node &&
      clip.sourceVersionId &&
      currentVersionId &&
      currentVersionId !== clip.sourceVersionId,
    ),
    ...(currentVersionId ? { currentVersionId } : {}),
    ...(url ? { url } : {}),
  }
}

/* ─── 建段 ──────────────────────────────────────────────────────────────── */

/**
 * 一张有产物的卡 → 一段。
 *
 * `null` = 这张卡还没有产物（空卡进不了时间线）。段长取节点的 `durationSec`；
 * 拿不到时长（存量素材没量过）时给一个可见的默认，用户拖一下手柄就改对了 ——
 * ⛔ 不给 0：零长段在轨道上是一条看不见的缝，谁都点不中它。
 */
export function buildClipFromNode(
  node: NodeV4,
  mintId: (prefix: string) => string,
): EditClip | null {
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return null
  const url = currentUrlOf(node)
  if (!url) return null
  const duration =
    data.kind === NODE_MEDIA_KIND_IDS.video ||
    data.kind === NODE_MEDIA_KIND_IDS.audio
      ? (data.durationSec ?? 0)
      : 0
  const versionId = currentVersionIdOf(node)
  return {
    id: mintId('clip'),
    sourceNodeId: node.id,
    ...(versionId ? { sourceVersionId: versionId } : {}),
    in: 0,
    out: duration > 0 ? duration : EDIT_CLIP_FALLBACK_DURATION_SEC,
    speed: EDIT_CLIP_SPEED_DEFAULT,
    muted: false,
  }
}

/** 量不到时长时给的段长。见 `buildClipFromNode` 的论据。 */
export const EDIT_CLIP_FALLBACK_DURATION_SEC = 5

/** 一张卡该落进哪条轨 —— 视频进 V，音频进 A（配乐由用户拖到 M）。 */
export function defaultTrackFor(node: NodeV4): EditTrackId | null {
  if (node.data.kind === NODE_MEDIA_KIND_IDS.video) {
    return EDIT_TRACK_IDS.video
  }
  if (node.data.kind === NODE_MEDIA_KIND_IDS.audio) {
    return EDIT_TRACK_IDS.audio
  }
  return null
}

/* ─── 轨道编辑（纯，返回新数组）──────────────────────────────────────── */

export function insertClip(
  clips: readonly EditClip[],
  clip: EditClip,
  index?: number,
): readonly EditClip[] {
  if (clips.length >= EDIT_TRACK_MAX_CLIPS) return clips
  const at = index === undefined ? clips.length : clamp(index, 0, clips.length)
  return [...clips.slice(0, at), clip, ...clips.slice(at)]
}

export function removeClip(
  clips: readonly EditClip[],
  clipId: string,
): readonly EditClip[] {
  return clips.filter((clip) => clip.id !== clipId)
}

export function moveClip(
  clips: readonly EditClip[],
  clipId: string,
  toIndex: number,
): readonly EditClip[] {
  const from = clips.findIndex((clip) => clip.id === clipId)
  if (from < 0) return clips
  const rest = [...clips.slice(0, from), ...clips.slice(from + 1)]
  const at = clamp(toIndex, 0, rest.length)
  const moved = clips[from]
  if (!moved) return clips
  return [...rest.slice(0, at), moved, ...rest.slice(at)]
}

/**
 * 裁剪的合法区间守卫。
 *
 * `in` / `out` 都是素材本地秒，所以上界是**素材自己的长度**而不是时间线；调用方
 * 拿不到素材长度时传 `undefined`，那时只守下界与最短段长。
 */
export function clampTrim(
  clip: EditClip,
  patch: { readonly in?: number; readonly out?: number },
  sourceDurationSec?: number,
): { readonly in: number; readonly out: number } {
  const upper =
    sourceDurationSec && sourceDurationSec > 0
      ? sourceDurationSec
      : Math.max(clip.out, patch.out ?? 0)
  let nextIn = clamp(patch.in ?? clip.in, 0, upper)
  let nextOut = clamp(patch.out ?? clip.out, 0, upper)
  if (nextOut - nextIn < EDIT_CLIP_MIN_DURATION_SEC) {
    if (patch.in !== undefined) {
      nextIn = Math.max(0, nextOut - EDIT_CLIP_MIN_DURATION_SEC)
    } else {
      nextOut = Math.min(upper, nextIn + EDIT_CLIP_MIN_DURATION_SEC)
    }
  }
  return { in: nextIn, out: nextOut }
}

/**
 * 在**时间线秒** `atSec` 处把一段切成两段（S 键）。
 *
 * `null` = 切点不在这一段内、或切出来的任一半短于最短段长。切出来的两段共用来源
 * 与版本 —— 分割不是「换素材」，⛔ 不重新取当前版本（那会让一次分割顺手把段升到
 * 新版本，用户没要求过这件事）。
 */
export function splitClipAt(
  clips: readonly EditClip[],
  atSec: number,
  mintId: (prefix: string) => string,
): readonly EditClip[] | null {
  const index = clipIndexAt(clips, atSec)
  if (index < 0) return null
  const clip = clips[index]
  if (!clip) return null
  const offset = atSec - clipStartSec(clips, index)
  const localCut = clipLocalTimeSec(clip, offset)
  if (
    localCut - clip.in < EDIT_CLIP_MIN_DURATION_SEC ||
    clip.out - localCut < EDIT_CLIP_MIN_DURATION_SEC
  ) {
    return null
  }
  const head: EditClip = { ...clip, out: localCut }
  const tail: EditClip = {
    ...clip,
    id: mintId('clip'),
    in: localCut,
    // 转场是**段尾**属性：切开之后它属于后一半，前一半接的是自己的后半段。
    transitionOut: clip.transitionOut ?? EDIT_TRANSITION_IDS.none,
  }
  const headFinal: EditClip = {
    ...head,
    transitionOut: EDIT_TRANSITION_IDS.none,
  }
  return [...clips.slice(0, index), headFinal, tail, ...clips.slice(index + 1)]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/* ─── 读端汇总 ─────────────────────────────────────────────────────────── */

export interface EditTimelineRow {
  readonly clip: EditClip
  readonly index: number
  readonly startSec: number
  readonly durationSec: number
  readonly widthPx: number
  readonly source: EditClipSourceFacts
}

/** 一条轨道 → 渲染要的一排行。**换算只在这里做一次**。 */
export function buildTimelineRows(
  clips: readonly EditClip[],
  nodes: readonly NodeV4[],
): readonly EditTimelineRow[] {
  let cursor = 0
  return clips.map((clip, index) => {
    const durationSec = clipDurationSec(clip)
    const row: EditTimelineRow = {
      clip,
      index,
      startSec: cursor,
      durationSec,
      widthPx: secondsToPx(durationSec),
      source: readClipSource(nodes, clip),
    }
    cursor += durationSec
    return row
  })
}

/** 项目里能进时间线的卡（有产物的视频 / 音频）—— 左栏「画布素材」读它。 */
export function listEditableAssets(
  state: NodeWorkflowStateV4,
): readonly NodeV4[] {
  return state.nodes.filter((node) => {
    const kind = node.data.kind
    if (
      kind !== NODE_MEDIA_KIND_IDS.video &&
      kind !== NODE_MEDIA_KIND_IDS.audio
    ) {
      return false
    }
    return Boolean(currentUrlOf(node))
  })
}
