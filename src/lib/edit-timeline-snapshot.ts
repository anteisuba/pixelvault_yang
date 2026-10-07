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
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  clipDurationSec,
  clipLocalTimeSec,
  isAttachmentCut,
  isPositionedTrack,
  projectDurationSec,
  defaultTrackFor,
  listEditableAssets,
  readClipSource,
  reflowAttachments,
  trackClipStarts,
} from '@/lib/edit-project'
import type {
  TimelineSnapshot,
  TimelineSnapshotAsset,
  TimelineSnapshotAttach,
  TimelineSnapshotClip,
} from '@/types/edit-timeline-snapshot'
import type {
  EditAttachment,
  EditClip,
  EditProject,
  NodeV4,
} from '@/types/node-workflow'

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

/**
 * 画布上剪得进时间线的卡（有产物的视频 / 音频）—— 剪辑台左栏「画布素材」那一列。
 * 模型加段时 `sourceNodeId` 只能从这里挑，`durationSec` 就是它能给的最大出点。
 */
export function buildTimelineAssets(
  nodes: readonly NodeV4[],
): readonly TimelineSnapshotAsset[] {
  return listEditableAssets({
    version: 4,
    nodes: [...nodes],
    edges: [],
  }).flatMap((node) => {
    const data = node.data
    if (
      data.kind !== NODE_MEDIA_KIND_IDS.video &&
      data.kind !== NODE_MEDIA_KIND_IDS.audio
    ) {
      return []
    }
    const track = defaultTrackFor(node)
    if (!track) return []
    return [
      {
        nodeId: node.id,
        name: data.name ?? node.id,
        kind: data.kind,
        track,
        ...(data.durationSec ? { durationSec: round(data.durationSec) } : {}),
      },
    ]
  })
}
