'use client'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { VideoReferenceInspector } from '../inspector/VideoReferenceInspector'
import type { NodeDetailBodyProps } from './registry'

/**
 * Detail body for upload-only reference-video nodes. Unlike generated video
 * nodes, this panel must expose the upload/replace/clear controls that populate
 * `data.mediaUrl`; downstream Seedance nodes then harvest that URL from the
 * graph as `videoUrls`.
 */
export function VideoReferenceDetailBody({
  nodeId,
  data,
}: NodeDetailBodyProps) {
  const node: NodeWorkflowNode = {
    id: nodeId,
    type: NODE_TYPE_IDS.videoReference,
    position: { x: 0, y: 0 },
    data,
  }

  return <VideoReferenceInspector node={node} />
}
