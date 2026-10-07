import { describe, expect, it } from 'vitest'

import { EDIT_EXPORT_RANGE_IDS, EDIT_TRACK_IDS } from '@/constants/edit-desk'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  attachAt,
  isAttachmentCut,
  reflowAttachments,
  splitMainClipAt,
  splitPositionedClipAt,
  splitTextClipAt,
  toRenderPlan,
} from '@/lib/edit-project'
import {
  applyInverseV4,
  applyNodeAssistantOpV4,
  type ApplyOpV4Context,
} from '@/lib/node-assistant-op-apply-v4'
import type {
  EditClip,
  EditProject,
  EditTextClip,
  NodeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/**
 * 剪辑台 v2 第 1 片：台词（A 轨）与字幕（T 轨）挂在主线某一段的某一帧上
 * （spec §6「磁性主线 + 挂件」，关键切片 ① 那张表）。
 */

const NOW = '2026-10-07T00:00:00.000Z'
const ids = NODE_ASSISTANT_OP_V4_IDS

function context(): ApplyOpV4Context {
  let counter = 0
  return {
    now: NOW,
    refs: new Map<string, string>(),
    mintId: (prefix) => {
      counter += 1
      return `${prefix}_${counter}`
    },
  }
}

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

/**
 * 主线：a 0–4（素材 0–4）· b 4–8（素材 1–5）· c 8–9（素材 0–2，2× 速）。
 * 台词 l1 / l2 是**存量**（没有起点）：改版前首尾相接，排在 0 秒与 2 秒。
 * 字幕 t1 在 5 秒 = b 的素材 2 秒那一帧。
 */
function fixture(): EditProject {
  return {
    name: '成片',
    tracks: {
      video: [
        clip({ id: 'a', sourceNodeId: 'va' }),
        clip({ id: 'b', sourceNodeId: 'vb', in: 1, out: 5 }),
        clip({ id: 'c', sourceNodeId: 'vc', in: 0, out: 2, speed: 2 }),
      ],
      audio: [
        clip({ id: 'l1', sourceNodeId: 'voice', out: 2 }),
        clip({ id: 'l2', sourceNodeId: 'voice', out: 1 }),
      ],
      music: [],
      text: [caption({ id: 't1', startSec: 5 })],
    },
    settings: { aspect: '16:9', resolution: '1080p' },
  }
}

function stateOf(project: EditProject): NodeWorkflowStateV4 {
  return { version: 4, nodes: [], edges: [], edit: project }
}

function apply(
  state: NodeWorkflowStateV4,
  op: Parameters<typeof applyNodeAssistantOpV4>[1],
) {
  const result = applyNodeAssistantOpV4(state, op, context())
  if (!result.ok) throw new Error(`op rejected: ${result.reason}`)
  return result
}

function where(project: EditProject | undefined) {
  return {
    voice: project?.tracks.audio.map((item) => [
      item.id,
      item.startSec,
      item.attach?.clipId,
      item.attach?.atSec,
    ]),
    captions: project?.tracks.text.map((item) => [
      item.id,
      item.startSec,
      item.attach?.clipId,
      item.attach?.atSec,
    ]),
  }
}

describe('归位（reflowAttachments）', () => {
  it('puts legacy voice lines where they used to be and hangs everything on the frame under it', () => {
    expect(where(reflowAttachments(fixture()))).toEqual({
      voice: [
        ['l1', 0, 'a', 0],
        ['l2', 2, 'a', 2],
      ],
      captions: [['t1', 5, 'b', 2]],
    })
  })

  it('is idempotent and hands back the same object once everything is placed', () => {
    const once = reflowAttachments(fixture())
    expect(reflowAttachments(once)).toBe(once)
  })

  it('reads a sped-up clip in source seconds', () => {
    // 8.5 秒落在 c（2× 速）上：素材 0 + 0.5 × 2 = 1 秒。
    expect(attachAt(fixture(), 8.5)).toEqual({ clipId: 'c', atSec: 1 })
  })

  it('leaves lines free while the main line is empty, then hangs them once a shot arrives', () => {
    const empty = { ...fixture(), tracks: { ...fixture().tracks, video: [] } }
    const free = reflowAttachments(empty)
    expect(free.tracks.text[0]?.attach).toBeUndefined()
    expect(free.tracks.text[0]?.startSec).toBe(5)

    const withShot = reflowAttachments({
      ...free,
      tracks: { ...free.tracks, video: [clip({ id: 'z', out: 10 })] },
    })
    expect(withShot.tracks.text[0]?.attach).toEqual({ clipId: 'z', atSec: 5 })
  })
})

describe('挂件跟着主线走（op 执行器）', () => {
  const placed = () => stateOf(reflowAttachments(fixture()))

  it('moving a shot carries its caption along', () => {
    const moved = apply(placed(), {
      op: ids.editMoveClip,
      track: EDIT_TRACK_IDS.video,
      clipId: 'b',
      toIndex: 0,
    })
    // b 挪到最前（0–4）：素材 2 秒那一帧 = 时间线 1 秒。
    expect(where(moved.state.edit).captions).toEqual([['t1', 1, 'b', 2]])
    // a 被挤到 4–8，挂在它上面的台词一起往后走。
    expect(where(moved.state.edit).voice).toEqual([
      ['l1', 4, 'a', 0],
      ['l2', 6, 'a', 2],
    ])
  })

  it('trimming a shot keeps lines on their frame and cuts the ones whose frame is gone', () => {
    const trimmed = apply(placed(), {
      op: ids.editUpdateClip,
      track: EDIT_TRACK_IDS.video,
      clipId: 'a',
      patch: { in: 1 },
    })
    const edit = trimmed.state.edit!
    // l2 钉在素材 2 秒：a 从素材 1 秒开始了，它往前挪到 1 秒。
    expect(where(edit).voice?.[1]).toEqual(['l2', 1, 'a', 2])
    // l1 那一帧（素材 0 秒）被裁掉了：断挂，留着但不出声。
    expect(isAttachmentCut(edit, edit.tracks.audio[0]?.attach)).toBe(true)
    expect(isAttachmentCut(edit, edit.tracks.audio[1]?.attach)).toBe(false)
  })

  it('deleting a shot takes its lines with it, and one undo brings them all back', () => {
    const before = placed()
    const removed = apply(before, {
      op: ids.editRemoveClip,
      track: EDIT_TRACK_IDS.video,
      clipId: 'a',
    })
    expect(removed.state.edit?.tracks.audio).toEqual([])
    // 字幕挂在 b 上，不跟着走；b 顶到 0 秒，它跟着到 1 秒。
    expect(where(removed.state.edit).captions).toEqual([['t1', 1, 'b', 2]])
    expect(removed.changedNodeIds).toEqual(['va', 'voice', 'voice'])

    const back = applyInverseV4(removed.state, removed.inverse, context())
    expect(back.edit).toEqual(before.edit)
  })

  it('deleting a voice line by itself does not touch the main line', () => {
    const removed = apply(placed(), {
      op: ids.editRemoveClip,
      track: EDIT_TRACK_IDS.audio,
      clipId: 'l1',
    })
    expect(removed.state.edit?.tracks.video).toHaveLength(3)
    expect(removed.inverse.kind).toBe('op')
  })

  it('dragging a caption re-hangs it on the shot under its new start, and undo puts it back', () => {
    const before = placed()
    const moved = apply(before, {
      op: ids.editUpdateText,
      clipId: 't1',
      patch: { startSec: 8.5 },
    })
    expect(where(moved.state.edit).captions).toEqual([['t1', 8.5, 'c', 1]])

    const back = applyInverseV4(moved.state, moved.inverse, context())
    expect(back.edit).toEqual(before.edit)
  })

  it('dragging a voice line works the same way', () => {
    const before = placed()
    const moved = apply(before, {
      op: ids.editUpdateClip,
      track: EDIT_TRACK_IDS.audio,
      clipId: 'l2',
      patch: { startSec: 6 },
    })
    expect(where(moved.state.edit).voice?.[1]).toEqual(['l2', 6, 'b', 3])

    const back = applyInverseV4(moved.state, moved.inverse, context())
    expect(back.edit).toEqual(before.edit)
  })

  it('a whole-timeline write is placed too', () => {
    const written = apply(stateOf(fixture()), {
      op: ids.editSetTimeline,
      project: fixture(),
    })
    expect(where(written.state.edit)).toEqual(
      where(reflowAttachments(fixture())),
    )
  })
})

describe('切开', () => {
  it('splitting a shot moves the lines after the cut onto the tail', () => {
    const base = reflowAttachments(fixture())
    const withLate = {
      ...base,
      tracks: {
        ...base.tracks,
        text: [
          ...base.tracks.text,
          // b 的素材 3.5 秒 = 时间线 6.5 秒。
          caption({
            id: 't2',
            startSec: 6.5,
            attach: { clipId: 'b', atSec: 3.5 },
          }),
        ],
      },
    }
    // 在 6 秒（b 的素材 3 秒）切开。
    const split = splitMainClipAt(withLate, 6, () => 'b2')!
    expect(split.tracks.video.map((item) => item.id)).toEqual([
      'a',
      'b',
      'b2',
      'c',
    ])
    expect(where(split).captions).toEqual([
      ['t1', 5, 'b', 2],
      ['t2', 6.5, 'b2', 3.5],
    ])
  })

  it('the tail of a split caption or voice line finds its own frame', () => {
    const base = reflowAttachments(fixture())
    const captions = splitTextClipAt(
      [{ ...base.tracks.text[0]!, durationSec: 2 }],
      't1',
      5.5,
      () => 't1b',
    )!
    expect(captions[1]?.attach).toBeUndefined()
    const placed = reflowAttachments({
      ...base,
      tracks: { ...base.tracks, text: [...captions] },
    })
    expect(placed.tracks.text[1]?.attach).toEqual({ clipId: 'b', atSec: 2.5 })

    const voice = splitPositionedClipAt(base.tracks.audio, 0.5, () => 'l1b')!
    expect(
      voice.map((item) => [item.id, item.startSec, item.in, item.out]),
    ).toEqual([
      ['l1', 0, 0, 0.5],
      ['l1b', 0.5, 0.5, 2],
      ['l2', 2, 0, 1],
    ])
    expect(voice[1]?.attach).toBeUndefined()
  })
})

describe('成片（toRenderPlan）', () => {
  const nodes = ['va', 'vb', 'vc', 'voice'].map(
    (id) =>
      ({
        id,
        position: { x: 0, y: 0 },
        data: {
          kind: id === 'voice' ? 'audio' : 'video',
          subtype: id === 'voice' ? 'voice' : 'shot',
          name: id,
          label: id,
          status: 'idle',
          createdAt: NOW,
          durationSec: 10,
          url: `https://cdn.test.com/${id}.mp4`,
        },
      }) as NodeV4,
  )

  it('voice lines play at their own start and cut lines stay silent', () => {
    const base = reflowAttachments(fixture())
    const trimmed = {
      ...base,
      tracks: {
        ...base.tracks,
        video: base.tracks.video.map((item) =>
          item.id === 'a' ? { ...item, in: 1 } : item,
        ),
      },
    }
    const plan = toRenderPlan(
      trimmed,
      nodes,
      { range: EDIT_EXPORT_RANGE_IDS.all },
      { projectId: 'p1' },
    )
    // l1 断挂不进成片；l2 跟着那一帧挪到 1 秒。
    expect(plan.audio.map((segment) => [segment.id, segment.startSec])).toEqual(
      [['l2', 1]],
    )
    // 字幕挂在 b 上：a 短了 1 秒，它跟着到 4 秒。
    expect(plan.texts.map((segment) => [segment.id, segment.startSec])).toEqual(
      [['t1', 4]],
    )
  })
})
