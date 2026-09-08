import { describe, expect, it } from 'vitest'

import { buildRerunDownstreamPlan } from '@/lib/node-rerun-downstream'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/**
 * 「只重跑下游」那份**只读名单**（第三期）。
 *
 * 最值得留的两条：① 文本节点不算进「要花钱」（它压根不生成任何东西）；
 * ② 起点不在名单里（用户刚换上去的那一张不该被盖掉）。
 */

const now = '2026-09-08T00:00:00.000Z'

const node = (id: string, kind: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: now, kind, ...extra },
  }) as unknown as NodeV4

const edge = (source: string, target: string) =>
  ({
    id: `${source}->${target}`,
    source,
    sourceHandle: 'out',
    target,
    slot: 'reference',
  }) as unknown as NodeWorkflowEdgeV4

describe('buildRerunDownstreamPlan', () => {
  const nodes = [
    node('ref', 'image', { subtype: 'reference' }),
    node('shotImg', 'image', { subtype: 'shot' }),
    node('shotVid', 'video', { subtype: 'shot', label: 'S02' }),
    node('note', 'text', { subtype: 'script' }),
  ]
  const edges = [
    edge('ref', 'shotImg'),
    edge('shotImg', 'shotVid'),
    edge('shotImg', 'note'),
  ]

  it('⛔ 起点不在名单里 —— 用户刚换上去的那一张不该被盖掉', () => {
    const plan = buildRerunDownstreamPlan({ targetId: 'ref', nodes, edges })
    expect(plan?.entries.map((entry) => entry.id)).toEqual([
      'shotImg',
      'shotVid',
      'note',
    ])
    expect(plan?.originId).toBe('ref')
  })

  it('includeSelf 时它排在最前（那是另一个意图，写在调用点上）', () => {
    const plan = buildRerunDownstreamPlan({
      targetId: 'ref',
      includeSelf: true,
      nodes,
      edges,
    })
    expect(plan?.entries[0]?.id).toBe('ref')
  })

  it('⭐ 文本节点不算「要花钱」', () => {
    const plan = buildRerunDownstreamPlan({ targetId: 'ref', nodes, edges })
    expect(plan?.entries.find((entry) => entry.id === 'note')?.paid).toBe(false)
    expect(plan?.paidByKind).toEqual({ image: 1, video: 1 })
  })

  it('名字走的是稳定名（镜头读 label）', () => {
    const plan = buildRerunDownstreamPlan({ targetId: 'ref', nodes, edges })
    expect(plan?.entries.find((entry) => entry.id === 'shotVid')?.name).toBe(
      'S02',
    )
  })

  it('起点不在图里（模型编了个 id）→ null，⛔ 不出一张幻觉卡', () => {
    expect(
      buildRerunDownstreamPlan({ targetId: 'ghost', nodes, edges }),
    ).toBeNull()
  })

  it('一个下游都没有 → null，⛔ 不出一张空卡', () => {
    expect(
      buildRerunDownstreamPlan({ targetId: 'shotVid', nodes, edges }),
    ).toBeNull()
  })

  it('边指向一个已经被删掉的节点时静默跳过', () => {
    const plan = buildRerunDownstreamPlan({
      targetId: 'ref',
      nodes: [nodes[0]!, nodes[1]!],
      edges,
    })
    expect(plan?.entries.map((entry) => entry.id)).toEqual(['shotImg'])
  })
})
