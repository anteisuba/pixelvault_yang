import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
} from '@/constants/node-types'
import { applyInverseV4 } from '@/lib/node-assistant-op-apply-v4'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

const STATE = NodeWorkflowStateV4Schema.parse({
  version: 4,
  nodes: [
    {
      id: 'n_script',
      position: { x: 0, y: 0 },
      data: {
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
        name: 'S01·剧本',
        label: 'S01·剧本',
        body: '# 开场',
        createdAt: '2026-09-28T00:00:00.000Z',
      },
    },
  ],
  edges: [],
})

function context() {
  let counter = 0
  return {
    mintId: (prefix: string) => {
      counter += 1
      return `${prefix}${counter}`
    },
  }
}

const op = (value: Record<string, unknown>) => value as NodeAssistantOpV4

describe('applyCanvasBatchV4', () => {
  it('lets a later op in the batch reach a node an earlier op created', () => {
    const batch = applyCanvasBatchV4(
      STATE,
      [
        op({
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: NODE_MEDIA_KIND_IDS.text,
          subtype: NODE_V4_TEXT_SUBTYPE_IDS.shotNote,
          ref: 'note',
        }),
        op({
          op: NODE_ASSISTANT_OP_V4_IDS.setText,
          target: 'note',
          body: '第二镜要更短',
          mode: 'replace',
        }),
      ],
      context(),
    )

    expect(batch.applied).toBe(2)
    expect(batch.createdNodeIds).toHaveLength(1)
    const created = batch.state.nodes.find(
      (node) => node.id === batch.createdNodeIds[0],
    )
    expect(created?.data.kind === 'text' && created.data.body).toBe(
      '第二镜要更短',
    )
    expect(batch.changedNodeIds).toContain(batch.createdNodeIds[0])
  })

  it('folds the whole batch into one inverse that restores the start', () => {
    const batch = applyCanvasBatchV4(
      STATE,
      [
        op({
          op: NODE_ASSISTANT_OP_V4_IDS.setText,
          target: 'n_script',
          body: '# 改过的开场',
          mode: 'replace',
        }),
        op({
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: NODE_MEDIA_KIND_IDS.text,
          subtype: NODE_V4_TEXT_SUBTYPE_IDS.shotNote,
        }),
      ],
      context(),
    )

    expect(batch.inverse?.kind).toBe('sequence')
    const restored = applyInverseV4(batch.state, batch.inverse!, {
      mintId: context().mintId,
    })
    expect(restored.nodes.map((node) => node.id)).toEqual(['n_script'])
    const script = restored.nodes[0]
    expect(script?.data.kind === 'text' && script.data.body).toBe('# 开场')
  })

  it('reports each failed op by its place in the batch and keeps the rest', () => {
    const batch = applyCanvasBatchV4(
      STATE,
      [
        op({
          op: NODE_ASSISTANT_OP_V4_IDS.setText,
          target: 'nobody',
          body: 'x',
          mode: 'replace',
        }),
        op({
          op: NODE_ASSISTANT_OP_V4_IDS.setText,
          target: 'n_script',
          body: '# 保留',
          mode: 'replace',
        }),
      ],
      context(),
    )

    expect(batch.applied).toBe(1)
    expect(batch.skipped).toBe(1)
    expect(batch.failures.map((failure) => failure.index)).toEqual([0])
    expect(batch.failures[0]?.reason).toBeTruthy()
  })

  it('hands back the very same state and no undo when nothing landed', () => {
    const batch = applyCanvasBatchV4(
      STATE,
      [
        op({
          op: NODE_ASSISTANT_OP_V4_IDS.delete,
          target: 'nobody',
        }),
      ],
      context(),
    )

    expect(batch.state).toBe(STATE)
    expect(batch.inverse).toBeNull()
    expect(batch.changedNodeIds).toEqual([])
  })
})
