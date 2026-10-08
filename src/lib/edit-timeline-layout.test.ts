import { describe, expect, it } from 'vitest'

import { buildTimelineLayout } from '@/lib/edit-timeline-layout'
import type { EditClip, EditProject, EditTextClip } from '@/types/node-workflow'

/**
 * 剪辑台 v2 第 3 片 3b：拖的途中台面画「假如现在松手」的那一份时间线 —— 挂件跟着
 * 主线实时走、换挂点在拖的途中就看得见。
 */

function clip(patch: Partial<EditClip> & { id: string }): EditClip {
  return { sourceNodeId: 'v', in: 0, out: 4, speed: 1, muted: false, ...patch }
}

function caption(
  patch: Partial<EditTextClip> & { id: string; startSec: number },
): EditTextClip {
  return {
    text: patch.id,
    durationSec: 1,
    anchor: 'bc',
    size: 'm',
    tone: 'light',
    fadeSec: 0,
    ...patch,
  }
}

/** 主线 a 0–4 · b 4–8；台词 l 挂在 b 的素材 1 秒（时间线 5 秒）；字幕 t 挂在 a 的 2 秒。 */
function fixture(): EditProject {
  return {
    name: '成片',
    tracks: {
      video: [clip({ id: 'a' }), clip({ id: 'b' })],
      audio: [
        clip({
          id: 'l',
          out: 1,
          startSec: 5,
          attach: { clipId: 'b', atSec: 1 },
        }),
      ],
      music: [],
      text: [
        caption({ id: 't', startSec: 2, attach: { clipId: 'a', atSec: 2 } }),
      ],
    },
    settings: { aspect: '16:9', resolution: '1080p' },
  }
}

describe('buildTimelineLayout', () => {
  it('不拖时就是落表的那一份', () => {
    const layout = buildTimelineLayout(fixture())
    expect(layout.clips.get('b')?.startSec).toBe(4)
    expect(layout.clips.get('l')).toMatchObject({
      startSec: 5,
      attach: { clipId: 'b', atSec: 1 },
    })
    expect(layout.texts.get('t')?.startSec).toBe(2)
    expect(layout.order.video).toEqual(['a', 'b'])
  })

  it('换位预览：段换序，挂件跟着各自的段走', () => {
    const layout = buildTimelineLayout(fixture(), {
      kind: 'move',
      track: 'video',
      clipId: 'b',
      toIndex: 0,
    })
    expect(layout.order.video).toEqual(['b', 'a'])
    expect(layout.clips.get('a')?.startSec).toBe(4)
    // l 挂在 b 的 1 秒：b 挪到最前，l 跟到 1 秒；t 挂在 a 的 2 秒：跟到 6 秒
    expect(layout.clips.get('l')?.startSec).toBe(1)
    expect(layout.texts.get('t')?.startSec).toBe(6)
  })

  it('裁剪预览：后面的段与挂件实时跟上，⛔ 不等松手', () => {
    const layout = buildTimelineLayout(fixture(), {
      kind: 'trim',
      track: 'video',
      clipId: 'a',
      in: 0,
      out: 3,
    })
    expect(layout.clips.get('b')?.startSec).toBe(3)
    expect(layout.clips.get('l')?.startSec).toBe(4)
  })

  it('拖出素材长度（样片 B）：只把画出来的这一段拉长，后面跟着让', () => {
    const layout = buildTimelineLayout(fixture(), {
      kind: 'trim',
      track: 'video',
      clipId: 'a',
      edge: 'out',
      in: 0,
      out: 4,
      stretchSec: 0.6,
    })
    expect(layout.clips.get('a')?.durationSec).toBeCloseTo(4.6)
    expect(layout.clips.get('b')?.startSec).toBeCloseTo(4.6)
  })

  it('拖台词：按落点重新挂 —— 宿主在拖的途中就换了', () => {
    const layout = buildTimelineLayout(fixture(), {
      kind: 'shift',
      track: 'audio',
      clipId: 'l',
      startSec: 1.5,
    })
    expect(layout.clips.get('l')).toMatchObject({
      startSec: 1.5,
      attach: { clipId: 'a', atSec: 1.5 },
    })
  })

  it('拖字幕：挪起点重新挂；只裁尾巴不换挂点', () => {
    const moved = buildTimelineLayout(fixture(), {
      kind: 'text',
      clipId: 't',
      startSec: 6,
      durationSec: 1,
      reattach: true,
    })
    expect(moved.texts.get('t')?.attach).toEqual({ clipId: 'b', atSec: 2 })

    const trimmed = buildTimelineLayout(fixture(), {
      kind: 'text',
      clipId: 't',
      startSec: 2,
      durationSec: 3,
      reattach: false,
    })
    expect(trimmed.texts.get('t')).toMatchObject({
      durationSec: 3,
      attach: { clipId: 'a', atSec: 2 },
    })
  })

  it('⛔ 不改入参', () => {
    const project = fixture()
    buildTimelineLayout(project, {
      kind: 'move',
      track: 'video',
      clipId: 'b',
      toIndex: 0,
    })
    expect(project.tracks.video.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
