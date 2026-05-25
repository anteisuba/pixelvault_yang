'use client'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaInspector } from './NodeMediaInspector'

interface FrameImageInspectorProps {
  node: NodeWorkflowNode
}

export function FrameImageInspector({ node }: FrameImageInspectorProps) {
  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.frameImage}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
}
