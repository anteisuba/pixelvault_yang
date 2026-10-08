import { describe, expect, it } from 'vitest'

import type {
  EditClip,
  EditProject,
  NodeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import {
  countClipRiders,
  diffEditTimeline,
  findLandedRender,
} from './edit-desk-receipt'

const NOW = '2026-09-28T00:00:00.000Z'

function clip(id: string, extra: Partial<EditClip> = {}): EditClip {
  return {
    id,
    sourceNodeId: 'v1',
    in: 0,
    out: 3,
    speed: 1,
    muted: false,
    ...extra,
  }
}

function project(video: readonly EditClip[]): EditProject {
  return {
    name: '成片',
    tracks: { video: [...video], audio: [], music: [], text: [] },
    settings: { aspect: '16:9', resolution: '1080p' },
  }
}

describe('diffEditTimeline', () => {
  it('按段 id 比内容：磁吸补位挪了位置的段不算改', () => {
    const before = project([clip('a'), clip('b'), clip('c')])
    const after = project([clip('a'), clip('c')])
    expect(diffEditTimeline(before, after)).toEqual({
      changedIds: [],
      count: 1,
    })
  })

  it('改的闪、加的不闪；数字 = 改 + 加 + 删', () => {
    const before = project([clip('a'), clip('b')])
    const after = project([clip('a', { speed: 2 }), clip('c')])
    expect(diffEditTimeline(before, after)).toEqual({
      changedIds: ['a'],
      count: 3,
    })
  })

  it('还没有时间线 → 全算新加的', () => {
    expect(diffEditTimeline(undefined, project([clip('a')]))).toEqual({
      changedIds: [],
      count: 1,
    })
  })
})

describe('findLandedRender', () => {
  function videoNode(id: string, sourceKind?: string): NodeV4 {
    return {
      id,
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        subtype: 'shot',
        name: id,
        status: 'idle',
        createdAt: NOW,
        url: 'https://example.test/a.mp4',
        outputs: {
          versions: [
            {
              id: `ov_${id}`,
              url: 'https://example.test/a.mp4',
              createdAt: NOW,
              generationId: `gen_${id}`,
              ...(sourceKind
                ? { source: { kind: sourceKind, label: 'x' } }
                : {}),
            },
          ],
          cur: 0,
        },
      },
    } as NodeV4
  }

  const base: NodeWorkflowStateV4 = {
    version: 4,
    nodes: [videoNode('old', 'render')],
    edges: [],
  }

  it('只认新出现、来源是成片的那张卡', () => {
    const after = {
      ...base,
      nodes: [...base.nodes, videoNode('shot'), videoNode('cut', 'render')],
    }
    expect(findLandedRender(base, after)).toEqual({
      nodeId: 'cut',
      generationId: 'gen_cut',
    })
  })

  it('没有新成片卡 → null（旧的成片卡不算）', () => {
    const after = { ...base, nodes: [...base.nodes, videoNode('shot')] }
    expect(findLandedRender(base, after)).toBeNull()
  })
})

describe('countClipRiders', () => {
  it('数挂在这一段上的台词与字幕（别的段的不算）', () => {
    const base = project([clip('a'), clip('b')])
    const withRiders: EditProject = {
      ...base,
      tracks: {
        ...base.tracks,
        audio: [
          clip('l1', { startSec: 1, attach: { clipId: 'a', atSec: 1 } }),
          clip('l2', { startSec: 2, attach: { clipId: 'a', atSec: 2 } }),
          clip('l3', { startSec: 4, attach: { clipId: 'b', atSec: 1 } }),
        ],
        text: [
          {
            id: 't1',
            text: '字',
            startSec: 0.5,
            durationSec: 1,
            anchor: 'bc',
            size: 'm',
            tone: 'light',
            fadeSec: 0,
            attach: { clipId: 'a', atSec: 0.5 },
          },
        ],
      },
    }
    expect(countClipRiders(withRiders, 'a')).toEqual({ lines: 2, captions: 1 })
    expect(countClipRiders(withRiders, 'b')).toEqual({ lines: 1, captions: 0 })
  })
})
