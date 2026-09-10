/**
 * 一句话排片的**算术层**（S10 · spec §6，画板 `EditDeskAI.dc.html`）。
 *
 * ── 分工 ────────────────────────────────────────────────────────────────
 *  · 模型只吐**意图**（`TimelinePlanIntent`：顺序来源 / 每段取哪一截 / 转场 /
 *    语音对齐哪一段 / 配乐）；
 *  · 「取中间 5 秒」「叠化扣多少秒」「语音从第几段起」「配乐尾部淡出」全在这里，
 *    纯函数、可逐条钉住。
 *
 * ⚠ 一期**不调视频理解模型**（调研 `video-edit-models.md` §2）：中点 ± n/2 就是
 * 「画面最稳的 5 秒」的全部实现，右栏的文案照实说，⛔ 不假装看过画面。
 * ⛔ 不碰 React、不读时钟（`mintId` 注入）、不发请求。
 */

import {
  EDIT_CLIP_MIN_DURATION_SEC,
  EDIT_CLIP_SPEED_DEFAULT,
  EDIT_TRACK_IDS,
  EDIT_TRANSITION_IDS,
  TIMELINE_PLAN_COST_FREE,
  TIMELINE_PLAN_LIMITS,
  TIMELINE_PLAN_MUSIC_FADE_OUT_SEC,
  TIMELINE_PLAN_MUSIC_TAIL_GAIN,
  TIMELINE_PLAN_ORDER_IDS,
  TIMELINE_PLAN_TAKE_DEFAULT_SEC,
  TIMELINE_PLAN_TAKE_IDS,
} from '@/constants/edit-desk'
import { RENDER_CROSSFADE_SEC } from '@/constants/render-video'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  clipDurationSec,
  createEmptyEditProject,
  currentUrlOf,
  currentVersionIdOf,
  EDIT_CLIP_FALLBACK_DURATION_SEC,
} from '@/lib/edit-project'
import type {
  TimelinePlanIntent,
  TimelineProposal,
  TimelineProposalRationale,
} from '@/types/edit-desk-plan'
import type { EditClip, EditProject, NodeV4 } from '@/types/node-workflow'

/* ─── 排片看得见的那份事实（进提示词的也是它）──────────────────────────── */

export interface TimelinePlanAsset {
  readonly id: string
  readonly name: string
  readonly kind: 'video' | 'audio'
  readonly shotNo?: number
  /** 素材总长。量不到时是 `EDIT_CLIP_FALLBACK_DURATION_SEC`。 */
  readonly durationSec: number
  readonly versionId?: string
}

export interface TimelinePlanScriptLine {
  readonly nodeId: string
  readonly shotNo?: number
  readonly text: string
}

export interface TimelinePlanFacts {
  readonly assets: readonly TimelinePlanAsset[]
  readonly script: readonly TimelinePlanScriptLine[]
  /** 现有时间线（没进过剪辑台时缺席）。 */
  readonly project?: EditProject
}

/**
 * 画布 → 排片能看见的东西。
 *
 * ⚠ 只收**有产物**的视频 / 音频卡：没有 url 的卡摆进时间线是一段导不出的空片。
 * ⚠ 剧本**原样保序**（调用方给的节点顺序就是剧本顺序），⛔ 不按 `shotNo` 重排：
 *   那会让「按剧本顺序」和「按镜号」变成同一件事，而这两条正是用户要区分的
 *   —— 剧本先讲了第二镜，成片就该先出第二镜。
 */
