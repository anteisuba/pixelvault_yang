import { describe, expect, it } from 'vitest'

import {
  buildTimelineSnapshot,
  findTimelineClip,
  timelineToSourceSec,
} from '@/lib/edit-timeline-snapshot'
import { EditProjectSchema } from '@/types/node-workflow'
import type { NodeV4 } from '@/types/node-workflow'

const NOW = '2026-09-28T00:00:00.000Z'

function videoNode(
  id: string,
  name: string,
  versions: readonly string[],
  cur = 0,
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name,
      createdAt: NOW,
      outputs: {
        versions: versions.map((versionId) => ({
          id: versionId,
          url: `https://cdn.test.com/${versionId}.mp4`,
          createdAt: NOW,
        })),
        cur,
      },
    },
  } as NodeV4
}

const PROJECT = EditProjectSchema.parse({
  name: '成片',
  tracks: {
    video: [
      {
        id: 'c1',
        sourceNodeId: 'v1',
        sourceVersionId: 'v1a',
        in: 1,
        out: 5,
        transitionOut: 'crossfade',
      },
      // 2× 速度：素材 2 秒 → 时间线 1 秒。
      {
        id: 'c2',
        sourceNodeId: 'v2',
        sourceVersionId: 'v2a',
        in: 0,
        out: 2,
        speed: 2,
      },
      { id: 'c3', sourceNodeId: 'gone', in: 0, out: 3 },
    ],
    audio: [],
    music: [{ id: 'm1', sourceNodeId: 'a1', in: 0, out: 8, gain: 0.5 }],
    text: [
      {
        id: 't1',
        text: '第一镜',
        startSec: 0.5,
        durationSec: 3,
      },
    ],
  },
  settings: {},
})

const NODES = [
  videoNode('v1', 'S01·镜头', ['v1a']),
  // 出了新版本，段上记的还是 v2a。
  videoNode('v2', 'S02·镜头', ['v2a', 'v2b'], 1),
]

describe('buildTimelineSnapshot', () => {
  it('lays every clip out on timeline seconds with its source trim', () => {
    const snapshot = buildTimelineSnapshot(PROJECT, NODES)

    expect(
      snapshot?.clips.map((clip) => [clip.clipId, clip.startSec, clip.endSec]),
    ).toEqual([
      ['c1', 0, 4],
      ['c2', 4, 5],
      ['c3', 5, 8],
      ['m1', 0, 8],
    ])
    expect(snapshot?.clips[0]).toMatchObject({
      track: 'video',
      index: 0,
      sourceName: 'S01·镜头',
      inSec: 1,
      outSec: 5,
      transitionOut: 'crossfade',
    })
    expect(snapshot?.durationSec).toBe(8)
  })

  it('flags a stale source and a source that left the canvas', () => {
    const snapshot = buildTimelineSnapshot(PROJECT, NODES)
    const byId = new Map(snapshot?.clips.map((clip) => [clip.clipId, clip]))

    expect(byId.get('c1')?.stale).toBeUndefined()
    expect(byId.get('c2')?.stale).toBe(true)
    expect(byId.get('c3')?.sourceMissing).toBe(true)
    // 没记版本的段不算 stale（我们不知道它当时是哪一版）。
    expect(byId.get('c3')?.stale).toBeUndefined()
  })

  it('leaves out defaults the model does not need to read', () => {
    const snapshot = buildTimelineSnapshot(PROJECT, NODES)
    const second = snapshot?.clips[1]

    expect(second).not.toHaveProperty('transitionOut')
    expect(second).not.toHaveProperty('muted')
    expect(snapshot?.clips[3]?.gain).toBe(0.5)
  })

  it('hangs captions on the main-line frame under them', () => {
    expect(buildTimelineSnapshot(PROJECT, NODES)?.texts).toEqual([
      {
        textId: 't1',
        text: '第一镜',
        startSec: 0.5,
        endSec: 3.5,
        anchor: 'bc',
        size: 'm',
        tone: 'light',
        fadeSec: 0,
        // 0.5 秒落在 c1（入点 1 秒）上 → 素材 1.5 秒那一帧。
        attachedTo: { clipId: 'c1', atSec: 1.5 },
      },
    ])
  })

  it('places voice lines by their own start and flags the ones whose frame was trimmed away', () => {
    const project = EditProjectSchema.parse({
      ...PROJECT,
      tracks: {
        ...PROJECT.tracks,
        audio: [
          // 存量台词没有起点：接在前一条后面（0 秒、2 秒）。
          { id: 'a1', sourceNodeId: 'a1', in: 0, out: 2 },
          { id: 'a2', sourceNodeId: 'a1', in: 0, out: 1 },
          // 挂在 c1 素材 0.5 秒那一帧上 —— 但 c1 从 1 秒才开始，这一帧被裁掉了。
          {
            id: 'a3',
            sourceNodeId: 'a1',
            in: 0,
            out: 1,
            startSec: 0,
            attach: { clipId: 'c1', atSec: 0.5 },
          },
        ],
      },
    })
    const voice = buildTimelineSnapshot(project, NODES)?.clips.filter(
      (clip) => clip.track === 'audio',
    )

    expect(voice?.map((clip) => [clip.startSec, clip.attachedTo])).toEqual([
      [0, { clipId: 'c1', atSec: 1 }],
      [2, { clipId: 'c1', atSec: 3 }],
      [0, { clipId: 'c1', atSec: 0.5 }],
    ])
    expect(voice?.map((clip) => clip.cut ?? false)).toEqual([
      false,
      false,
      true,
    ])
    expect(findTimelineClip(project, 'a2')?.startSec).toBe(2)
  })

  it('is null when the project has no timeline yet', () => {
    expect(buildTimelineSnapshot(undefined, NODES)).toBeNull()
  })
})

describe('timelineToSourceSec', () => {
  it('maps a timeline second into the clip through its trim and speed', () => {
    const first = findTimelineClip(PROJECT, 'c1')!
    const second = findTimelineClip(PROJECT, 'c2')!

    expect(timelineToSourceSec(first, 2)).toBe(3)
    // c2 从时间线 4 秒开始、2× 速：时间线 4.5 秒 = 素材 1 秒。
    expect(timelineToSourceSec(second, 4.5)).toBe(1)
  })

  it('is null outside the clip, including the frame where the next clip starts', () => {
    const first = findTimelineClip(PROJECT, 'c1')!

    expect(timelineToSourceSec(first, -0.1)).toBeNull()
    expect(timelineToSourceSec(first, 4)).toBeNull()
  })

  it('does not find captions or unknown ids', () => {
    expect(findTimelineClip(PROJECT, 't1')).toBeNull()
    expect(findTimelineClip(PROJECT, 'nope')).toBeNull()
  })
})
