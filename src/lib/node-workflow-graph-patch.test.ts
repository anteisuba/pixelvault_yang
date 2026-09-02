import { describe, expect, it } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import {
  applyNodeWorkflowGraphPatch,
  EMPTY_NODE_WORKFLOW_GRAPH_PATCH,
  isEmptyNodeWorkflowGraphPatch,
} from './node-workflow-graph-patch'

function node(
  id: string,
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type: NODE_TYPE_IDS.image,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

function edge(id: string, source: string, target: string): NodeWorkflowEdge {
  return { id, source, target }
}

describe('applyNodeWorkflowGraphPatch', () => {
  it('空补丁不换引用 —— 否则撤销栈会多一步空操作', () => {
    const graph = { nodes: [node('a')], edges: [] }
    expect(isEmptyNodeWorkflowGraphPatch(EMPTY_NODE_WORKFLOW_GRAPH_PATCH)).toBe(
      true,
    )
    expect(
      applyNodeWorkflowGraphPatch(graph, EMPTY_NODE_WORKFLOW_GRAPH_PATCH),
    ).toBe(graph)
  })

  it('删节点连带触边（与 deleteNode 同一条），再加节点、加边、改 data', () => {
    const graph = {
      nodes: [node('a'), node('b', { prompt: 'old' })],
      edges: [edge('e1', 'a', 'b')],
      scriptDoc: undefined,
    }
    const next = applyNodeWorkflowGraphPatch(graph, {
      addNodes: [node('c')],
      removeNodeIds: ['a'],
      addEdges: [edge('e2', 'b', 'c')],
      removeEdgeIds: [],
      nodeData: [
        { nodeId: 'b', data: { prompt: 'new' } },
        { nodeId: 'c', data: { characterName: '小林' } },
      ],
    })
    expect(next.nodes.map((entry) => entry.id)).toEqual(['b', 'c'])
    expect(next.edges.map((entry) => entry.id)).toEqual(['e2'])
    expect(next.nodes[0].data.prompt).toBe('new')
    // 改 data 排在加节点之后：刚建的节点也能被同一份补丁改。
    expect(next.nodes[1].data.characterName).toBe('小林')
    // 其它键原样带过去。
    expect('scriptDoc' in next).toBe(true)
  })

  it('nodeData 里值为 undefined = 删键（撤销「改前没有这个键」靠它）', () => {
    const graph = { nodes: [node('a', { shotName: '镜头1' })], edges: [] }
    const next = applyNodeWorkflowGraphPatch(graph, {
      ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH,
      nodeData: [{ nodeId: 'a', data: { shotName: undefined } }],
    })
    expect(next.nodes[0].data.shotName).toBeUndefined()
    // 查不到的节点静默跳过（那是撤销一个已被人手删掉的节点，没有东西可改）。
    expect(
      applyNodeWorkflowGraphPatch(graph, {
        ...EMPTY_NODE_WORKFLOW_GRAPH_PATCH,
        nodeData: [{ nodeId: 'zzz', data: { prompt: 'x' } }],
      }).nodes,
    ).toEqual(graph.nodes)
  })
})
