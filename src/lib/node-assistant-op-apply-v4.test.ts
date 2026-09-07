import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  applyInverseV4,
  applyNodeAssistantOpV4,
  type ApplyOpV4Context,
  type NodeV4Inverse,
} from '@/lib/node-assistant-op-apply-v4'
import { slotVersionId } from '@/lib/node-slot-binding'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

const NOW = '2026-09-07T00:00:00.000Z'

function makeContext(): ApplyOpV4Context {
  let counter = 0
  return {
    now: NOW,
    refs: new Map<string, string>(),
    mintId: (prefix) => {
      counter += 1
      return `${prefix}_${counter}`
    },
  }
}

function imageNode(id: string, shotNo?: number): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'shot',
      name: id,
      status: 'idle',
      createdAt: NOW,
      ...(shotNo ? { shotNo } : {}),
    },
  }
}

function shotNode(id: string, shotNo: number): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: `S0${shotNo}·镜头`,
      status: 'idle',
      createdAt: NOW,
      shotNo,
    },
  }
}

function textNode(id: string, body = '原文'): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      subtype: 'shotNote',
      name: id,
      status: 'idle',
      createdAt: NOW,
      body,
    },
  }
}

function baseState(): NodeWorkflowStateV4 {
  return {
    version: 4,
    nodes: [
      imageNode('i_a', 2),
      shotNode('v_02', 2),
      shotNode('v_03', 3),
      textNode('t_02'),
    ],
    edges: [],
  }
}

/** 应用一批 op 并把 inverse 收好——助手的一轮 = 一个 undo 条目（§7）。 */
function runBatch(
  state: NodeWorkflowStateV4,
  ops: NodeAssistantOpV4[],
  context = makeContext(),
): {
  state: NodeWorkflowStateV4
  inverses: NodeV4Inverse[]
  changed: string[]
} {
  let next = state
  const inverses: NodeV4Inverse[] = []
  const changed: string[] = []
  for (const op of ops) {
    const result = applyNodeAssistantOpV4(next, op, context)
    if (!result.ok) throw new Error(`op failed: ${op.op} / ${result.reason}`)
    next = result.state
    inverses.push(result.inverse)
    changed.push(...result.changedNodeIds)
  }
  return { state: next, inverses, changed }
}

describe('结构 op', () => {
  it('add_node 落稳定名与位置，ref 供同批 connect 引用', () => {
    const context = makeContext()
    const { state } = runBatch(
      baseState(),
      [
        {
          op: 'add_node',
          kind: 'image',
          subtype: 'shot',
          ref: 'kf',
          shotNo: 4,
        },
        { op: 'connect', source: 'kf', target: 'v_03', slot: 'firstFrame' },
      ],
      context,
    )
    const created = state.nodes.find((node) => node.data.name === 'S04·镜头图')
    expect(created).toBeDefined()
    expect(created?.data.shotNo).toBe(4)
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0]?.source).toBe(created?.id)
    expect(state.edges[0]?.slot).toBe('firstFrame')
  })

  it('connect 的 inverse 是 disconnect，撤销后边和槽都回去', () => {
    const context = makeContext()
    const before = baseState()
    const { state, inverses } = runBatch(
      before,
      [{ op: 'connect', source: 'i_a', target: 'v_02', slot: 'firstFrame' }],
      context,
    )
    expect(
      state.nodes.find((n) => n.id === 'v_02')?.data.slots?.firstFrame,
    ).toBeDefined()
    const undone = applyInverseV4(state, inverses[0]!, context)
    expect(undone.edges).toHaveLength(0)
    expect(
      undone.nodes.find((n) => n.id === 'v_02')?.data.slots,
    ).toBeUndefined()
  })

  it('delete 的 inverse 是整份快照 + 边列表，撤销后节点与边一起回来', () => {
    const context = makeContext()
    const { state: connected } = runBatch(
      baseState(),
      [{ op: 'connect', source: 'i_a', target: 'v_02', slot: 'firstFrame' }],
      context,
    )
    const result = applyNodeAssistantOpV4(
      connected,
      { op: 'delete', target: 'i_a' },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.nodes.some((n) => n.id === 'i_a')).toBe(false)
    expect(result.state.edges).toHaveLength(0)
    const restored = applyInverseV4(result.state, result.inverse, context)
    expect(restored.nodes.some((n) => n.id === 'i_a')).toBe(true)
    expect(restored.edges).toHaveLength(1)
  })

  it('reorder_shot 一次改完所有镜号与名字，inverse 是反向 reorder', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'reorder_shot', from: 2, to: 3 },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.nodes.find((n) => n.id === 'v_02')?.data.shotNo).toBe(3)
    expect(result.state.nodes.find((n) => n.id === 'v_02')?.data.name).toBe(
      'S03·镜头',
    )
    const undone = applyInverseV4(result.state, result.inverse, context)
    expect(undone.nodes.find((n) => n.id === 'v_02')?.data.shotNo).toBe(2)
  })

  it('move_to_shot 的 inverse 回到原镜号', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'move_to_shot', target: 'i_a', shotNo: null },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.state.nodes.find((n) => n.id === 'i_a')?.data.shotNo,
    ).toBeUndefined()
    const undone = applyInverseV4(result.state, result.inverse, context)
    expect(undone.nodes.find((n) => n.id === 'i_a')?.data.shotNo).toBe(2)
  })
})

