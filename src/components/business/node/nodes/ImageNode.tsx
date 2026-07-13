'use client'

import type { NodeProps } from '@xyflow/react'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_MEDIA_KIND_IDS,
} from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { IdentityCollectorCard } from './IdentityCollectorCard'
import { ImageSourceStarter } from './ImageSourceStarter'
import { LooseImageCard } from './LooseImageCard'
import { NodeMediaPreview } from './NodeMediaPreview'

/**
 * Unified image node (node-consolidation step 2 / option B). One graph-level
 * `image` type whose `data.role` selects the presentation.
 *
 * S5d ③/④ 修正（node-canvas.md §6.0/§6.1，取代 S5c 的 role-picker 空态 +
 * 单一 NodeMediaPreview 分发）:
 * - No role + no media → `ImageSourceStarter`（三来源起步，废「这张图做什么
 *   用」选择）。
 * - No role + has media → `LooseImageCard`（散图，S5c 既有稳态，未改）。
 * - role = character/background → `IdentityCollectorCard`（档案卡面，与图片
 *   容器卡面两套视觉区分——这两个 role 在 S5d ② 修正后可能直接可见于画布，
 *   不再总是折进 Cast 卡匣）。
 * - Every other role (shot / frame / closeup) → `NodeMediaPreview`（图片容器
 *   卡面，未改）。
 */
export function ImageNode(props: NodeProps<NodeWorkflowNode>) {
  const role = props.data.role

  const hasMedia =
    typeof props.data.mediaUrl === 'string' && props.data.mediaUrl.trim() !== ''

  if (!role) {
    if (hasMedia) {
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
      <ImageSourceStarter
        nodeId={props.id}
        selected={props.selected}
        status={props.data.status}
      />
    )
  }

  if (
    role === NODE_IMAGE_ROLE_IDS.character ||
    role === NODE_IMAGE_ROLE_IDS.background
  ) {
    return (
      <IdentityCollectorCard
        id={props.id}
        legacyType={NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role]}
        data={props.data}
        selected={props.selected}
      />
    )
  }

  return (
    <NodeMediaPreview
      {...props}
      type={NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role]}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
}
