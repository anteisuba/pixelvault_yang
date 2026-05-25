'use client'

import type { NodeProps } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaPreview } from './NodeMediaPreview'

export function SeedanceNode(props: NodeProps<NodeWorkflowNode>) {
  return (
    <NodeMediaPreview
      {...props}
      type={NODE_TYPE_IDS.seedance}
      kind={NODE_MEDIA_KIND_IDS.video}
    />
  )
}
