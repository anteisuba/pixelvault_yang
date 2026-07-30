import { describe, expect, it } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowState,
} from '@/types/node-workflow'

import { migrateRetireFusedNodes } from './node-workflow-migrate-fused-nodes'

function makeNode(
  id: string,
  data: Partial<NodeWorkflowNodeData> = {},
): NodeWorkflowNode {
  return {
    id,
    type: NODE_TYPE_IDS.image,
    position: { x: 40, y: 80 },
    data: {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      ...data,
    },
  }
}

describe('migrateRetireFusedNodes', () => {
  it('clears the legacy hiding field without moving nodes or changing graph data', () => {
    const referenceAssets = [
      {
        id: 'ref-1',
        url: 'https://cdn.test/image.png',
        source: 'canvas' as const,
        sourceId: 'source',
        role: 'identity' as const,
        weight: 1,
        onStage: true,
      },
    ]
    const source = makeNode('source', {
      mediaUrl: 'https://cdn.test/image.png',
      fusedIntoNodeId: 'target',
    })
    const target = makeNode('target', { referenceAssets })
    const state: NodeWorkflowState = {
      nodes: [source, target],
      edges: [{ id: 'edge-1', source: 'source', target: 'target' }],
    }

    const next = migrateRetireFusedNodes(state)

    expect(next).not.toBe(state)
    expect(next.nodes[0]?.data.fusedIntoNodeId).toBeUndefined()
    expect(next.nodes[0]?.position).toEqual({ x: 40, y: 80 })
    expect(next.nodes[1]).toBe(target)
    expect(next.nodes[1]?.data.referenceAssets).toBe(referenceAssets)
    expect(next.edges).toBe(state.edges)
  })

  it('also heals an orphaned legacy target and is idempotent', () => {
    const state: NodeWorkflowState = {
      nodes: [makeNode('source', { fusedIntoNodeId: 'missing-target' })],
      edges: [],
    }

    const once = migrateRetireFusedNodes(state)

    expect(once.nodes[0]?.data.fusedIntoNodeId).toBeUndefined()
    expect(migrateRetireFusedNodes(once)).toBe(once)
  })

  it('returns the original state when no legacy field exists', () => {
    const state: NodeWorkflowState = {
      nodes: [makeNode('source')],
      edges: [],
    }

    expect(migrateRetireFusedNodes(state)).toBe(state)
  })
})
