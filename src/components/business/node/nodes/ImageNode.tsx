'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
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
 * - No role + no media → `ImageSourceStarter`
 * - No role + has media → pure-image `LooseImageCard`
 * - character/background → `IdentityCollectorCard`（档案卡）
 * - shot/frame/closeup + has media → pure-image `LooseImageCard`（与散图同选中态）
 * - shot/frame/closeup + no media → `NodeMediaPreview`（生成表单）
 */
export const ImageNode = memo(function ImageNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  const role = props.data.role

  const hasMedia =
    (typeof props.data.mediaUrl === 'string' &&
      props.data.mediaUrl.trim() !== '') ||
    (typeof props.data.imageUrl === 'string' &&
      props.data.imageUrl.trim() !== '')

  if (!role) {
    if (hasMedia) {
      return (
        <LooseImageCard
          id={props.id}
          data={props.data}
          selected={props.selected}
          width={props.width}
          height={props.height}
          nodeType={NODE_TYPE_IDS.image}
        />
      )
    }
    return (
      <ImageSourceStarter
        nodeId={props.id}
        selected={props.selected}
        status={props.data.status}
        mediaLabel={
          typeof props.data.mediaLabel === 'string'
            ? props.data.mediaLabel
            : undefined
        }
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

  // 镜头图 / 关键帧 / 特写：有结果图时走纯图选中（工具条 + 四角缩放）。
  if (hasMedia) {
    return (
      <LooseImageCard
        id={props.id}
        data={props.data}
        selected={props.selected}
        width={props.width}
        height={props.height}
        nodeType={NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role]}
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
})
