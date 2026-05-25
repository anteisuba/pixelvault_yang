'use client'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaInspector } from './NodeMediaInspector'

interface VoiceInspectorProps {
  node: NodeWorkflowNode
}

export function VoiceInspector({ node }: VoiceInspectorProps) {
  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.voice}
      kind={NODE_MEDIA_KIND_IDS.audio}
    />
  )
}
