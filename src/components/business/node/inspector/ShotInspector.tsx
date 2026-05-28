'use client'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaInspector } from './NodeMediaInspector'

interface ShotInspectorProps {
  node: NodeWorkflowNode
}

export function ShotInspector({ node }: ShotInspectorProps) {
  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.shot}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
}
