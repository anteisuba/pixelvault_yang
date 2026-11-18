import { describe, expect, it } from 'vitest'

import { findNodeWorkflowSaveIssue } from '@/lib/node-workflow-save-check'
import {
  NodeWorkflowStateV4Schema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

const NOW = '2026-11-18T00:00:00.000Z'

function validState(): NodeWorkflowStateV4 {
  return NodeWorkflowStateV4Schema.parse({
    version: 4,
    nodes: [
      {
        id: 'i1',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          subtype: 'result',
          name: '首帧',
          createdAt: NOW,
        },
      },
      {
        id: 'i2',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          subtype: 'result',
          name: '晴的定妆',
          createdAt: NOW,
        },
      },
    ],
    edges: [],
  })
}

describe('findNodeWorkflowSaveIssue（与服务端同一份 schema）', () => {
  it('合规的图返回 null', () => {
    expect(findNodeWorkflowSaveIssue(validState())).toBeNull()
  })

  it('卡上字段超长：点名哪张卡、哪个字段、上限多少', () => {
    const state = validState()
    const bad: NodeWorkflowStateV4 = {
      ...state,
      nodes: [
        state.nodes[0]!,
        {
          ...state.nodes[1]!,
          data: { ...state.nodes[1]!.data, note: '长'.repeat(2001) },
        },
      ],
    }
    expect(findNodeWorkflowSaveIssue(bad)).toEqual({
      nodeId: 'i2',
      nodeName: '晴的定妆',
      field: 'note',
      maximum: 2000,
    })
  })

  it('项目级字段（边）出问题：不编卡名', () => {
    const state = validState()
    const bad = {
      ...state,
      edges: [
        {
          id: 'x'.repeat(161),
          source: 'i1',
          sourceHandle: 'out',
          target: 'i2',
          slot: 'reference',
        },
      ],
    } as NodeWorkflowStateV4
    const issue = findNodeWorkflowSaveIssue(bad)
    expect(issue?.nodeId).toBeUndefined()
    expect(issue?.field).toBe('edges.0.id')
    expect(issue?.maximum).toBe(160)
  })
})
