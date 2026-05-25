import dagre from 'dagre'

import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

/**
 * Defaults match the node card sizing used by `NodeShell.tsx` (w-80 = 320px).
 * Height varies by node type — we use a conservative average so dagre lays
 * cards out with enough vertical breathing room. Slight overestimation is
 * fine; dagre packs nodes by rank, not pixel-perfect collision.
 */
const DEFAULT_NODE_WIDTH = 320
const DEFAULT_NODE_HEIGHT = 240
const DEFAULT_RANK_SEP = 120 // horizontal gap between ranks (left-to-right flow)
const DEFAULT_NODE_SEP = 64 // vertical gap between siblings within a rank
const DEFAULT_EDGE_SEP = 32

/**
 * Compute new positions for the given nodes using a left-to-right dagre
 * layout. Edges define the dependency graph; orphan nodes (no incoming or
 * outgoing edges) are placed by dagre too, just in their own rank.
 *
 * Returns a new array of nodes — does not mutate the input. Callers should
 * `setNodes(applyDagreLayout(currentNodes, edges))` style.
 */
export function applyDagreLayout(
  nodes: NodeWorkflowNode[],
  edges: NodeWorkflowEdge[],
): NodeWorkflowNode[] {
  if (nodes.length === 0) return nodes

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    ranksep: DEFAULT_RANK_SEP,
    nodesep: DEFAULT_NODE_SEP,
    edgesep: DEFAULT_EDGE_SEP,
  })

  for (const node of nodes) {
    // Prefer the measured width/height that React Flow caches on the node
    // (available once nodes have rendered at least once); fall back to the
    // NodeShell default so the very first layout call still works.
    const width = node.width ?? node.measured?.width ?? DEFAULT_NODE_WIDTH
    const height = node.height ?? node.measured?.height ?? DEFAULT_NODE_HEIGHT
    graph.setNode(node.id, { width, height })
  }

  for (const edge of edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(graph)

  return nodes.map((node) => {
    const positioned = graph.node(node.id)
    if (!positioned) return node
    // Dagre returns the center of the node; React Flow expects top-left.
    const width = node.width ?? node.measured?.width ?? DEFAULT_NODE_WIDTH
    const height = node.height ?? node.measured?.height ?? DEFAULT_NODE_HEIGHT
    return {
      ...node,
      position: {
        x: positioned.x - width / 2,
        y: positioned.y - height / 2,
      },
    }
  })
}
