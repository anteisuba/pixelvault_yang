'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'

import {
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_MEDIA_KIND_IDS,
} from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { ImageRolePicker } from './ImageRolePicker'
import { NodeMediaPreview } from './NodeMediaPreview'

/**
 * Unified image node (node-consolidation step 2 / option B). One graph-level
 * `image` type whose `data.role` selects the presentation. The unification
 * lives at the type/contract level (schema, connection rules, harvest,
 * projection, migration); rendering DELEGATES to the shared NodeMediaPreview
 * for EVERY role (character included — its per-role accent, name title, and
 * source badge live in NodeMediaPreview's role config), so no role keeps a
 * bespoke card. A role-less node (freshly added from the menu) shows the role
 * picker until the user chooses what the image is for.
 */
export function ImageNode(props: NodeProps<NodeWorkflowNode>) {
  const role = props.data.role
  // The "图片" breadcrumb crumb on a role'd card re-opens the chooser WITHOUT
  // clearing the role — it's transient view state, so the node keeps its image
  // and data. Picking the SAME role again is a no-op (a non-destructive way
  // back); picking a different role re-categorises. Mirrors the detail panel's
  // 返回上一层 breadcrumb.
  const [reChoosing, setReChoosing] = useState(false)

  if (!role || reChoosing) {
    return (
      <ImageRolePicker
        nodeId={props.id}
        selected={props.selected}
        status={props.data.status}
        currentRole={role}
        onPicked={() => setReChoosing(false)}
      />
    )
  }

  return (
    <NodeMediaPreview
      {...props}
      type={NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role]}
      kind={NODE_MEDIA_KIND_IDS.image}
      onReChoose={() => setReChoosing(true)}
    />
  )
}
