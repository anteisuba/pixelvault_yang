'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { LooseImageCard } from './LooseImageCard'
import { NodeMediaPreview } from './NodeMediaPreview'

function hasImageMedia(data: NodeWorkflowNode['data']): boolean {
  return (
    (typeof data.mediaUrl === 'string' && data.mediaUrl.trim() !== '') ||
    (typeof data.imageUrl === 'string' && data.imageUrl.trim() !== '')
  )
}

/** Legacy `frameImage` type — pure-image when media exists. */
export const FrameImageNode = memo(function FrameImageNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  if (hasImageMedia(props.data)) {
    return (
      <LooseImageCard
        id={props.id}
        data={props.data}
        selected={props.selected}
        width={props.width}
        height={props.height}
        nodeType={NODE_TYPE_IDS.frameImage}
      />
    )
  }

  return (
    <NodeMediaPreview
      {...props}
      type={NODE_TYPE_IDS.frameImage}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
})
