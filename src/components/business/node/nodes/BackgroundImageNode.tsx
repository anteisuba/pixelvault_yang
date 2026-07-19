'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaPreview } from './NodeMediaPreview'

export const BackgroundImageNode = memo(function BackgroundImageNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  return (
    <NodeMediaPreview
      {...props}
      type={NODE_TYPE_IDS.backgroundImage}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
})
