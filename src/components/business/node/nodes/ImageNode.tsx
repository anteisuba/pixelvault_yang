'use client'

import type { NodeProps } from '@xyflow/react'

import {
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { CharacterImageNode } from './CharacterImageNode'
import { ImageRolePicker } from './ImageRolePicker'
import { NodeMediaPreview } from './NodeMediaPreview'

/**
 * Unified image node (node-consolidation step 2 / option B). One graph-level
 * `image` type whose `data.role` selects the presentation. The unification
 * lives at the type/contract level (schema, connection rules, harvest,
 * projection, migration); rendering DELEGATES to the proven per-role cards via
 * the shared role→legacy-type map, so each role looks exactly like its legacy
 * node — no new copy or markup. A role-less node (freshly added from the menu)
 * shows the role picker until the user chooses what the image is for.
 */
export function ImageNode(props: NodeProps<NodeWorkflowNode>) {
  const role = props.data.role

  if (!role) {
    return (
      <ImageRolePicker
        nodeId={props.id}
        selected={props.selected}
        status={props.data.status}
      />
    )
  }

  const legacyType = NODE_IMAGE_ROLE_TO_LEGACY_TYPE[role]

  if (legacyType === NODE_TYPE_IDS.characterImage) {
    return <CharacterImageNode {...props} />
  }

  return (
    <NodeMediaPreview
      {...props}
      type={legacyType}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
}
