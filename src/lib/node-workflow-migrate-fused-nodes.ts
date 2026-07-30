/**
 * Legacy fused-node retirement (pure, React-free, idempotent).
 *
 * The retired “swallow a loose image into an identity card” interaction
 * copied the image into `target.data.referenceAssets` and stamped
 * `source.data.fusedIntoNodeId`. The render layer then hid the source node.
 * That conflicts with the confirmed canvas rule that nodes stay where the
 * user placed them and ownership is metadata rather than containment.
 *
 * Compatibility deliberately removes only the obsolete hiding marker. The
 * source node, graph edges, positions and target reference metadata are kept
 * byte-for-byte: nested reference entries may contain user-authored role,
 * label, weight and stage curation that the future multi-owner model has not
 * yet defined a lossless destination for.
 */

import type { NodeWorkflowNode, NodeWorkflowState } from '@/types/node-workflow'

export function migrateRetireFusedNodes(
  state: NodeWorkflowState,
): NodeWorkflowState {
  const needsMigration = state.nodes.some(
    (node) => node.data.fusedIntoNodeId !== undefined,
  )
  if (!needsMigration) return state

  const nodes: NodeWorkflowNode[] = state.nodes.map((node) => {
    if (node.data.fusedIntoNodeId === undefined) return node

    const data = { ...node.data }
    delete data.fusedIntoNodeId
    return { ...node, data }
  })

  return { ...state, nodes }
}
