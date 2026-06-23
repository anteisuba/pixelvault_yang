/**
 * Image-role migration (pure, React-free, idempotent).
 *
 * node-consolidation step 2 / option B folds the legacy per-role image types
 * (characterImage / backgroundImage / shot / frameImage) into a single `image`
 * type discriminated by `data.role`. Removing the legacy types from the enum
 * would fail the strict `NodeWorkflowNodeSchema` parse on load (and the
 * server's `validateState` coerces a failed parse to an EMPTY state, wiping the
 * project), so — exactly like `migrateRetirePlanner` — the enum keeps them and
 * this migration rewrites them at the data level after a successful parse.
 *
 * It ALSO normalizes the image-result field: the unified card + inspector key
 * the preview purely off `mediaUrl`, while legacy character nodes stored the
 * result in `imageUrl`. So for every image-role node we copy `imageUrl` →
 * `mediaUrl` (when the latter is absent) and drop the now-ignored `imageMode`
 * presentation gate — this is what makes old generated/existing nodes render
 * their preview after the single-source-of-truth refactor instead of expanding
 * into an empty chooser.
 *
 * Returns the input untouched (same reference) when there's nothing to migrate,
 * so it's safe to run on every load and composes idempotently with the other
 * migrations.
 */

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNode, NodeWorkflowState } from '@/types/node-workflow'

const LEGACY_IMAGE_TYPE_TO_ROLE: Partial<
  Record<NodeWorkflowNodeType, NodeImageRole>
> = {
  [NODE_TYPE_IDS.characterImage]: NODE_IMAGE_ROLE_IDS.character,
  [NODE_TYPE_IDS.backgroundImage]: NODE_IMAGE_ROLE_IDS.background,
  [NODE_TYPE_IDS.shot]: NODE_IMAGE_ROLE_IDS.shot,
  [NODE_TYPE_IDS.frameImage]: NODE_IMAGE_ROLE_IDS.frame,
}

function isImageRoleNode(node: NodeWorkflowNode): boolean {
  if (LEGACY_IMAGE_TYPE_TO_ROLE[node.type] !== undefined) return true
  return node.type === NODE_TYPE_IDS.image
}

function nodeNeedsResultNormalization(node: NodeWorkflowNode): boolean {
  if (!isImageRoleNode(node)) return false
  const hasImageUrl = typeof node.data.imageUrl === 'string'
  const hasMediaUrl = typeof node.data.mediaUrl === 'string'
  return (hasImageUrl && !hasMediaUrl) || node.data.imageMode !== undefined
}

export function migrateImageRoles(state: NodeWorkflowState): NodeWorkflowState {
  const needsMigration = state.nodes.some(
    (node) =>
      LEGACY_IMAGE_TYPE_TO_ROLE[node.type] !== undefined ||
      nodeNeedsResultNormalization(node),
  )
  if (!needsMigration) return state

  const nodes: NodeWorkflowNode[] = state.nodes.map((node) => {
    const role = LEGACY_IMAGE_TYPE_TO_ROLE[node.type]
    const isImageRole = role !== undefined || node.type === NODE_TYPE_IDS.image
    if (!isImageRole) return node

    // Normalize the result field to mediaUrl + drop the ignored imageMode gate.
    const { imageMode: _ignoredImageMode, ...restData } = node.data
    const mediaUrl =
      typeof restData.mediaUrl === 'string'
        ? restData.mediaUrl
        : typeof restData.imageUrl === 'string'
          ? restData.imageUrl
          : restData.mediaUrl

    return {
      ...node,
      type: NODE_TYPE_IDS.image,
      data: {
        ...restData,
        role: role ?? node.data.role,
        ...(mediaUrl !== undefined ? { mediaUrl } : {}),
      },
    }
  })

  return { ...state, nodes }
}
