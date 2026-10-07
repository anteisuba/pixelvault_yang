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
  EDIT_ATTACH_EPSILON_SEC,
  EDIT_CLIP_MIN_DURATION_SEC,
  EDIT_CLIP_SPEED_DEFAULT,
  EDIT_EXPORT_RANGE_IDS,
  EDIT_PROJECT_FALLBACK_NAME,
  EDIT_RESOLUTION_DEFAULT,
  EDIT_TIMELINE_PX_PER_SECOND,
  EDIT_TEXT_ANCHOR_DEFAULT,
  EDIT_TEXT_CLIP_DEFAULT_DURATION_SEC,
  EDIT_TEXT_CLIP_MIN_DURATION_SEC,
  EDIT_TEXT_FADE_DEFAULT,
  EDIT_TEXT_MARGIN_SCALE,
  EDIT_TEXT_MAX_LENGTH,
  EDIT_TEXT_SIZE_DEFAULT,
  EDIT_TEXT_SIZE_SCALE,
  EDIT_TEXT_TONE_DEFAULT,
  EDIT_TRACKS,
  EDIT_TRACK_IDS,
  EDIT_TRACK_MAX_CLIPS,
  EDIT_TRANSITION_IDS,
  type EditAspect,
  type EditExportRangeId,
  type EditResolution,
  type EditTrackId,
  type EditTransitionId,
} from '@/constants/edit-desk'
import {
  RENDER_ASPECT_RATIO_PARTS,
  RENDER_CROSSFADE_SEC,
  RENDER_MAX_DURATION_SEC,
  RENDER_MAX_SEGMENTS,
  RENDER_MIN_SEGMENT_SEC,
  RENDER_OUTPUT_FPS,
  RENDER_PLAN_ERROR_CODES,
  RENDER_PLAN_VERSION,
  RENDER_SHORT_SIDE_BY_RESOLUTION,
  type RenderAudioSegment,
  type RenderPlan,
  type RenderTextSegment,
  type RenderPlanErrorCode,
  type RenderVideoSegment,
} from '@/constants/render-video'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { clampCodeUnits } from '@/lib/node-display-name'
import { readOutputVersions, readOutputIndex } from '@/lib/node-output-versions'
import type {
  EditAttachment,
  EditClip,
  EditProject,
  EditTextClip,
  NodeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/** 空时间线。⚠ 名字由调用方给（i18n），⛔ 这里不编中文。 */
export function createEmptyEditProject(name: string): EditProject {
  return {
    name,
    tracks: { video: [], audio: [], music: [], text: [] },
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
 * 这条轨的段按**自己的起点**摆（台词 A 轨，v2 第 1 片），而不是首尾相接。
 * ⚠ 只有 A 轨：V 轨是磁性主线，M 轨铺底，两条都首尾相接。
 */
export function isPositionedTrack(track: EditTrackId): boolean {
  return track === EDIT_TRACK_IDS.audio
}

/**
 * 每一段在时间线上的起点。按起点摆的轨读 `startSec`；没有起点的存量段接在**前一段
 * 后面**（就是改版前它们排的位置）—— 与 `reflowAttachments` 第 1 步是同一条规则。
 */
export function trackClipStarts(
  clips: readonly EditClip[],
  positioned: boolean,
): readonly number[] {
  let cursor = 0
  return clips.map((clip) => {
    const start = positioned ? (clip.startSec ?? cursor) : cursor
    cursor = start + clipDurationSec(clip)
    return start
  })
}

/** 一条轨在时间线上占到第几秒（最靠后那一段的尾）。 */
export function trackEndSec(
  clips: readonly EditClip[],
  positioned: boolean,
): number {
  const starts = trackClipStarts(clips, positioned)
  return clips.reduce(
    (end, clip, index) =>
      Math.max(end, (starts[index] ?? 0) + clipDurationSec(clip)),
    0,
  )
}

/**
 * 成片时长 = **最长的那条轨**。
 *
 * ⚠ 不是 V 轨：配乐比画面长是常态（画板的 M 轨就横跨全片），按 V 轨报数会让
 * 顶栏读数和用户听到的东西对不上。
 */
export function projectDurationSec(project: EditProject): number {
  return Math.max(
    ...EDIT_TRACKS.map((track) =>
      trackEndSec(project.tracks[track], isPositionedTrack(track)),
    ),
    // ⚠ 字幕也算进总长：T 段是**绝对定位**的，一段摆在画面尾巴之后时不算进来，
    // 播放头就永远走不到它 —— 用户于是有一段自己摆下、却再也点不中的字幕。
    textTrackDurationSec(project.tracks.text),
    0,
  )
}

/* ─── 字幕段（S8d · spec §6「文字段」）─────────────────────────────────── */

/** T 轨占到第几秒（最靠后那一段的尾）。 */
export function textTrackDurationSec(clips: readonly EditTextClip[]): number {
  return clips.reduce(
    (end, clip) => Math.max(end, clip.startSec + clip.durationSec),
    0,
  )
}

/**
 * 落库前的守卫：起点不为负、段不短于最短、内容不超长。
 *
 * ⚠ 与 `clampTrim` 是同一层的东西（op 执行器落之前过一遍），⛔ 不放进组件：一条
 * 从助手来的 op 不会路过任何组件。
 */
export function clampTextClip(clip: EditTextClip): EditTextClip {
  const startSec = Math.max(0, clip.startSec)
  const durationSec = Math.max(
    EDIT_TEXT_CLIP_MIN_DURATION_SEC,
    clip.durationSec,
  )
  const text = clampCodeUnits(clip.text, EDIT_TEXT_MAX_LENGTH)
  return { ...clip, startSec, durationSec, text }
}

/**
 * 工具条「文字」在播放头处落的那一段（spec §6：3s、下中、中号、白字、不淡）。
 *
 * ⚠ 内容由调用方给（i18n 的「双击改文字」占位），⛔ 这里不编中文 —— 与
 * `createEmptyEditProject` 同一条纪律。
 */
export function buildTextClip(
  mintId: (prefix: string) => string,
  atSec: number,
  text: string,
): EditTextClip {
  return clampTextClip({
    id: mintId('text'),
    text,
    startSec: Math.max(0, atSec),
    durationSec: EDIT_TEXT_CLIP_DEFAULT_DURATION_SEC,
    anchor: EDIT_TEXT_ANCHOR_DEFAULT,
    size: EDIT_TEXT_SIZE_DEFAULT,
    tone: EDIT_TEXT_TONE_DEFAULT,
    fadeSec: EDIT_TEXT_FADE_DEFAULT,
  })
}

/** 播放头落在哪几段字幕里（预览叠字读它；空数组 = 这一刻不显示字幕）。 */
export function textClipsAt(
  clips: readonly EditTextClip[],
  timeSec: number,
): readonly EditTextClip[] {
  return clips.filter(
    (clip) =>
      timeSec >= clip.startSec && timeSec < clip.startSec + clip.durationSec,
  )
}

/**
 * 在 `atSec` 把一段字幕切成两段（S 键）。
 *
 * `null` = 切点不在段内、或切出来的任一半太短。两半**同内容**：分割是「这句话前
 * 半段这样、后半段那样」的起手，⛔ 不清空后一半的文字（那等于替用户删了一句话）。
 */
export function splitTextClipAt(
  clips: readonly EditTextClip[],
  clipId: string,
  atSec: number,
  mintId: (prefix: string) => string,
): readonly EditTextClip[] | null {
  const index = clips.findIndex((clip) => clip.id === clipId)
  const clip = index < 0 ? undefined : clips[index]
  if (!clip) return null
  const head = atSec - clip.startSec
  const tail = clip.startSec + clip.durationSec - atSec
  if (
    head < EDIT_TEXT_CLIP_MIN_DURATION_SEC ||
    tail < EDIT_TEXT_CLIP_MIN_DURATION_SEC
  ) {
    return null
  }
  // ⚠ 后一半**不抄挂点**：它从 `atSec` 起，挂点要按这一刻重新找（`reflowAttachments`
  // 会补上）；抄过去会让它被拉回前一半的那一帧上。
  return [
    ...clips.slice(0, index),
    { ...clip, durationSec: head },
    withAttach(
      { ...clip, id: mintId('text'), startSec: atSec, durationSec: tail },
      undefined,
    ),
    ...clips.slice(index + 1),
  ]
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
  /**
   * 卡上量不到时长时**外面知道**的那个秒数（素材库那条记录量过）。
   * ⚠ 只在卡自己没有 `durationSec` 时用得上，⛔ 不覆盖卡上的值：卡才是来源。
   */
  knownDurationSec?: number,
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
  const known =
    knownDurationSec !== undefined && knownDurationSec > 0
      ? knownDurationSec
      : 0
  const out = duration > 0 ? duration : known > 0 ? known : undefined
  return {
    id: mintId('clip'),
    sourceNodeId: node.id,
    ...(versionId ? { sourceVersionId: versionId } : {}),
    in: 0,
    out: out ?? EDIT_CLIP_FALLBACK_DURATION_SEC,
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

/* ─── 挂件（剪辑台 v2 第 1 片 · spec §6「磁性主线 + 挂件」）─────────────── */

/** 位置只留到毫秒：挂点 ↔ 时间线秒来回换算不攒浮点尾巴，`reflowAttachments` 才幂等。 */
function roundMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

interface MainSpan {
  readonly clip: EditClip
  readonly startSec: number
  readonly endSec: number
}

/** 主线（V 轨）每一段占的时间线区间。 */
function mainSpans(project: EditProject): readonly MainSpan[] {
  let cursor = 0
  return project.tracks.video.map((clip) => {
    const startSec = cursor
    cursor += clipDurationSec(clip)
    return { clip, startSec, endSec: cursor }
  })
}

function speedOf(clip: EditClip): number {
  return clip.speed || EDIT_CLIP_SPEED_DEFAULT
}

/** 挂点 → 时间线秒。 */
function positionOf(span: MainSpan, atSec: number): number {
  return roundMs(
    Math.max(0, span.startSec + (atSec - span.clip.in) / speedOf(span.clip)),
  )
}

/** 时间线秒 → 挂点。落在主线之后挂最后一段（多半是断挂）；主线空着 = `null`。 */
function attachAtSpans(
  spans: readonly MainSpan[],
  timeSec: number,
): EditAttachment | null {
  const last = spans[spans.length - 1]
  if (!last) return null
  const span =
    spans.find((item) => timeSec >= item.startSec && timeSec < item.endSec) ??
    last
  return {
    clipId: span.clip.id,
    atSec: roundMs(
      Math.max(
        0,
        span.clip.in + (timeSec - span.startSec) * speedOf(span.clip),
      ),
    ),
  }
}

/** 时间线上这一刻底下是主线哪一段的哪一帧。 */
export function attachAt(
  project: EditProject,
  timeSec: number,
): EditAttachment | null {
  return attachAtSpans(mainSpans(project), timeSec)
}

/**
 * 断挂：挂点那一帧已经不在宿主的入出点之间（被裁掉了）。台面上半透明，导出时不出声
 * 不出字；拖一下就按落点重新挂上。没有挂点、或宿主不在了，都不算断挂。
 */
export function isAttachmentCut(
  project: EditProject,
  attach: EditAttachment | undefined,
): boolean {
  if (!attach) return false
  const host = project.tracks.video.find((clip) => clip.id === attach.clipId)
  if (!host) return false
  return (
    attach.atSec < host.in - EDIT_ATTACH_EPSILON_SEC ||
    attach.atSec > host.out + EDIT_ATTACH_EPSILON_SEC
  )
}

/** 换挂点（`undefined` = 摘掉，回到自由摆放）。 */
export function withAttach<T extends { readonly attach?: EditAttachment }>(
  item: T,
  attach: EditAttachment | undefined,
): T {
  if (attach) return { ...item, attach }
  const next: { attach?: EditAttachment } = { ...item }
  delete next.attach
  return next as T
}

function sameAttach(
  left: EditAttachment | undefined,
  right: EditAttachment | undefined,
): boolean {
  if (!left || !right) return left === right
  return left.clipId === right.clipId && left.atSec === right.atSec
}

/** 一件挂件该在哪：有宿主按挂点算；没有就按现在的位置找一个挂上。 */
function placeAttachment(
  spans: readonly MainSpan[],
  hosts: ReadonlyMap<string, MainSpan>,
  attach: EditAttachment | undefined,
  startSec: number,
): { readonly startSec: number; readonly attach?: EditAttachment } {
  const host = attach ? hosts.get(attach.clipId) : undefined
  if (attach && host)
    return { startSec: positionOf(host, attach.atSec), attach }
  const found = attachAtSpans(spans, startSec)
  return found ? { startSec, attach: found } : { startSec }
}

/**
 * 归位 —— 每次写入时间线都过一遍（op 执行器的 `withEditProject`），读端（台面、
 * MCP 快照、渲染计划）也先过一遍，所以存量项目**不用迁库**：
 *
 * 1. 存量台词没有起点 → 接在前一条台词后面（就是改版前它们排的位置）；
 * 2. 有挂点、宿主还在 → 按挂点重算起点（主线怎么挪、怎么裁，挂件就怎么跟）；
 * 3. 没挂点、或宿主不在了 → 按现在的起点挂到那一刻底下的主线段；主线空着就自由摆放。
 *
 * 幂等；什么都没变时原样返回同一个对象（台面的 memo 靠它不白重画）。
 */
export function reflowAttachments(project: EditProject): EditProject {
  const spans = mainSpans(project)
  const hosts = new Map(spans.map((span) => [span.clip.id, span]))
  let changed = false

  let cursor = 0
  const audio = project.tracks.audio.map((clip) => {
    const placed = placeAttachment(
      spans,
      hosts,
      clip.attach,
      clip.startSec ?? cursor,
    )
    cursor = placed.startSec + clipDurationSec(clip)
    if (
      clip.startSec === placed.startSec &&
      sameAttach(clip.attach, placed.attach)
    ) {
      return clip
    }
    changed = true
    return withAttach({ ...clip, startSec: placed.startSec }, placed.attach)
  })

  const text = project.tracks.text.map((clip) => {
    const placed = placeAttachment(spans, hosts, clip.attach, clip.startSec)
    if (
      clip.startSec === placed.startSec &&
      sameAttach(clip.attach, placed.attach)
    ) {
      return clip
    }
    changed = true
    return withAttach({ ...clip, startSec: placed.startSec }, placed.attach)
  })

  if (!changed) return project
  return { ...project, tracks: { ...project.tracks, audio, text } }
}

/** 挂在某一段主线上的台词（连同它在 A 轨的下标）与字幕 —— 删段时一起走、撤销时一起回。 */
export function attachmentsOf(
  project: EditProject,
  clipId: string,
): {
  readonly audio: readonly { readonly clip: EditClip; readonly index: number }[]
  readonly text: readonly EditTextClip[]
} {
  return {
    audio: project.tracks.audio
      .map((clip, index) => ({ clip, index }))
      .filter(({ clip }) => clip.attach?.clipId === clipId),
    text: project.tracks.text.filter((clip) => clip.attach?.clipId === clipId),
  }
}

/** 摘掉挂在某一段主线上的全部台词与字幕（owner 2026-10-07：删镜头时一起删）。 */
export function withoutAttachmentsOf(
  project: EditProject,
  clipId: string,
): EditProject {
  return {
    ...project,
    tracks: {
      ...project.tracks,
      audio: project.tracks.audio.filter(
        (clip) => clip.attach?.clipId !== clipId,
      ),
      text: project.tracks.text.filter(
        (clip) => clip.attach?.clipId !== clipId,
      ),
    },
  }
}

/**
 * 在**时间线秒** `atSec` 把主线一段切成两段，挂在切点之后那几帧上的台词与字幕换到
 * 后一半上（S 键）。`null` 同 `splitClipAt`。
 */
export function splitMainClipAt(
  project: EditProject,
  atSec: number,
  mintId: (prefix: string) => string,
): EditProject | null {
  const clips = project.tracks.video
  const index = clipIndexAt(clips, atSec)
  const original = clips[index]
  const next = splitClipAt(clips, atSec, mintId)
  const tail = next?.[index + 1]
  if (!original || !next || !tail) return null
  const rehost = <T extends { readonly attach?: EditAttachment }>(
    item: T,
  ): T =>
    item.attach?.clipId === original.id &&
    item.attach.atSec >= tail.in - EDIT_ATTACH_EPSILON_SEC
      ? withAttach(item, { ...item.attach, clipId: tail.id })
      : item
  return reflowAttachments({
    ...project,
    tracks: {
      ...project.tracks,
      video: [...next],
      audio: project.tracks.audio.map(rehost),
      text: project.tracks.text.map(rehost),
    },
  })
}

/**
 * 在时间线秒 `atSec` 把一条**按起点摆**的段（A 轨台词）切成两段。后一半从 `atSec`
 * 起、不抄挂点（落表时按这一刻重挂）。`null` = 切点不在任何一段内或任一半太短。
 */
export function splitPositionedClipAt(
  clips: readonly EditClip[],
  atSec: number,
  mintId: (prefix: string) => string,
): readonly EditClip[] | null {
  const starts = trackClipStarts(clips, true)
  const index = clips.findIndex((clip, at) => {
    const start = starts[at] ?? 0
    return atSec >= start && atSec < start + clipDurationSec(clip)
  })
  const clip = clips[index]
  if (!clip) return null
  const localCut = clipLocalTimeSec(clip, atSec - (starts[index] ?? 0))
  if (
    localCut - clip.in < EDIT_CLIP_MIN_DURATION_SEC ||
    clip.out - localCut < EDIT_CLIP_MIN_DURATION_SEC
  ) {
    return null
  }
  const tail = withAttach(
    { ...clip, id: mintId('clip'), in: localCut, startSec: atSec },
    undefined,
  )
  return [
    ...clips.slice(0, index),
    { ...clip, out: localCut },
    tail,
    ...clips.slice(index + 1),
  ]
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

/**
 * 一条轨道 → 渲染要的一排行。**换算只在这里做一次**。`positioned` = 这条轨按段自己
 * 的起点摆（`isPositionedTrack`）。
 */
export function buildTimelineRows(
  clips: readonly EditClip[],
  nodes: readonly NodeV4[],
  positioned = false,
): readonly EditTimelineRow[] {
  const starts = trackClipStarts(clips, positioned)
  return clips.map((clip, index) => {
    const durationSec = clipDurationSec(clip)
    return {
      clip,
      index,
      startSec: starts[index] ?? 0,
      durationSec,
      widthPx: secondsToPx(durationSec),
      source: readClipSource(nodes, clip),
    }
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

/* ─── 渲染计划（S9 · spec §6「渲染层」）────────────────────────────────── */

/**
 * 建计划失败。**可见**而不是静默出一条空片 —— 用户按了导出，什么都不说是最坏的
 * 一种结果（他会以为在渲，回来发现什么都没有）。
 */
export class RenderPlanError extends Error {
  readonly code: RenderPlanErrorCode

  constructor(code: RenderPlanErrorCode, message: string) {
    super(message)
    this.name = 'RenderPlanError'
    this.code = code
  }
}

export interface RenderPlanRange {
  readonly range: EditExportRangeId
  /** `inOut` 用。⚠ 只标了一头也算 —— 另一头取时间线的端点。 */
  readonly inPointSec?: number | null
  readonly outPointSec?: number | null
  /** `clip` 用：要单独导出的那一段。 */
  readonly clipId?: string | null
  readonly track?: EditTrackId
}

export interface RenderPlanSettings {
  readonly projectId: string
  /** 覆盖时间线自己的清晰度（导出对话框上那颗下拉）。 */
  readonly resolution?: EditResolution
}

/** 比例 + 清晰度 → 成片像素。⚠ 换算只在这一处。 */
export function renderOutputDimensions(
  aspect: EditAspect,
  resolution: EditResolution,
): { readonly width: number; readonly height: number } {
  const short = RENDER_SHORT_SIDE_BY_RESOLUTION[resolution]
  const parts = RENDER_ASPECT_RATIO_PARTS[aspect]
  const long = Math.round((short * parts.long) / parts.short)
  // ⚠ 偶数化：H.264 的 4:2:0 采样要求两边都是偶数，奇数宽在编码那一步才炸。
  const even = (value: number): number => value - (value % 2)
  return parts.portrait
    ? { width: even(short), height: even(long) }
    : { width: even(long), height: even(short) }
}

/** 段尾转场的读值（缺席 = `none`）。 */
function transitionOf(clip: EditClip): EditTransitionId {
  return clip.transitionOut ?? EDIT_TRANSITION_IDS.none
}

/** 这一段的转场会从成片里扣掉多少秒。 */
function overlapSecOf(transition: EditTransitionId): number {
  return transition === EDIT_TRANSITION_IDS.crossfade ? RENDER_CROSSFADE_SEC : 0
}

/**
 * 范围三选 → **时间线秒的一个窗口**。
 *
 * ⚠ 三个范围在这里收敛成同一件事，于是下游只有一条裁剪路径：⛔ 不为「单段」另写
 * 一套（那正是「单段导出的裁剪和整条导出的裁剪对不上」这类 bug 的温床）。
 */
export function resolveRenderWindow(
  project: EditProject,
  range: RenderPlanRange,
): { readonly fromSec: number; readonly toSec: number } {
  const total = projectDurationSec(project)
  if (range.range === EDIT_EXPORT_RANGE_IDS.inOut) {
    const from = Math.max(0, range.inPointSec ?? 0)
    const to = Math.min(total, range.outPointSec ?? total)
    return { fromSec: from, toSec: to }
  }
  if (range.range === EDIT_EXPORT_RANGE_IDS.clip) {
    const track = range.track ?? EDIT_TRACK_IDS.video
    const clips = project.tracks[track]
    const index = clips.findIndex((clip) => clip.id === range.clipId)
    if (index < 0) {
      throw new RenderPlanError(
        RENDER_PLAN_ERROR_CODES.emptyRange,
        'Selected clip is not on the timeline.',
      )
    }
    const start = trackClipStarts(clips, isPositionedTrack(track))[index] ?? 0
    const clip = clips[index]
    return {
      fromSec: start,
      toSec: start + (clip ? clipDurationSec(clip) : 0),
    }
  }
  return { fromSec: 0, toSec: total }
}

interface SlicedClip {
  readonly clip: EditClip
  /** 素材本地秒 —— 窗口切完之后的入 / 出点。 */
  readonly in: number
  readonly out: number
  readonly startSec: number
  readonly durationSec: number
  /** 尾巴被窗口切掉的段不再接转场（它后面在成片里已经没有东西了）。 */
  readonly tailIntact: boolean
}

/**
 * 把一条轨道按时间线窗口裁一刀。**空数组 = 这条轨在窗口里什么都没有**。
 * `positioned` = 按段自己的起点摆（A 轨）；`skip` 为真的段不进成片（断挂的台词）。
 */
function sliceTrack(
  clips: readonly EditClip[],
  fromSec: number,
  toSec: number,
  positioned = false,
  skip?: (clip: EditClip) => boolean,
): readonly SlicedClip[] {
  const sliced: SlicedClip[] = []
  const starts = trackClipStarts(clips, positioned)
  for (const [index, clip] of clips.entries()) {
    if (skip?.(clip)) continue
    const duration = clipDurationSec(clip)
    const start = starts[index] ?? 0
    const end = start + duration
    const visibleStart = Math.max(start, fromSec)
    const visibleEnd = Math.min(end, toSec)
    if (visibleEnd - visibleStart < RENDER_MIN_SEGMENT_SEC) continue
    const speed = clip.speed || EDIT_CLIP_SPEED_DEFAULT
    sliced.push({
      clip,
      in: clip.in + (visibleStart - start) * speed,
      out: clip.in + (visibleEnd - start) * speed,
      startSec: visibleStart - fromSec,
      durationSec: visibleEnd - visibleStart,
      tailIntact: visibleEnd >= end - Number.EPSILON,
    })
  }
  return sliced
}

/**
 * 时间线 + 范围 + 输出设置 → **渲染计划**（`workers/render-video` 的输入）。
 *
 * ⚠ 纯函数：不读时钟、不发请求、不碰 React。所有「这条片子会长什么样」的算术都在
 * 这里做完，worker 只负责把它翻译成 ffmpeg 命令 —— 于是「导出的东西和时间线上看到
 * 的不一样」这类问题永远能在一个单测里复现。
 */
export function toRenderPlan(
  stored: EditProject,
  nodes: readonly NodeV4[],
  range: RenderPlanRange,
  settings: RenderPlanSettings,
): RenderPlan {
  // 挂件先归位：成片里的台词与字幕必须落在台面上看到的那一刻。
  const project = reflowAttachments(stored)
  if (project.tracks.video.length === 0) {
    throw new RenderPlanError(
      RENDER_PLAN_ERROR_CODES.emptyTimeline,
      'The timeline has no video clips.',
    )
  }

  const { fromSec, toSec } = resolveRenderWindow(project, range)
  if (toSec - fromSec < RENDER_MIN_SEGMENT_SEC) {
    throw new RenderPlanError(
      RENDER_PLAN_ERROR_CODES.emptyRange,
      'The selected range is empty.',
    )
  }

  const videoSlices = sliceTrack(project.tracks.video, fromSec, toSec)
  if (videoSlices.length === 0) {
    throw new RenderPlanError(
      RENDER_PLAN_ERROR_CODES.emptyRange,
      'The selected range contains no video.',
    )
  }

  const urlOf = (clip: EditClip): string => {
    const node = nodes.find((candidate) => candidate.id === clip.sourceNodeId)
    const url = currentUrlOf(node)
    if (!url) {
      throw new RenderPlanError(
        RENDER_PLAN_ERROR_CODES.missingSource,
        `Clip ${clip.id} has no playable source.`,
      )
    }
    return url
  }

  const video: RenderVideoSegment[] = videoSlices.map((slice, index) => {
    const isLast = index === videoSlices.length - 1
    // 尾巴被切掉的段、以及最后一段，都不接转场 —— 后面没有东西可接。
    const transition =
      isLast || !slice.tailIntact
        ? EDIT_TRANSITION_IDS.none
        : transitionOf(slice.clip)
    return {
      id: slice.clip.id,
      src: urlOf(slice.clip),
      in: slice.in,
      out: slice.out,
      speed: slice.clip.speed || EDIT_CLIP_SPEED_DEFAULT,
      muted: slice.clip.muted ?? false,
      transitionOut: transition,
      durationSec: slice.durationSec,
      sourceNodeId: slice.clip.sourceNodeId,
      ...(slice.clip.sourceVersionId
        ? { sourceVersionId: slice.clip.sourceVersionId }
        : {}),
    }
  })

  const toAudio = (slices: readonly SlicedClip[]): RenderAudioSegment[] =>
    slices.map((slice) => ({
      id: slice.clip.id,
      src: urlOf(slice.clip),
      in: slice.in,
      out: slice.out,
      speed: slice.clip.speed || EDIT_CLIP_SPEED_DEFAULT,
      gain: slice.clip.gain ?? 1,
      startSec: slice.startSec,
      durationSec: slice.durationSec,
      sourceNodeId: slice.clip.sourceNodeId,
    }))

  const audio = toAudio(
    sliceTrack(project.tracks.audio, fromSec, toSec, true, (clip) =>
      isAttachmentCut(project, clip.attach),
    ),
  )
  const music = toAudio(sliceTrack(project.tracks.music, fromSec, toSec))

  if (video.length + audio.length + music.length > RENDER_MAX_SEGMENTS) {
    throw new RenderPlanError(
      RENDER_PLAN_ERROR_CODES.tooManySegments,
      'The timeline has too many segments to render.',
    )
  }

  // ⚠ 叠化**重叠**：两段叠 0.5s，成片就短 0.5s。⛔ 不能拿轨道时长当成片时长。
  const overlap = video.reduce(
    (total, segment) => total + overlapSecOf(segment.transitionOut),
    0,
  )
  const videoDuration = video.reduce(
    (total, segment) => total + segment.durationSec,
    0,
  )
  const totalDurationSec = Math.max(0, videoDuration - overlap)

  if (totalDurationSec < RENDER_MIN_SEGMENT_SEC) {
    throw new RenderPlanError(
      RENDER_PLAN_ERROR_CODES.zeroDuration,
      'The rendered cut would be empty.',
    )
  }
  if (totalDurationSec > RENDER_MAX_DURATION_SEC) {
    throw new RenderPlanError(
      RENDER_PLAN_ERROR_CODES.tooLong,
      'The rendered cut is longer than the render limit.',
    )
  }

  const resolution = settings.resolution ?? project.settings.resolution
  const { width, height } = renderOutputDimensions(
    project.settings.aspect,
    resolution,
  )

  const texts = sliceTextTrack(
    project.tracks.text.filter(
      (clip) => !isAttachmentCut(project, clip.attach),
    ),
    fromSec,
    toSec,
    height,
  )

  return {
    version: RENDER_PLAN_VERSION,
    name: project.name.trim() || EDIT_PROJECT_FALLBACK_NAME,
    projectId: settings.projectId,
    output: {
      aspect: project.settings.aspect,
      resolution,
      width,
      height,
      fps: RENDER_OUTPUT_FPS,
    },
    video,
    audio,
    music,
    texts,
    totalDurationSec,
  }
}

/**
 * 字幕按导出窗口裁一刀 → 渲染层的 `texts[]`。
 *
 * ⚠ 与画面轨的 `sliceTrack` 是**两件事**：字幕没有素材，裁的只是「什么时候显示」，
 * 所以两端各自往窗口里收，内容一个字都不动。
 * ⚠ 字号 / 边距在这里换算成像素（`height` 是成片画面高）—— 见 `RenderTextSegment`。
 */
function sliceTextTrack(
  clips: readonly EditTextClip[],
  fromSec: number,
  toSec: number,
  heightPx: number,
): readonly RenderTextSegment[] {
  const segments: RenderTextSegment[] = []
  for (const clip of clips) {
    const start = Math.max(clip.startSec, fromSec)
    const end = Math.min(clip.startSec + clip.durationSec, toSec)
    if (end - start < RENDER_MIN_SEGMENT_SEC) continue
    const text = clip.text.trim()
    if (!text) continue
    segments.push({
      id: clip.id,
      text,
      startSec: start - fromSec,
      durationSec: end - start,
      anchor: clip.anchor,
      fontSizePx: Math.max(
        1,
        Math.round(heightPx * EDIT_TEXT_SIZE_SCALE[clip.size]),
      ),
      marginPx: Math.max(0, Math.round(heightPx * EDIT_TEXT_MARGIN_SCALE)),
      tone: clip.tone,
      // 淡入淡出不能长过段本身的一半 —— 否则两头的淡在中间撞上，字幕永远不满亮。
      fadeSec: Math.min(clip.fadeSec, (end - start) / 2),
    })
  }
  return segments
}
