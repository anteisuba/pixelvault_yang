/**
 * 时间线台面的**布局**（v2 第 3 片 3b）：每一段、每一条挂件此刻画在哪一秒。
 *
 * ⭐ 拖的途中台面画的是「假如现在松手」的那一份时间线 —— 拖动预览先改出一份项目，
 *   再过一遍 `reflowAttachments`（与 op 执行器落表时同一条规则），所以：
 *   - 拖主线段换位 / 裁剪时，后面的段和挂在它们上面的台词、字幕**实时**跟着走；
 *   - 拖台词 / 字幕时，松手会挂到哪一段（换挂点）在拖的途中就看得见。
 *   ⛔ 台面不另写一套「挂件跟着谁走」的算法：那会和落表那一份漂开。
 * 松手后发的 op 与预览改的是同一组字段，落表结果与最后一帧预览逐秒相同 —— 磁性动效
 * 因此只在「别的东西改了时间线」（删段、撤销、助手、MCP）时才真的滑起来。
 */

import type { EditTrackId } from '@/constants/edit-desk'
import { EDIT_TRACKS, EDIT_TRACK_IDS } from '@/constants/edit-desk'
import {
  clipDurationSec,
  isPositionedTrack,
  reflowAttachments,
  trackClipStarts,
  withAttach,
} from '@/lib/edit-project'
import type {
  EditAttachment,
  EditClip,
  EditProject,
  EditTextClip,
} from '@/types/node-workflow'

/** 素材拖进来时那一格空位的 id（布局里有它，台面画成一个虚线槽）。 */
export const EDIT_DROP_SLOT_ID = '__edit_drop_slot__'

/** 拖的途中那一份预览改了什么（每种手势一种）。 */
export type TimelineDragPreview =
  /** 首尾相接的轨（主线 / 配乐）上按住段换位置。 */
  | {
      readonly kind: 'move'
      readonly track: EditTrackId
      readonly clipId: string
      readonly toIndex: number
    }
  /** 拖段两端裁剪；按起点摆的轨（台词）拖左端时起点跟着动。 */
  | {
      readonly kind: 'trim'
      readonly track: EditTrackId
      readonly clipId: string
      readonly in: number
      readonly out: number
      readonly startSec?: number
      /** 拖的是哪一端（读数与变长的手柄跟它走；布局不读）。 */
      readonly edge?: 'in' | 'out'
      /**
       * 拖出素材长度那一截（时间线秒，已按阻力折过，样片 B）：只拉长**画出来**的这一段，
       * 后面跟着让；松手不落库。
       */
      readonly stretchSec?: number
    }
  /** 按起点摆的轨（台词）上拖段：改起点、按落点重新挂。 */
  | {
      readonly kind: 'shift'
      readonly track: EditTrackId
      readonly clipId: string
      readonly startSec: number
    }
  /**
   * 从素材栏拖一张卡过来、还没松手（换皮 R4 · 样片 AF）：在落点那一格插一段**空位**
   * （`EDIT_DROP_SLOT_ID`），首尾相接的轨上后面的段让出这么宽；按起点摆的轨（台词）
   * 空位就落在 `startSec`。空位只是画出来的，⛔ 不进项目。
   */
  | {
      readonly kind: 'insert'
      readonly track: EditTrackId
      readonly index: number
      readonly startSec: number
      readonly durationSec: number
    }
  /** 字幕段挪位置或裁两端；`reattach` = 起点动了，按落点重新挂（与 op 执行器同一条）。 */
  | {
      readonly kind: 'text'
      readonly clipId: string
      readonly startSec: number
      readonly durationSec: number
      readonly reattach: boolean
    }

export interface TimelineSpan {
  readonly startSec: number
  readonly durationSec: number
  /** 挂在主线哪一段的哪一帧（台词 / 字幕；主线还空着时缺席）。 */
  readonly attach?: EditAttachment
}

export interface TimelineLayout {
  /** 预览改过、归位过的那一份项目（断挂判据等都读它）。 */
  readonly project: EditProject
  /** 三条轨上每一段的位置，按段 id 取。 */
  readonly clips: ReadonlyMap<string, TimelineSpan>
  /** 每一条字幕的位置。 */
  readonly texts: ReadonlyMap<string, TimelineSpan>
  /** 每条轨上段的顺序（换位预览会改它）。 */
  readonly order: Readonly<Record<EditTrackId, readonly string[]>>
}

