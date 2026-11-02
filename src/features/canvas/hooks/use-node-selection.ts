'use client'

import { useMemo } from 'react'
import { useNodes } from '@xyflow/react'

import type { NodeWorkflowNode } from '@/types/node-workflow'

export type NodeSelectionMode = 'none' | 'single' | 'multi'

export interface NodeSelectionState {
  mode: NodeSelectionMode
  primary: NodeWorkflowNode | null
  nodes: NodeWorkflowNode[]
}

export function useNodeSelection(): NodeSelectionState {
  const nodes = useNodes<NodeWorkflowNode>()

  return useMemo(() => {
    const selectedNodes = nodes.filter((node) => node.selected)

    if (selectedNodes.length === 0) {
      return {
        mode: 'none',
        primary: null,
        nodes: selectedNodes,
      }
    }

    if (selectedNodes.length === 1) {
      return {
        mode: 'single',
        primary: selectedNodes[0] ?? null,
        nodes: selectedNodes,
      }
    }

    return {
      mode: 'multi',
      primary: selectedNodes[0] ?? null,
      nodes: selectedNodes,
    }
  }, [nodes])
}
