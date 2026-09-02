/**
 * 把一份 `NodeWorkflowGraphPatch` 施加到图上（C1，画布操作员的落笔原语）。
 *
 * ── 为什么是纯函数 ───────────────────────────────────────────────────
 * 应用与撤销必须是**同一份判据的两侧**（拍板 18）：`canvas-operator-apply.ts`
 * 算出 `{ patch, inverse }` 两份同形状的补丁，宿主对两者调的是同一个函数。
 * 单测里「apply(inverse(apply(graph)))」的往返因此能脱离 React 断言。
 *
 * ── 施加顺序（固定，⛔ 别调）────────────────────────────────────────
 * 删边 → 删节点（连带触边，与 `useNodeWorkflow.deleteNode` 同一条）→ 加节点 →
 * 加边 → 改节点 data。加边排在加节点之后是为了让「建一批再连一批」两份补丁
 * 合成一份时也成立；改 data 排最后是为了让刚建的节点也能被同一份补丁改。
 *
 * ⚠ **空补丁不换引用**：宿主把它放进 `commitCurrentProjectState`，而撤销栈按
 * 引用判「有没有变」—— 一份什么都没改的补丁如果换了引用，会往撤销栈里塞一步
 * 空操作。
 */

import type {
  NodeWorkflowGraphPatch,
  NodeWorkflowNode,
  NodeWorkflowEdge,
} from '@/types/node-workflow'

export interface NodeWorkflowGraph {
  nodes: readonly NodeWorkflowNode[]
  edges: readonly NodeWorkflowEdge[]
}

export const EMPTY_NODE_WORKFLOW_GRAPH_PATCH: NodeWorkflowGraphPatch = {
  addNodes: [],
  removeNodeIds: [],
  addEdges: [],
  removeEdgeIds: [],
  nodeData: [],
}

export function isEmptyNodeWorkflowGraphPatch(
  patch: NodeWorkflowGraphPatch,
): boolean {
  return (
    patch.addNodes.length === 0 &&
    patch.removeNodeIds.length === 0 &&
    patch.addEdges.length === 0 &&
    patch.removeEdgeIds.length === 0 &&
    patch.nodeData.length === 0
  )
}

export function applyNodeWorkflowGraphPatch<T extends NodeWorkflowGraph>(
  graph: T,
  patch: NodeWorkflowGraphPatch,
): T {
  if (isEmptyNodeWorkflowGraphPatch(patch)) return graph

  const removedNodes = new Set(patch.removeNodeIds)
  const removedEdges = new Set(patch.removeEdgeIds)
  const dataById = new Map<string, Partial<NodeWorkflowNode['data']>>()
  for (const entry of patch.nodeData) {
    dataById.set(entry.nodeId, { ...dataById.get(entry.nodeId), ...entry.data })
  }

  const edges = [
    ...graph.edges.filter(
      (edge) =>
        !removedEdges.has(edge.id) &&
        !removedNodes.has(edge.source) &&
        !removedNodes.has(edge.target),
    ),
    ...patch.addEdges,
  ]
  const nodes = [
    ...graph.nodes.filter((node) => !removedNodes.has(node.id)),
    ...patch.addNodes,
  ].map((node) => {
    const data = dataById.get(node.id)
    return data ? { ...node, data: { ...node.data, ...data } } : node
  })

  return { ...graph, nodes, edges }
}
