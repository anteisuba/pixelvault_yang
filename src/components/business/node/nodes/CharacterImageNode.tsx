'use client'

import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeMediaPreview } from './NodeMediaPreview'

/**
 * Legacy `characterImage` type card — now a thin wrapper over the shared
 * NodeMediaPreview (node-consolidation option B), identical to BackgroundImageNode.
 * The bespoke character card was retired: its per-role accent, name title, and
 * source badge live in NodeMediaPreview's role config. Kept only as the legacy
 * nodeTypes fallback; new graphs use the unified `image` type (role=character),
 * and `migrateImageRoles` converts any legacy node on load.
 */
export const CharacterImageNode = memo(function CharacterImageNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  return (
    <NodeMediaPreview
      {...props}
      type={NODE_TYPE_IDS.characterImage}
      kind={NODE_MEDIA_KIND_IDS.image}
    />
  )
})