export function collectTimelinePlanFacts(
  nodes: readonly NodeV4[],
  project?: EditProject,
): TimelinePlanFacts {
  const assets: TimelinePlanAsset[] = []
  const script: TimelinePlanScriptLine[] = []

  for (const node of nodes) {
    const data = node.data
    if (data.kind === NODE_MEDIA_KIND_IDS.text) {
      const text = data.body.trim()
      if (!text) continue
      script.push({
        nodeId: node.id,
        ...(data.shotNo === undefined ? {} : { shotNo: data.shotNo }),
        text: text.slice(0, TIMELINE_PLAN_LIMITS.maxScriptLineLength),
      })
      continue
    }
    if (
      data.kind !== NODE_MEDIA_KIND_IDS.video &&
      data.kind !== NODE_MEDIA_KIND_IDS.audio
    ) {
      continue
    }
    if (!currentUrlOf(node)) continue
    const duration = data.durationSec ?? 0
    const versionId = currentVersionIdOf(node)
    assets.push({
      id: node.id,
      name:
        data.kind === NODE_MEDIA_KIND_IDS.video
          ? (data.label ?? data.name)
          : data.name,
      kind: data.kind === NODE_MEDIA_KIND_IDS.video ? 'video' : 'audio',
      ...(data.shotNo === undefined ? {} : { shotNo: data.shotNo }),
      durationSec: duration > 0 ? duration : EDIT_CLIP_FALLBACK_DURATION_SEC,
      ...(versionId ? { versionId } : {}),
    })
  }

  return {
    assets: assets.slice(0, TIMELINE_PLAN_LIMITS.maxAssets),
    script: script.slice(0, TIMELINE_PLAN_LIMITS.maxScriptLines),
    ...(project ? { project } : {}),
  }
}

function sortByShotNo<T extends { readonly shotNo?: number }>(
  items: readonly T[],
): readonly T[] {
  // ⚠ 稳定排序：没有镜号的排在后面且保持画布顺序 —— ⛔ 不给它们编一个号
  //   （编号一次，增删节点后同一句台词就跑到另一镜去了）。
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const left = a.item.shotNo ?? Number.POSITIVE_INFINITY
      const right = b.item.shotNo ?? Number.POSITIVE_INFINITY
      if (left !== right) return left - right
      return a.index - b.index
    })
    .map((entry) => entry.item)
}

/* ─── 意图 + 事实 → 提案 ───────────────────────────────────────────────── */

export interface BuildTimelineProposalOptions {
  /** 段 id 生成器（测试注入可预测值）。 */
  mintId(prefix: string): string
  /** 时间线还没有名字时用它（i18n 由调用方给）。 */
  readonly defaultName: string
}

/** `null` = 一段都摆不出来（画布上没有能用的视频卡，或模型点名的全是幻觉）。 */
export function buildTimelineProposal(
  intent: TimelinePlanIntent,
  facts: TimelinePlanFacts,
  options: BuildTimelineProposalOptions,
): TimelineProposal | null {
  const byId = new Map(facts.assets.map((asset) => [asset.id, asset]))
  const videos = orderVideoAssets(intent, facts, byId)
  if (videos.length === 0) return null

  const takeSeconds = intent.takeSeconds ?? TIMELINE_PLAN_TAKE_DEFAULT_SEC
  const reasonByNodeId = new Map(
    intent.reasons.map((entry) => [entry.nodeId, entry.reason]),
  )

  const videoClips: EditClip[] = []
  const rationale: TimelineProposalRationale[] = []

  videos.forEach((asset, index) => {
    const window = takeWindow(asset.durationSec, intent.take, takeSeconds)
    const isLast = index === videos.length - 1
    const clip: EditClip = {
      id: options.mintId('clip'),
      sourceNodeId: asset.id,
      ...(asset.versionId ? { sourceVersionId: asset.versionId } : {}),
      in: window.in,
      out: window.out,
      speed: EDIT_CLIP_SPEED_DEFAULT,
      muted: false,
      // ⚠ 最后一段不接转场：它后面已经没有东西了（与 `toRenderPlan` 同一条判据）。
      ...(isLast || intent.transition === EDIT_TRANSITION_IDS.none
        ? {}
        : { transitionOut: intent.transition }),
    }
    videoClips.push(clip)
    const reason = reasonByNodeId.get(asset.id)
    rationale.push({
      clipId: clip.id,
      nodeId: asset.id,
      take: intent.take,
      inSec: window.in,
      outSec: window.out,
      sourceDurationSec: asset.durationSec,
      ...(reason ? { reason } : {}),
    })
  })

  const videoDurationSec = timelineDurationSec(videoClips)

  const audioClips = buildVoiceClips(intent, byId, videoClips, options)
  const musicClips = buildMusicClips(intent, byId, videoDurationSec, options)

  const base = facts.project ?? createEmptyEditProject(options.defaultName)
  const project: EditProject = {
    ...base,
    tracks: {
      video: videoClips,
      audio: audioClips,
      music: musicClips,
      // ⚠ 排片**不碰字幕**（S8d）：一句话排片摆的是画面与声音，用户自己写的那几句
      // 字幕不该被一次排片抹掉 —— 原样带过来。
      text: base.tracks.text,
    },
  }

  return {
    project,
    rationale,
    summary: intent.summary,
    counts: {
      clipsChanged: videoClips.length,
      tracksAdded:
        (audioClips.length > 0 ? 1 : 0) + (musicClips.length > 0 ? 1 : 0),
    },
    cost: TIMELINE_PLAN_COST_FREE,
  }
}

