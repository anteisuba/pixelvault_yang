'use client'

import { useEffect, useRef } from 'react'

/**
 * React Flow bug workaround (canvas 2026-07-27): on first mount, `<ReactFlow>`
 * doesn't measure a node's handle bounds until a layout pass runs — and
 * nothing forces that pass to happen until something incidental (e.g. a
 * window resize) fires a ResizeObserver tick. Until then every edge silently
 * fails to render, even though source/target nodes and handles all exist in
 * the DOM (verified: viewport pan/zoom does NOT trigger it — those only
 * change a CSS transform, never a layout pass).
 *
 * `useNodesInitialized()` flips `true` once every node has been measured.
 * Nudging `updateNodeInternals(id)` once per node at that point forces the
 * handle-bounds recompute immediately instead of waiting on an incidental
 * resize.
 *
 * Call with the two `@xyflow/react` hook results — this hook itself has no
 * xyflow dependency, so it's usable (and testable via `renderHook`) outside a
 * `<ReactFlowProvider>`. The two source hooks still have to be called from
 * inside the provider tree by the caller.
 *
 * MUST stay one-shot: re-running on every render (e.g. during a node drag,
 * where the node array gets a new identity every frame) would force a
 * continuous recompute instead of a single startup nudge. The ref guard is
 * the whole fix — it only ever fires on the false→true edge, once.
 */
export function useUpdateNodeInternalsOnInit<NodeType extends { id: string }>(
  nodesInitialized: boolean,
  nodes: readonly NodeType[],
  updateNodeInternals: (nodeId: string) => void,
): void {
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current || !nodesInitialized) return
    hasRunRef.current = true
    for (const node of nodes) {
      updateNodeInternals(node.id)
    }
  }, [nodesInitialized, nodes, updateNodeInternals])
}
