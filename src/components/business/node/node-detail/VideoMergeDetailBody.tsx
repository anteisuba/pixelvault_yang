'use client'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { VideoMergeInspector } from '../inspector/VideoMergeInspector'
import type { NodeDetailBodyProps } from './registry'

export function VideoMergeDetailBody({ nodeId, data }: NodeDetailBodyProps) {
  const node: NodeWorkflowNode = {
    id: nodeId,
    type: NODE_TYPE_IDS.videoMerge,
    position: { x: 0, y: 0 },
    data,
  }

  return <VideoMergeInspector node={node} />
}