/**
 * 成片时长 = V 轨段长之和 **减去叠化重叠**。
 *
 * ⚠ 与 `toRenderPlan` 同一条算术（两段叠 0.5s 成片就短 0.5s），⛔ 别拿轨道时长
 * 当成片时长 —— 提案卡上写「共 20s」而导出来是 18.5s 是最难被发现的那种错。
 */
export function timelineDurationSec(clips: readonly EditClip[]): number {
  const total = clips.reduce((sum, clip) => sum + clipDurationSec(clip), 0)
  const overlap = clips.reduce(
    (sum, clip) =>
      sum +
      (clip.transitionOut === EDIT_TRANSITION_IDS.crossfade
        ? RENDER_CROSSFADE_SEC
        : 0),
    0,
  )
  return Math.max(0, total - overlap)
}

/**
 * 一段取哪一截。
 *
 * ⚠ 想取的比素材还长时**取整段**，⛔ 不把出点推到素材之外（那一截渲染出来是黑的）。
 */
export function takeWindow(
  durationSec: number,
  take: TimelinePlanIntent['take'],
  seconds: number,
): { readonly in: number; readonly out: number } {
  const total = Math.max(0, durationSec)
  if (take === TIMELINE_PLAN_TAKE_IDS.full) return { in: 0, out: total }

  const want = Math.max(EDIT_CLIP_MIN_DURATION_SEC, seconds)
  if (want >= total) return { in: 0, out: total }

  if (take === TIMELINE_PLAN_TAKE_IDS.head) return { in: 0, out: want }
  if (take === TIMELINE_PLAN_TAKE_IDS.tail) {
    return { in: total - want, out: total }
  }
  // middle：中点 ± n/2。
  const start = round3((total - want) / 2)
  return { in: start, out: round3(start + want) }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function orderVideoAssets(
  intent: TimelinePlanIntent,
  facts: TimelinePlanFacts,
  byId: ReadonlyMap<string, TimelinePlanAsset>,
): readonly TimelinePlanAsset[] {
  const allVideos = facts.assets.filter((asset) => asset.kind === 'video')
  // ⚠ 陌生 id 一律丢（模型编的），空名单 = 全部。
  const picked =
    intent.videoNodeIds.length > 0
      ? intent.videoNodeIds
          .map((id) => byId.get(id))
          .filter(
            (asset): asset is TimelinePlanAsset =>
              Boolean(asset) && asset?.kind === 'video',
          )
      : allVideos

  const deduped: TimelinePlanAsset[] = []
  const seen = new Set<string>()
  for (const asset of picked) {
    if (seen.has(asset.id)) continue
    seen.add(asset.id)
    deduped.push(asset)
  }

  if (intent.order === TIMELINE_PLAN_ORDER_IDS.asIs) return deduped
  if (intent.order === TIMELINE_PLAN_ORDER_IDS.shot) {
    return sortByShotNo(deduped)
  }

  // script：按剧本行的先后。剧本行认镜号；一条剧本行都对不上时退回镜号序 ——
  // ⛔ 不退回「画布顺序」：那是布局，不是叙事。
  const scriptRank = new Map<number, number>()
  facts.script.forEach((line, index) => {
    if (line.shotNo === undefined) return
    if (!scriptRank.has(line.shotNo)) scriptRank.set(line.shotNo, index)
  })
  if (scriptRank.size === 0) return sortByShotNo(deduped)

  return [...deduped]
    .map((asset, index) => ({ asset, index }))
    .sort((a, b) => {
      const left =
        a.asset.shotNo === undefined
          ? Number.POSITIVE_INFINITY
          : (scriptRank.get(a.asset.shotNo) ?? Number.POSITIVE_INFINITY)
      const right =
        b.asset.shotNo === undefined
          ? Number.POSITIVE_INFINITY
          : (scriptRank.get(b.asset.shotNo) ?? Number.POSITIVE_INFINITY)
      if (left !== right) return left - right
      return a.index - b.index
    })
    .map((entry) => entry.asset)
}

/**
 * 语音轨。
 *
 * ── 为什么「对齐第 k 段」要多摆一段静音 ────────────────────────────────
 * `EditClip` 上**没有 offset**（S8 的论据：存 offset 的版本一换序就全成旧值）。
 * 轨道上的段首尾相接，于是「从第 2 段开始说话」唯一能表达的形态就是前面先垫一段
 * **静音**（同一张卡、`gain: 0` + `muted`）。⛔ 不改数据模型来做这一件事，也不在
 * 摘要里许一个时间线上根本不存在的承诺。
 */
function buildVoiceClips(
  intent: TimelinePlanIntent,
  byId: ReadonlyMap<string, TimelinePlanAsset>,
  videoClips: readonly EditClip[],
  options: BuildTimelineProposalOptions,
): EditClip[] {
  const voice = intent.voice
  if (!voice) return []
  const asset = byId.get(voice.nodeId)
  if (!asset || asset.kind !== 'audio') return []

  const clips: EditClip[] = []
  const index = Math.min(voice.alignToIndex, videoClips.length)
  const leadSec = round3(timelineDurationSec(videoClips.slice(0, index)))
  if (leadSec >= EDIT_CLIP_MIN_DURATION_SEC) {
    clips.push({
      id: options.mintId('clip'),
      sourceNodeId: asset.id,
      ...(asset.versionId ? { sourceVersionId: asset.versionId } : {}),
      in: 0,
      out: leadSec,
      speed: EDIT_CLIP_SPEED_DEFAULT,
      muted: true,
      gain: 0,
    })
  }
  clips.push({
    id: options.mintId('clip'),
    sourceNodeId: asset.id,
    ...(asset.versionId ? { sourceVersionId: asset.versionId } : {}),
    in: 0,
    out: asset.durationSec,
    speed: EDIT_CLIP_SPEED_DEFAULT,
    muted: false,
  })
  return clips
}

/**
 * 配乐轨：裁到与画面同长，尾部淡出。
 *
 * ⚠ 淡出在一期是**两段**（正常 + 尾段降到 `TIMELINE_PLAN_MUSIC_TAIL_GAIN`）——
 * 渲染层还没有 `fade` 字段，理由与那条常量的头注同源。
 */
function buildMusicClips(
  intent: TimelinePlanIntent,
  byId: ReadonlyMap<string, TimelinePlanAsset>,
  videoDurationSec: number,
  options: BuildTimelineProposalOptions,
): EditClip[] {
  const music = intent.music
  if (!music) return []
  const asset = byId.get(music.nodeId)
  if (!asset || asset.kind !== 'audio') return []

  const total = round3(Math.min(asset.durationSec, videoDurationSec))
  if (total < EDIT_CLIP_MIN_DURATION_SEC) return []

  const fadeOutSec = Math.min(
    music.fadeOutSec ?? TIMELINE_PLAN_MUSIC_FADE_OUT_SEC,
    total,
  )
  const bodySec = round3(total - fadeOutSec)

  const clips: EditClip[] = []
  if (bodySec >= EDIT_CLIP_MIN_DURATION_SEC) {
    clips.push({
      id: options.mintId('clip'),
      sourceNodeId: asset.id,
      ...(asset.versionId ? { sourceVersionId: asset.versionId } : {}),
      in: 0,
      out: bodySec,
      speed: EDIT_CLIP_SPEED_DEFAULT,
      muted: false,
    })
  }
  const tailIn = clips.length > 0 ? bodySec : 0
  if (round3(total - tailIn) >= EDIT_CLIP_MIN_DURATION_SEC) {
    clips.push({
      id: options.mintId('clip'),
      sourceNodeId: asset.id,
      ...(asset.versionId ? { sourceVersionId: asset.versionId } : {}),
      in: tailIn,
      out: total,
      speed: EDIT_CLIP_SPEED_DEFAULT,
      muted: false,
      gain: TIMELINE_PLAN_MUSIC_TAIL_GAIN,
    })
  }
  return clips
}

/** 提案里 V 轨的段 id 集合 —— 幽灵段渲染与「逐段看」共用。 */
export function proposalClipIds(proposal: TimelineProposal): readonly string[] {
  return proposal.project.tracks[EDIT_TRACK_IDS.video].map((clip) => clip.id)
}
