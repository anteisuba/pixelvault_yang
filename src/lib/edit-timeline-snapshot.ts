/**
 * 时间线 → 给模型读的快照（`docs/references/mcp.md` §4.1）。
 *
 * ⚠ 外部 Claude（MCP `read_project`）与站内助手的画布快照用**同一个**构建函数，
 * ⛔ 不各写一份形状：两份形状迟早会在「起点怎么算」上说出两个答案。
 *
 * 纯函数：只读 `state.edit` 与节点，不碰 DOM、不发请求。秒数保留三位小数——
 * 模型不需要浮点尾巴，少的是 token。
 */

import {
  EDIT_TRACKS,
  EDIT_TRANSITION_IDS,
  type EditTrackId,
} from '@/constants/edit-desk'
import {
  clipDurationSec,
  clipLocalTimeSec,
  isAttachmentCut,
  isPositionedTrack,
  projectDurationSec,
  readClipSource,
  reflowAttachments,
  trackClipStarts,
} from '@/lib/edit-project'
import type {
  EditAttachment,
  EditClip,
  EditProject,
  NodeV4,
} from '@/types/node-workflow'

/** 台词 / 字幕挂在主线哪一段的哪一帧（素材本地秒）。 */
export interface TimelineSnapshotAttach {
  readonly clipId: string
  readonly atSec: number
}

export interface TimelineSnapshotClip {
  readonly clipId: string
  readonly track: EditTrackId
  /** 这条轨上的第几段（0 起）。 */
  readonly index: number
  readonly sourceNodeId: string
  readonly sourceName?: string
  /** 来源卡已经不在画布上了。 */
  readonly sourceMissing?: true
  /** 时间线秒。 */
  readonly startSec: number
  readonly endSec: number
  /** 素材本地秒（裁剪入出点）。 */
  readonly inSec: number
  readonly outSec: number
  readonly speed: number
  /** 段尾接下一段的转场；缺席 = 硬切。 */
  readonly transitionOut?: string
  /** 原声关了（只对 V 轨有意义）。 */
  readonly muted?: true
  readonly gain?: number
  /** 来源卡出了新版本，这段还是旧的。 */
  readonly stale?: true
  /** 台词（A 轨）挂在主线哪一段的哪一帧；主线还空着时缺席。 */
  readonly attachedTo?: TimelineSnapshotAttach
  /** 挂点那一帧被裁掉了：导出时不出声，挪一下就按落点重新挂上。 */
  readonly cut?: true
}

export interface TimelineSnapshotText {
  readonly textId: string
  readonly text: string
  readonly startSec: number
  readonly endSec: number
  readonly anchor: string
  readonly size: string
  readonly tone: string
  readonly fadeSec: number
  readonly attachedTo?: TimelineSnapshotAttach
  /** 挂点那一帧被裁掉了：导出时不出字。 */
  readonly cut?: true
}

export interface TimelineSnapshot {
  readonly name: string
  readonly durationSec: number
  readonly aspect: string
  readonly resolution: string
  readonly clips: readonly TimelineSnapshotClip[]
  readonly texts: readonly TimelineSnapshotText[]
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

function attachFacts(
  edit: EditProject,
  attach: EditAttachment | undefined,
): { attachedTo?: TimelineSnapshotAttach; cut?: true } {
  if (!attach) return {}
  return {
    attachedTo: { clipId: attach.clipId, atSec: round(attach.atSec) },
    ...(isAttachmentCut(edit, attach) ? { cut: true as const } : {}),
  }
}

export function buildTimelineSnapshot(
  stored: EditProject | undefined,
  nodes: readonly NodeV4[],
): TimelineSnapshot | null {
  if (!stored) return null
  // 挂件先归位：模型读到的起点必须与台面、成片里的同一刻。
  const edit = reflowAttachments(stored)

  const clips: TimelineSnapshotClip[] = []
  for (const track of EDIT_TRACKS) {
    const trackClips = edit.tracks[track]
    const starts = trackClipStarts(trackClips, isPositionedTrack(track))
    trackClips.forEach((clip, index) => {
      const source = readClipSource(nodes, clip)
      const startSec = starts[index] ?? 0
      const transition = clip.transitionOut
      clips.push({
        clipId: clip.id,
        track,
        index,
        sourceNodeId: clip.sourceNodeId,
        ...(source.node?.data.name
          ? { sourceName: source.node.data.name }
          : {}),
        ...(source.exists ? {} : { sourceMissing: true as const }),
        startSec: round(startSec),
        endSec: round(startSec + clipDurationSec(clip)),
        inSec: round(clip.in),
        outSec: round(clip.out),
        speed: clip.speed,
        ...(transition && transition !== EDIT_TRANSITION_IDS.none
          ? { transitionOut: transition }
          : {}),
        ...(clip.muted ? { muted: true as const } : {}),
        ...(clip.gain !== undefined ? { gain: clip.gain } : {}),
        ...(source.stale ? { stale: true as const } : {}),
        ...(isPositionedTrack(track) ? attachFacts(edit, clip.attach) : {}),
      })
    })
  }

  return {
    name: edit.name,
    durationSec: round(projectDurationSec(edit)),
    aspect: edit.settings.aspect,
    resolution: edit.settings.resolution,
    clips,
    texts: edit.tracks.text.map((text) => ({
      textId: text.id,
      text: text.text,
      startSec: round(text.startSec),
      endSec: round(text.startSec + text.durationSec),
      anchor: text.anchor,
      size: text.size,
      tone: text.tone,
      fadeSec: text.fadeSec,
      ...attachFacts(edit, text.attach),
    })),
  }
}

export interface TimelineClipHit {
  readonly track: EditTrackId
  readonly clip: EditClip
  readonly startSec: number
  readonly durationSec: number
}

/** 按段 id 找段（字幕段不在这里：它没有画面来源）。 */
export function findTimelineClip(
  stored: EditProject | undefined,
  clipId: string,
): TimelineClipHit | null {
  if (!stored) return null
  const edit = reflowAttachments(stored)
  for (const track of EDIT_TRACKS) {
    const trackClips = edit.tracks[track]
    const index = trackClips.findIndex((clip) => clip.id === clipId)
    const clip = trackClips[index]
    if (!clip) continue
    return {
      track,
      clip,
      startSec:
        trackClipStarts(trackClips, isPositionedTrack(track))[index] ?? 0,
      durationSec: clipDurationSec(clip),
    }
  }
  return null
}

/**
 * 时间线秒 → 这段素材的本地秒（裁剪与倍速都算进去）。落在段外 = `null`。
 * ⚠ 段尾那一刻算段外：它已经是下一段的第一帧。
 */
export function timelineToSourceSec(
  hit: TimelineClipHit,
  timelineSec: number,
): number | null {
  const offset = timelineSec - hit.startSec
  if (offset < 0 || offset >= hit.durationSec) return null
  return clipLocalTimeSec(hit.clip, offset)
}
