import { describe, expect, it } from 'vitest'

import {
  buildV4MergePlan,
  planV4MergeTrimUpdate,
  summarizeV4MergePlan,
  V4_MERGE_SLOT_COUNT,
} from '@/lib/node-v4-merge'
import { slotVersionId } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

const NOW = '2026-09-07T00:00:00.000Z'

function clipNode(id: string, url: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'clip',
      name: id,
      status: 'ready',
      createdAt: NOW,
      url,
    },
  }
}

function mergeNode(
  clips?: { url: string; startSec?: number; endSec?: number }[],
  bindings?: { edgeId: string; sourceNodeId: string }[],
): NodeV4 {
  return {
    id: 'm_01',
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'merge',
      name: '成片',
      status: 'idle',
      createdAt: NOW,
      ...(clips ? { mergeSettings: { clips } } : {}),
      ...(bindings
        ? {
            slots: {
              clip: {
                slot: 'clip' as const,
                versions: bindings.map((binding) => ({
                  id: slotVersionId(binding.edgeId),
                  edgeId: binding.edgeId,
                  sourceNodeId: binding.sourceNodeId,
                  blocked: false,
                  addedAt: NOW,
                })),
                cur: slotVersionId(bindings[0]?.edgeId ?? ''),
              },
            },
          }
        : {}),
    },
  }
}

function edge(id: string, source: string): NodeWorkflowEdgeV4 {
  return {
    id,
    source,
    sourceHandle: 'out',
    target: 'm_01',
    slot: 'clip',
  }
}

describe('九槽阵列', () => {
  it('永远九格，前两格标必须', () => {
    const plan = buildV4MergePlan({
      nodeId: 'm_01',
      nodes: [mergeNode()],
      edges: [],
    })
    expect(plan.slots).toHaveLength(V4_MERGE_SLOT_COUNT)
    expect(plan.slots.filter((slot) => slot.required)).toHaveLength(2)
    expect(plan.clipCount).toBe(0)
  })

  it('接了的格子填 url，其余留空', () => {
    const nodes = [
      mergeNode(undefined, [
        { edgeId: 'e1', sourceNodeId: 'c1' },
        { edgeId: 'e2', sourceNodeId: 'c2' },
      ]),
      clipNode('c1', 'https://cdn/1.mp4'),
      clipNode('c2', 'https://cdn/2.mp4'),
    ]
    const plan = buildV4MergePlan({
      nodeId: 'm_01',
      nodes,
      edges: [edge('e1', 'c1'), edge('e2', 'c2')],
    })
    expect(plan.clipCount).toBe(2)
    expect(plan.slots[0]?.url).toBe('https://cdn/1.mp4')
    expect(plan.slots[2]?.url).toBeUndefined()
  })

  it('裁剪按 url 认领 —— 换序之后仍跟着同一段素材', () => {
    const clips = [{ url: 'https://cdn/2.mp4', startSec: 1, endSec: 3 }]
    const nodes = [
      mergeNode(clips, [
        { edgeId: 'e2', sourceNodeId: 'c2' },
        { edgeId: 'e1', sourceNodeId: 'c1' },
      ]),
      clipNode('c1', 'https://cdn/1.mp4'),
      clipNode('c2', 'https://cdn/2.mp4'),
    ]
    const plan = buildV4MergePlan({
      nodeId: 'm_01',
      nodes,
      edges: [edge('e2', 'c2'), edge('e1', 'c1')],
    })
    // 2.mp4 现在排在第一格，裁剪跟着它走，⛔ 不是留在下标 1 上。
    expect(plan.slots[0]?.url).toBe('https://cdn/2.mp4')
    expect(plan.slots[0]?.startSec).toBe(1)
    expect(plan.slots[1]?.startSec).toBeUndefined()
    expect(plan.trimmedCount).toBe(1)
  })

  it('start >= end 标成非法区间', () => {
    const nodes = [
      mergeNode(
        [{ url: 'https://cdn/1.mp4', startSec: 5, endSec: 2 }],
        [{ edgeId: 'e1', sourceNodeId: 'c1' }],
      ),
      clipNode('c1', 'https://cdn/1.mp4'),
    ]
    const plan = buildV4MergePlan({
      nodeId: 'm_01',
      nodes,
      edges: [edge('e1', 'c1')],
    })
    expect(plan.slots[0]?.invalidRange).toBe(true)
    expect(plan.hasInvalidRange).toBe(true)
  })
})

describe('裁剪写回载荷', () => {
  const nodes = [
    mergeNode(
      [{ url: 'https://cdn/1.mp4', startSec: 0, endSec: 2 }],
      [
        { edgeId: 'e1', sourceNodeId: 'c1' },
        { edgeId: 'e2', sourceNodeId: 'c2' },
      ],
    ),
    clipNode('c1', 'https://cdn/1.mp4'),
    clipNode('c2', 'https://cdn/2.mp4'),
  ]
  const plan = buildV4MergePlan({
    nodeId: 'm_01',
    nodes,
    edges: [edge('e1', 'c1'), edge('e2', 'c2')],
  })

  it('改一段发的是整份 clips', () => {
    const clips = planV4MergeTrimUpdate(plan, 1, { startSec: 1, endSec: 4 })
    expect(clips).toEqual([
      { url: 'https://cdn/1.mp4', startSec: 0, endSec: 2 },
      { url: 'https://cdn/2.mp4', startSec: 1, endSec: 4 },
    ])
  })

  it('清空一段的裁剪 = 那一段不进载荷', () => {
    const clips = planV4MergeTrimUpdate(plan, 0, {})
    expect(clips).toEqual([])
  })

  it('摘要读数', () => {
    expect(summarizeV4MergePlan(plan)).toEqual({
      clipCount: 2,
      slotCount: 9,
      trimmedCount: 1,
    })
  })
})
