import {
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

/**
 * The node type to use for PRESENTATION — badge, accent, i18n label, detail
 * body, inspector, card render. For a unified image node (option B) this is the
 * legacy per-role type its `data.role` maps to, so every existing per-type
 * surface (cards, NodeDetailPanel bodies, inspectors, i18n keys) is reused
 * unchanged. For every other node it's the node's own type.
 */
export function resolveNodePresentationType(
  node: NodeWorkflowNode,
): NodeWorkflowNodeType {
  if (node.type === NODE_TYPE_IDS.image) {
    return NODE_IMAGE_ROLE_TO_LEGACY_TYPE[
      node.data.role ?? NODE_IMAGE_ROLE_IDS.shot
    ]
  }
  return node.type
}
