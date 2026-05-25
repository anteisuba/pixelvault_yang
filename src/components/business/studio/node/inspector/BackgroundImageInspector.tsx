'use client'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaInspector } from './NodeMediaInspector'

interface BackgroundImageInspectorProps {
  node: NodeWorkflowNode
}

export function BackgroundImageInspector({
  node,
}: BackgroundImageInspectorProps) {
  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.backgroundImage}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
}