describe('槽内版本 op', () => {
  it('set_slot_version 指向停用版被拒（与手动路径同一条校验）', () => {
    const context = makeContext()
    const { state } = runBatch(
      baseState(),
      [
        { op: 'connect', source: 'i_a', target: 'v_02', slot: 'firstFrame' },
        {
          op: 'mark_version_blocked',
          target: 'v_02',
          slot: NODE_SLOT_IDS.firstFrame,
          versionId: slotVersionId('e_1'),
          blocked: true,
          reason: '首帧动作不自然',
        },
      ],
      context,
    )
    const result = applyNodeAssistantOpV4(
      state,
      {
        op: 'set_slot_version',
        target: 'v_02',
        slot: NODE_SLOT_IDS.firstFrame,
        versionId: slotVersionId('e_1'),
      },
      context,
    )
    expect(result).toEqual({ ok: false, reason: 'blockedVersion' })
  })
})

describe('内容 op', () => {
  it('set_text append 追加而不是覆盖，inverse 回到原文', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_text', target: 't_02', body: '补充', mode: 'append' },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.state.nodes.find((n) => n.id === 't_02')
    expect(node?.data.kind === 'text' && node.data.body).toBe('原文\n\n补充')
    const undone = applyInverseV4(result.state, result.inverse, context)
    const back = undone.nodes.find((n) => n.id === 't_02')
    expect(back?.data.kind === 'text' && back.data.body).toBe('原文')
  })

  it('set_prompt 落在图片节点上，文本节点被拒', () => {
    const context = makeContext()
    const ok = applyNodeAssistantOpV4(
      baseState(),
      {
        op: 'set_prompt',
        target: 'i_a',
        prompt: '控制室广角',
        mode: 'replace',
      },
      context,
    )
    expect(ok.ok).toBe(true)
    const rejected = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_prompt', target: 't_02', prompt: 'x', mode: 'replace' },
      context,
    )
    expect(rejected).toEqual({ ok: false, reason: 'notAGeneratedNode' })
  })

  it('set_field blocked 落在图片上并可撤销', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_field', target: 'i_a', field: 'blocked', value: true },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const node = result.state.nodes.find((n) => n.id === 'i_a')
    expect(node?.data.kind === 'image' && node.data.blocked).toBe(true)
    const undone = applyInverseV4(result.state, result.inverse, context)
    const back = undone.nodes.find((n) => n.id === 'i_a')
    expect(back?.data.kind === 'image' && back.data.blocked).toBeUndefined()
  })

  it('set_field shotNo 走 move_to_shot，名字跟着改', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      { ...baseState(), nodes: [shotNode('v_02', 2)] },
      { op: 'set_field', target: 'v_02', field: 'shotNo', value: 5 },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.nodes[0]?.data.name).toBe('S05·镜头')
  })

  it('set_model 在没有旧选择也没有 resolver 时失败可见，不静默半写', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_model', target: 'i_a', modelId: 'foo' },
      context,
    )
    expect(result).toEqual({ ok: false, reason: 'modelNotResolvable' })
  })
})

describe('不归执行器管的 op', () => {
  it('generate / read_canvas / find_node 返回 handled:false，交回客户端确认路径', () => {
    const context = makeContext()
    for (const op of [
      { op: 'generate', target: 'v_02' },
      { op: 'read_canvas', scope: 'all' },
      { op: 'find_node', query: 'S02' },
    ] as NodeAssistantOpV4[]) {
      const result = applyNodeAssistantOpV4(baseState(), op, context)
      expect(result).toMatchObject({ ok: false, handled: false })
    }
  })
})

describe('一轮批次的撤销', () => {
  it('逆序回放整批 inverse 后回到起点', () => {
    const context = makeContext()
    const before = baseState()
    const { state, inverses } = runBatch(
      before,
      [
        {
          op: 'add_node',
          kind: 'audio',
          subtype: 'voice',
          ref: 'vo',
          shotNo: 2,
        },
        { op: 'connect', source: 'vo', target: 'v_02', slot: 'voice' },
        {
          op: 'set_prompt',
          target: 'v_02',
          prompt: '7 秒中近景',
          mode: 'replace',
        },
      ],
      context,
    )
    expect(state.nodes).toHaveLength(before.nodes.length + 1)
    let undone = state
    for (const inverse of [...inverses].reverse()) {
      undone = applyInverseV4(undone, inverse, context)
    }
    expect(undone.nodes.map((n) => n.id).sort()).toEqual(
      before.nodes.map((n) => n.id).sort(),
    )
    expect(undone.edges).toHaveLength(0)
  })
})
