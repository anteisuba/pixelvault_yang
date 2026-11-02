import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_EDGE_VIA_IDS,
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
} from '@/constants/node-slots'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { useNodeGraphV4 } from './use-node-graph-v4'

const NOW = '2026-09-10T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function stateOf(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[] = [],
): NodeWorkflowStateV4 {
  return { version: 4, nodes: [...nodes], edges: [...edges] }
}

function renderGraph(initial: NodeWorkflowStateV4) {
  const onOpFailed = vi.fn()
  const view = renderHook(
    ({ state }: { state: NodeWorkflowStateV4 }) =>
      useNodeGraphV4({
        state,
        onStateChange: (next) => view.rerender({ state: next }),
        onOpFailed,
      }),
    { initialProps: { state: initial } },
  )
  return { view, onOpFailed }
}

/** 取某个非文本节点的提示词（`data` 是判别联合，测试里收窄一次就够）。 */
function promptOf(graph: { nodes: readonly NodeV4[] }, id: string): string {
  const data = graph.nodes.find((item) => item.id === id)?.data
  return data && data.kind !== 'text' ? (data.prompt ?? '') : ''
}

const platform = node('img-platform', {
  kind: 'image',
  subtype: 'shot',
  name: '站台图',
  url: 'https://cdn/p.png',
})
const narration = node('aud-1', {
  kind: 'audio',
  subtype: 'voice',
  name: '旁白',
})
const shot = node('shot-1', {
  kind: 'video',
  subtype: 'shot',
  name: '走廊',
  label: '走廊',
})
const doc = node('txt-1', {
  kind: 'text',
  subtype: 'shotNote',
  name: '第二镜说明',
  body: '',
})

describe('set_prompt / set_text 落地后同步 @ 槽', () => {
  it('镜头说明里写 @首帧 → 建边 + 进槽，边打 via: mention', () => {
    const { view } = renderGraph(stateOf([platform, shot]))
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: shot.id,
        prompt: '开场 @首帧 站台图',
        mode: 'replace',
      })
    })
    const edges = view.result.current.edges
    expect(edges).toHaveLength(1)
    expect(edges[0]?.slot).toBe(NODE_SLOT_IDS.firstFrame)
    expect(edges[0]?.data?.via).toBe(NODE_EDGE_VIA_IDS.mention)
    const target = view.result.current.nodes.find((item) => item.id === shot.id)
    const binding = target?.data.slots?.[NODE_SLOT_IDS.firstFrame]
    expect(binding?.cur).toBeTruthy()
    expect(binding?.versions[0]?.sourceNodeId).toBe(platform.id)
  })

  it('文本节点正文里的 @ 落 source 槽', () => {
    const { view } = renderGraph(stateOf([platform, doc]))
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setText,
        target: doc.id,
        body: '参考 @站台图',
        mode: 'replace',
      })
    })
    expect(view.result.current.edges[0]?.slot).toBe(NODE_SLOT_IDS.source)
  })

  it('退格删掉 @ → 边随之断开', () => {
    const { view } = renderGraph(stateOf([platform, narration, shot]))
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: shot.id,
        prompt: '@首帧 站台图 配 @语音 旁白',
        mode: 'replace',
      })
    })
    expect(view.result.current.edges).toHaveLength(2)
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: shot.id,
        prompt: '@首帧 站台图 配',
        mode: 'replace',
      })
    })
    expect(view.result.current.edges).toHaveLength(1)
    expect(view.result.current.edges[0]?.slot).toBe(NODE_SLOT_IDS.firstFrame)
  })

  it('@ 引起的连线与 set_prompt 合并成**一个**撤销条目', () => {
    const { view } = renderGraph(stateOf([platform, narration, shot]))
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: shot.id,
        prompt: '@首帧 站台图 配 @语音 旁白',
        mode: 'replace',
      })
    })
    expect(view.result.current.edges).toHaveLength(2)
    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.edges).toHaveLength(0)
    expect(promptOf(view.result.current, shot.id)).toBe(' ')
    expect(view.result.current.canUndo).toBe(false)
  })

  it('撤销一次也把断掉的 @ 边（连同 via 标）还回来', () => {
    const { view } = renderGraph(stateOf([platform, shot]))
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: shot.id,
        prompt: '@首帧 站台图',
        mode: 'replace',
      })
    })
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: shot.id,
        prompt: '空镜',
        mode: 'replace',
      })
    })
    expect(view.result.current.edges).toHaveLength(0)
    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.edges).toHaveLength(1)
    expect(view.result.current.edges[0]?.data?.via).toBe(
      NODE_EDGE_VIA_IDS.mention,
    )
  })
})

describe('手拆 @ 建的边 → 正文里的 chip 跟着删', () => {
  it('拆边 + 删 chip 是一个撤销条目，且不会自己长回来', () => {
    const { view } = renderGraph(stateOf([platform, shot]))
    act(() => {
      view.result.current.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: shot.id,
        prompt: '开场 @首帧 站台图 收在门口',
        mode: 'replace',
      })
    })
    const edgeId = view.result.current.edges[0]?.id ?? ''
    act(() => {
      view.result.current.disconnect(edgeId)
    })
    expect(view.result.current.edges).toHaveLength(0)
    expect(promptOf(view.result.current, shot.id)).toBe('开场 收在门口')

    act(() => {
      view.result.current.undo()
    })
    expect(view.result.current.edges).toHaveLength(1)
    expect(promptOf(view.result.current, shot.id)).toBe(
      '开场 @首帧 站台图 收在门口',
    )
  })

  it('手连 / 拖入的边（没有 via 标）拆掉时不动正文', () => {
    const manual: NodeWorkflowEdgeV4 = {
      id: 'e-manual',
      source: platform.id,
      sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
      target: shot.id,
      slot: NODE_SLOT_IDS.firstFrame,
    }
    const withPrompt = node('shot-2', {
      kind: 'video',
      subtype: 'shot',
      name: '走廊',
      label: '走廊',
      prompt: '开场 站台图 收在门口',
    })
    const { view } = renderGraph(
      stateOf([platform, withPrompt], [{ ...manual, target: withPrompt.id }]),
    )
    act(() => {
      view.result.current.disconnect('e-manual')
    })
    expect(view.result.current.edges).toHaveLength(0)
    expect(promptOf(view.result.current, withPrompt.id)).toBe(
      '开场 站台图 收在门口',
    )
  })
})
