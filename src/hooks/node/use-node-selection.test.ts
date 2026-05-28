import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseNodes = vi.fn()

vi.mock('@xyflow/react', () => ({
  useNodes: () => mockUseNodes(),
}))

import {
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import type { NodeWorkflowNode } from '@/types/node-workflow'

function createNode(
  id: string,
  selected: boolean,
  type: NodeWorkflowNodeType = NODE_TYPE_IDS.composer,
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    selected,
    data: {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useNodeSelection', () => {
  it('returns none mode when no node is selected', () => {
    mockUseNodes.mockReturnValue([createNode('node-1', false)])

    const { result } = renderHook(() => useNodeSelection())

    expect(result.current.mode).toBe('none')
    expect(result.current.primary).toBeNull()
    expect(result.current.nodes).toEqual([])
  })

  it('returns single mode and primary node for one selected node', () => {
    const selectedNode = createNode('node-2', true, NODE_TYPE_IDS.agent)
    mockUseNodes.mockReturnValue([createNode('node-1', false), selectedNode])

    const { result } = renderHook(() => useNodeSelection())

    expect(result.current.mode).toBe('single')
    expect(result.current.primary).toBe(selectedNode)
    expect(result.current.nodes).toEqual([selectedNode])
  })

  it('returns multi mode when several nodes are selected', () => {
    const firstNode = createNode('node-1', true)
    const secondNode = createNode('node-2', true, NODE_TYPE_IDS.characterImage)
    mockUseNodes.mockReturnValue([firstNode, secondNode])

    const { result } = renderHook(() => useNodeSelection())

    expect(result.current.mode).toBe('multi')
    expect(result.current.primary).toBe(firstNode)
    expect(result.current.nodes).toEqual([firstNode, secondNode])
  })
})
