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

function shotNode(id: string, shotNo: number, label = `镜头${shotNo}`): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      // 稳定名 = `label`，⛔ 不带 `S<nn>` 前缀（C1 契约修正 1）。
      label,
      name: label,
      status: 'idle',
      createdAt: NOW,
      shotNo,
    },
  }
}

function characterNode(id: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'character',
      name: id,
      status: 'idle',
      createdAt: NOW,
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

  it('reorder_shot 一次改完所有镜号，inverse 是反向 reorder', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'reorder_shot', from: 2, to: 3 },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.nodes.find((n) => n.id === 'v_02')?.data.shotNo).toBe(3)
    const undone = applyInverseV4(result.state, result.inverse, context)
    expect(undone.nodes.find((n) => n.id === 'v_02')?.data.shotNo).toBe(2)
  })

  it('reorder_shot 只翻 shotNo：label 与 name 一个字都不改（C1 契约修正 1）', () => {
    const context = makeContext()
    const before = baseState()
    const result = applyNodeAssistantOpV4(
      before,
      { op: 'reorder_shot', from: 2, to: 3 },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const nameOf = (state: NodeWorkflowStateV4, id: string) => {
      const data = state.nodes.find((n) => n.id === id)?.data
      return [data?.name, data?.kind === 'video' ? data.label : undefined]
    }
    for (const id of ['v_02', 'v_03']) {
      expect(nameOf(result.state, id)).toEqual(nameOf(before, id))
    }
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

  it('set_field shotNo 走 move_to_shot，⛔ 名字不跟着改', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      { ...baseState(), nodes: [shotNode('v_02', 2)] },
      { op: 'set_field', target: 'v_02', field: 'shotNo', value: 5 },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.nodes[0]?.data.shotNo).toBe(5)
    expect(result.state.nodes[0]?.data.name).toBe('镜头2')
  })

  it('改名 = set_field label，落在镜头的稳定名上并可撤销', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_field', target: 'v_02', field: 'label', value: '有人还在' },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const shot = result.state.nodes.find((n) => n.id === 'v_02')?.data
    expect(shot?.kind === 'video' && shot.label).toBe('有人还在')
    const undone = applyInverseV4(result.state, result.inverse, context)
    const back = undone.nodes.find((n) => n.id === 'v_02')?.data
    expect(back?.kind === 'video' && back.label).toBe('镜头2')
  })

  it('label 落在没有这个字段的节点上 → 失败可见，⛔ 不静默剥掉', () => {
    const context = makeContext()
    expect(
      applyNodeAssistantOpV4(
        baseState(),
        { op: 'set_field', target: 'i_a', field: 'label', value: '随便' },
        context,
      ),
    ).toEqual({ ok: false, reason: 'fieldNotOnThisNode' })
  })

  it('set_field contextCardId 写进角色图节点（C1 契约修正 3）', () => {
    const context = makeContext()
    const state = { ...baseState(), nodes: [characterNode('i_c')] }
    const result = applyNodeAssistantOpV4(
      state,
      { op: 'set_field', target: 'i_c', field: 'contextCardId', value: 'cc_1' },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.state.nodes[0]?.data
    expect(data?.kind === 'image' && data.contextCardId).toBe('cc_1')
    const undone = applyInverseV4(result.state, result.inverse, context)
    const back = undone.nodes[0]?.data
    expect(back?.kind === 'image' && back.contextCardId).toBeUndefined()
  })

  it('attach_asset 带 contextCardId：边与硬链一起落，inverse 一起撤', () => {
    const context = makeContext()
    const state: NodeWorkflowStateV4 = {
      ...baseState(),
      nodes: [imageNode('i_ref'), characterNode('i_c')],
    }
    const result = applyNodeAssistantOpV4(
      state,
      {
        op: 'attach_asset',
        target: 'i_c',
        slot: NODE_SLOT_IDS.reference,
        sourceNodeId: 'i_ref',
        contextCardId: 'cc_1',
      },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const linked = result.state.nodes.find((n) => n.id === 'i_c')?.data
    expect(linked?.kind === 'image' && linked.contextCardId).toBe('cc_1')
    expect(result.state.edges).toHaveLength(1)

    const undone = applyInverseV4(result.state, result.inverse, context)
    const back = undone.nodes.find((n) => n.id === 'i_c')?.data
    expect(back?.kind === 'image' && back.contextCardId).toBeUndefined()
    expect(undone.edges).toHaveLength(0)
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

describe('音色档 / 合并裁剪 op（C3c-②Q）', () => {
  function audioNode(id: string): NodeV4 {
    return {
      id,
      position: { x: 0, y: 0 },
      data: {
        kind: 'audio',
        subtype: 'voice',
        name: id,
        status: 'idle',
        createdAt: NOW,
        voiceProfile: { emotion: '平静', speed: 1 },
      },
    }
  }

  function mergeNode(id: string): NodeV4 {
    return {
      id,
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        subtype: 'merge',
        name: id,
        status: 'idle',
        createdAt: NOW,
      },
    }
  }

  it('set_voice_profile 是补丁：没带的档位留着', () => {
    const state: NodeWorkflowStateV4 = {
      ...baseState(),
      nodes: [audioNode('a_01')],
    }
    const result = applyNodeAssistantOpV4(
      state,
      { op: 'set_voice_profile', target: 'a_01', profile: { speed: 1.4 } },
      makeContext(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.state.nodes[0]?.data
    expect(data?.kind === 'audio' && data.voiceProfile).toEqual({
      emotion: '平静',
      speed: 1.4,
    })
  })

  it('越界的语速不许落进节点（schema 层放宽、执行层拒）', () => {
    const state: NodeWorkflowStateV4 = {
      ...baseState(),
      nodes: [audioNode('a_01')],
    }
    const result = applyNodeAssistantOpV4(
      state,
      { op: 'set_voice_profile', target: 'a_01', profile: { speed: 9 } },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'invalidVoiceProfile' })
  })

  it('set_voice_profile 的 inverse 能把旧档位放回去', () => {
    const state: NodeWorkflowStateV4 = {
      ...baseState(),
      nodes: [audioNode('a_01')],
    }
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      state,
      {
        op: 'set_voice_profile',
        target: 'a_01',
        profile: { emotion: '愤怒', speed: 1.8 },
      },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const undone = applyInverseV4(result.state, result.inverse, context)
    const data = undone.nodes[0]?.data
    expect(data?.kind === 'audio' && data.voiceProfile).toEqual({
      emotion: '平静',
      speed: 1,
    })
  })

  it('set_merge_clips 拒收 start >= end 的段', () => {
    const state: NodeWorkflowStateV4 = {
      ...baseState(),
      nodes: [mergeNode('m_01')],
    }
    const result = applyNodeAssistantOpV4(
      state,
      {
        op: 'set_merge_clips',
        target: 'm_01',
        clips: [{ url: 'https://cdn/a.mp4', startSec: 4, endSec: 2 }],
      },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'invalidClipRange' })
  })

  it('set_merge_clips 只落在 video.merge 上', () => {
    const state = baseState()
    const result = applyNodeAssistantOpV4(
      state,
      {
        op: 'set_merge_clips',
        target: 'v_02',
        clips: [{ url: 'https://cdn/a.mp4', startSec: 0, endSec: 2 }],
      },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'notAMergeNode' })
  })

  it('set_merge_clips 写进 mergeSettings 并可撤销', () => {
    const state: NodeWorkflowStateV4 = {
      ...baseState(),
      nodes: [mergeNode('m_01')],
    }
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      state,
      {
        op: 'set_merge_clips',
        target: 'm_01',
        clips: [{ url: 'https://cdn/a.mp4', startSec: 0.5, endSec: 3 }],
      },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.state.nodes[0]?.data
    expect(
      data?.kind === 'video' && data.subtype === 'merge'
        ? data.mergeSettings?.clips
        : undefined,
    ).toEqual([{ url: 'https://cdn/a.mp4', startSec: 0.5, endSec: 3 }])
    const undone = applyInverseV4(result.state, result.inverse, context)
    const back = undone.nodes[0]?.data
    expect(
      back?.kind === 'video' && back.subtype === 'merge'
        ? back.mergeSettings
        : undefined,
    ).toBeUndefined()
  })
})
