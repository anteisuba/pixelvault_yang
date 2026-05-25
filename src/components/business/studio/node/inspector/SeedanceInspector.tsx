'use client'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaInspector } from './NodeMediaInspector'

interface SeedanceInspectorProps {
  node: NodeWorkflowNode
}

export function SeedanceInspector({ node }: SeedanceInspectorProps) {
  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.seedance}
      kind={NODE_MEDIA_KIND_IDS.video}
    />
  )
}
