'use client'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { FrameImageInspector } from '../inspector/FrameImageInspector'
import type { NodeDetailBodyProps } from './registry'

export function FrameDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  const node: NodeWorkflowNode = {
    id: nodeId,
    type: NODE_TYPE_IDS.frameImage,
    position: { x: 0, y: 0 },
    data,
  }

  return <FrameImageInspector node={node} />
}
