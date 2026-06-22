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

export function migrateImageRoles(state: NodeWorkflowState): NodeWorkflowState {
  const hasLegacy = state.nodes.some(
    (node) => LEGACY_IMAGE_TYPE_TO_ROLE[node.type] !== undefined,
  )
  if (!hasLegacy) return state

  const nodes: NodeWorkflowNode[] = state.nodes.map((node) => {
    const role = LEGACY_IMAGE_TYPE_TO_ROLE[node.type]
    if (!role) return node
    return {
      ...node,
      type: NODE_TYPE_IDS.image,
      data: { ...node.data, role },
    }
  })

  return { ...state, nodes }
}
