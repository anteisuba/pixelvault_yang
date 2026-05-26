'use client'

import type { NodeProps } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaPreview } from './NodeMediaPreview'

/**
 * Upload-only reference video node. Holds a user-uploaded clip (mp4/mov)
 * that feeds downstream Seedance Reference endpoints via video_urls. Unlike
 * SeedanceNode it never generates — there's no model selection, no prompt.
 */
export function VideoReferenceNode(props: NodeProps<NodeWorkflowNode>) {
  return (
    <NodeMediaPreview
      {...props}
      type={NODE_TYPE_IDS.videoReference}
      kind={NODE_MEDIA_KIND_IDS.video}
    />
  )
}
