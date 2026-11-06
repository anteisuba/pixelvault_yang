import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import {
  buildShotTableRows,
  compactShotlist,
  listShotTableNodes,
  summarizeShotTable,
} from '@/lib/shot-table-rows'
import type { CharacterCardRecord } from '@/types'
import type { NodeV4, NodeV4Data } from '@/types/node-workflow'

const NOW = '2026-11-02T00:00:00.000Z'

function node(id: string, data: Partial<NodeV4Data>): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

const shot = (id: string, shotNo: number | undefined, extra = {}) =>
  node(id, {
    kind: 'video',
    subtype: 'shot',
    label: id,
    ...(shotNo === undefined ? {} : { shotNo }),
    ...extra,
  } as Partial<NodeV4Data>)

const LIN = { id: 'c1', name: '林夏' } as unknown as CharacterCardRecord

describe('buildShotTableRows', () => {
  it('lists numbered shot cards in shot order and skips loose cards', () => {
    const rows = buildShotTableRows({
      nodes: [shot('b', 2), shot('loose', undefined), shot('a', 1)],
      edges: [],
    })
    expect(rows.map((row) => row.nodeId)).toEqual(['a', 'b'])
  })

  it('reads every column off the card itself', () => {
    const rows = buildShotTableRows({
      nodes: [
        shot('s', 1, {
          prompt: '@林夏 撑伞走过斑马线',
          url: 'https://cdn/s.mp4',
          videoThumbnailUrl: 'https://cdn/s.jpg',
          params: { duration: '6' },
          characterPicks: { c1: [] },
          shot: { size: 'medium', move: '跟拍', durationLocked: true },
        }),
        node('bg', {
          kind: 'image',
          subtype: 'background',
          url: 'https://cdn/bg.png',
        } as Partial<NodeV4Data>),
      ],
      edges: [
        {
          id: 'e',
          source: 'bg',
          sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
          target: 's',
          slot: NODE_SLOT_IDS.reference,
        },
      ],
      shotlist: { look: '冷蓝夜色' },
      characterCards: [LIN],
    })
    expect(rows[0]).toMatchObject({
      prompt: '@林夏 撑伞走过斑马线',
      frame: {
        kind: 'video',
        url: 'https://cdn/s.mp4',
        poster: 'https://cdn/s.jpg',
      },
      size: 'medium',
      move: '跟拍',
      effectiveLook: '冷蓝夜色',
      durationSec: 6,
      durationLocked: true,
      cast: [
        { kind: 'character', id: 'c1', name: '林夏' },
        { kind: 'scene', id: 'bg', name: 'bg' },
      ],
    })
    expect(rows[0].look).toBeUndefined()
  })

  it('falls back to the first frame image when there is no video yet', () => {
    const rows = buildShotTableRows({
      nodes: [
        shot('s', 1),
        node('f', {
          kind: 'image',
          subtype: 'shot',
          url: 'https://cdn/f.png',
        } as Partial<NodeV4Data>),
      ],
      edges: [
        {
          id: 'e',
          source: 'f',
          sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
          target: 's',
          slot: NODE_SLOT_IDS.firstFrame,
        },
      ],
    })
    expect(rows[0].frame).toEqual({ kind: 'image', url: 'https://cdn/f.png' })
  })

  it('summarizes shots, videos and total duration', () => {
    const rows = buildShotTableRows({
      nodes: [
        shot('a', 1, { url: 'https://cdn/a.mp4', params: { duration: '4' } }),
        shot('b', 2, { params: { duration: '5.5' } }),
      ],
      edges: [],
    })
    expect(summarizeShotTable(rows)).toEqual({
      shots: 2,
      withVideo: 1,
      durationSec: 9.5,
    })
  })
})

describe('listShotTableNodes', () => {
  it('is the one list both the rows and the canvas row edges read', () => {
    const nodes = [
      shot('b', 2),
      shot('loose', undefined),
      node('img', { kind: 'image', subtype: 'result' } as Partial<NodeV4Data>),
      shot('a', 1),
    ]
    const ids = listShotTableNodes(nodes).map((item) => item.id)
    expect(ids).toEqual(['a', 'b'])
    expect(
      buildShotTableRows({ nodes, edges: [] }).map((row) => row.nodeId),
    ).toEqual(ids)
  })
})

describe('compactShotlist', () => {
  it('drops empty keys and collapses to undefined when nothing is left', () => {
    expect(
      compactShotlist({ look: '', totalDurationSec: 0, hiddenColumns: [] }),
    ).toBeUndefined()
  })

  it('keeps board, so whole-replace writes never lift the table off the canvas', () => {
    expect(compactShotlist({ look: '', board: { x: 10, y: 20 } })).toEqual({
      board: { x: 10, y: 20 },
    })
  })
})