function patchClip(
  clips: readonly EditClip[],
  clipId: string,
  patch: (clip: EditClip) => EditClip,
): EditClip[] {
  return clips.map((clip) => (clip.id === clipId ? patch(clip) : clip))
}

function patchText(
  clips: readonly EditTextClip[],
  clipId: string,
  patch: (clip: EditTextClip) => EditTextClip,
): EditTextClip[] {
  return clips.map((clip) => (clip.id === clipId ? patch(clip) : clip))
}

/** 把预览那一手落到一份**新的**项目上（⛔ 不改入参）。 */
export function applyTimelinePreview(
  project: EditProject,
  preview: TimelineDragPreview,
): EditProject {
  const { tracks } = project
  switch (preview.kind) {
    case 'move': {
      const clips = [...tracks[preview.track]]
      const from = clips.findIndex((clip) => clip.id === preview.clipId)
      if (from < 0) return project
      const [moving] = clips.splice(from, 1)
      if (!moving) return project
      clips.splice(
        Math.max(0, Math.min(clips.length, preview.toIndex)),
        0,
        moving,
      )
      return { ...project, tracks: { ...tracks, [preview.track]: clips } }
    }
    case 'trim':
      return {
        ...project,
        tracks: {
          ...tracks,
          [preview.track]: patchClip(
            tracks[preview.track],
            preview.clipId,
            (clip) => {
              const trimmed = {
                ...clip,
                in: preview.in,
                out:
                  preview.out + (preview.stretchSec ?? 0) * (clip.speed || 1),
              }
              return preview.startSec === undefined
                ? trimmed
                : withAttach(
                    { ...trimmed, startSec: preview.startSec },
                    undefined,
                  )
            },
          ),
        },
      }
    case 'insert': {
      const clips = [...tracks[preview.track]]
      const slot: EditClip = {
        id: EDIT_DROP_SLOT_ID,
        sourceNodeId: '',
        in: 0,
        out: preview.durationSec,
        speed: 1,
        muted: true,
        ...(isPositionedTrack(preview.track)
          ? { startSec: preview.startSec }
          : {}),
      }
      clips.splice(Math.max(0, Math.min(clips.length, preview.index)), 0, slot)
      return { ...project, tracks: { ...tracks, [preview.track]: clips } }
    }
    case 'shift':
      return {
        ...project,
        tracks: {
          ...tracks,
          [preview.track]: patchClip(
            tracks[preview.track],
            preview.clipId,
            (clip) =>
              withAttach({ ...clip, startSec: preview.startSec }, undefined),
          ),
        },
      }
    case 'text':
      return {
        ...project,
        tracks: {
          ...tracks,
          text: patchText(tracks.text, preview.clipId, (clip) => {
            const next = {
              ...clip,
              startSec: preview.startSec,
              durationSec: preview.durationSec,
            }
            return preview.reattach ? withAttach(next, undefined) : next
          }),
        },
      }
  }
}

export function buildTimelineLayout(
  project: EditProject,
  preview: TimelineDragPreview | null = null,
): TimelineLayout {
  const placed = reflowAttachments(
    preview ? applyTimelinePreview(project, preview) : project,
  )
  const clips = new Map<string, TimelineSpan>()
  const order = {} as Record<EditTrackId, readonly string[]>
  for (const track of EDIT_TRACKS) {
    const trackClips = placed.tracks[track]
    const starts = trackClipStarts(trackClips, isPositionedTrack(track))
    order[track] = trackClips.map((clip) => clip.id)
    trackClips.forEach((clip, index) => {
      clips.set(clip.id, {
        startSec: starts[index] ?? 0,
        durationSec: clipDurationSec(clip),
        ...(track === EDIT_TRACK_IDS.audio && clip.attach
          ? { attach: clip.attach }
          : {}),
      })
    })
  }
  const texts = new Map<string, TimelineSpan>()
  for (const clip of placed.tracks.text) {
    texts.set(clip.id, {
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      ...(clip.attach ? { attach: clip.attach } : {}),
    })
  }
  return { project: placed, clips, texts, order }
}
