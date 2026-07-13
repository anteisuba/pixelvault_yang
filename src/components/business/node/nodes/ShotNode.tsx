'use client'

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

/** Legacy `shot` type — pure-image when media exists, otherwise generation card. */
export function ShotNode(props: NodeProps<NodeWorkflowNode>) {
  if (hasImageMedia(props.data)) {
    return (
      <LooseImageCard
        id={props.id}
        data={props.data}
        selected={props.selected}
        width={props.width}
        height={props.height}
      />
    )
  }

  return (
    <NodeMediaPreview
      {...props}
      type={NODE_TYPE_IDS.shot}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
}
