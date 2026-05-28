'use client'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaInspector } from './NodeMediaInspector'

interface ShotTextInspectorProps {
  node: NodeWorkflowNode
}

export function ShotTextInspector({ node }: ShotTextInspectorProps) {
  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.shotText}
      kind={NODE_MEDIA_KIND_IDS.text}
    />
  )
}
