'use client'

import type { NodeProps } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaPreview } from './NodeMediaPreview'

/**
 * Aggregator node: takes upstream video clips (any combination of Seedance
 * outputs, uploaded videoReference clips, or even nested videoMerge results)
 * and produces a single concatenated mp4 via fal-ai/ffmpeg-api/merge-videos.
 * Output is itself a video URL so downstream Seedance Reference / further
 * merges can consume it via the existing video_urls pipeline.
 */
export function VideoMergeNode(props: NodeProps<NodeWorkflowNode>) {
  return (
    <NodeMediaPreview
      {...props}
      type={NODE_TYPE_IDS.videoMerge}
      kind={NODE_MEDIA_KIND_IDS.video}
    />
  )
}
