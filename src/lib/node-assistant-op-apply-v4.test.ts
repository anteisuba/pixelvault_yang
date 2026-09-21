import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
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

  it('切换模型使用新路由，撤销恢复旧路由，未知模型不继承旧凭证', () => {
    const state = baseState()
    const oldModel = {
      optionId: 'old-option',
      modelId: 'old-model',
      adapterType: AI_ADAPTER_TYPES.FAL,
      providerConfig: { label: 'old', baseUrl: 'https://old.example.com' },
      apiKeyId: 'old-key',
    }
    const newModel = {
      ...oldModel,
      optionId: 'new-option',
      modelId: 'new-model',
      providerConfig: { label: 'new', baseUrl: 'https://new.example.com' },
      apiKeyId: 'new-key',
    }
    const target = state.nodes.find((n) => n.id === 'i_a')!
    if (target.data.kind === 'text') throw new Error('expected image')
    target.data.model = oldModel
    const context = {
      ...makeContext(),
      resolveModel: (id: string) =>
        id === newModel.modelId ? newModel : undefined,
    }
    const result = applyNodeAssistantOpV4(
      state,
      { op: 'set_model', target: target.id, modelId: newModel.modelId },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.state.nodes.find((n) => n.id === target.id)?.data,
    ).toMatchObject({ model: newModel })
    const undone = applyInverseV4(result.state, result.inverse, context)
    expect(undone.nodes.find((n) => n.id === target.id)).toEqual(target)
    expect(undone.edges).toEqual(state.edges)
    expect(
      applyNodeAssistantOpV4(
        state,
        { op: 'set_model', target: target.id, modelId: 'unknown' },
        context,
      ),
    ).toEqual({ ok: false, reason: 'modelNotResolvable' })
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
})

describe('审核态 op（C3c-③b）', () => {
  it('set_review_state 把打回理由与改词增补分两个字段落下，并盖上执行器的时间戳', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      {
        op: 'set_review_state',
        target: 'i_a',
        url: 'https://cdn/shot.png',
        state: 'rejected',
        reason: '首帧动作不自然',
        promptPatch: '让她把手放下',
      },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.state.nodes[0]?.data
    expect(
      data?.kind === 'image'
        ? data.mediaReview?.['https://cdn/shot.png']
        : null,
    ).toEqual({
      state: 'rejected',
      reason: '首帧动作不自然',
      promptPatch: '让她把手放下',
      // ⚠ 时间戳由执行器盖（`context.now`），⛔ 不收进载荷 —— 让调用方自己写
      // 「什么时候审的」等于让一个可以撒谎的字段进了账。
      reviewedAt: NOW,
    })
  })

  it('set_review_state 可撤销回没有审核记录的状态', () => {
    const context = makeContext()
    const result = applyNodeAssistantOpV4(
      baseState(),
      {
        op: 'set_review_state',
        target: 'i_a',
        url: 'https://cdn/shot.png',
        state: 'rejected',
      },
      context,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const undone = applyInverseV4(result.state, result.inverse, context)
    const back = undone.nodes.find((node) => node.id === 'i_a')?.data
    expect(back?.kind === 'image' ? back.mediaReview : null).toBeUndefined()
  })
})

/* ── S3b：产出版本 + 子型 ───────────────────────────────────────────── */

/** 带两版产出的图片卡。 */
function versionedImageNode(id: string): NodeV4 {
  return {
    id,
    position: { x: 10, y: 20 },
    data: {
      kind: 'image',
      subtype: 'result',
      name: id,
      status: 'idle',
      createdAt: NOW,
      url: 'https://cdn/b.png',
      outputs: {
        versions: [
          {
            id: 'ov_1',
            url: 'https://cdn/a.png',
            createdAt: NOW,
            meta: { mediaWidth: 100, mediaHeight: 50 },
          },
          { id: 'ov_2', url: 'https://cdn/b.png', createdAt: NOW },
        ],
        cur: 1,
      },
    },
  }
}

describe('set_output_version：卡下那排小点', () => {
  const state = (): NodeWorkflowStateV4 => ({
    version: 4,
    nodes: [versionedImageNode('i_v')],
    edges: [],
  })

  it('切到第 0 版：顶层 url 与尺寸都跟着回去', () => {
    const result = applyNodeAssistantOpV4(
      state(),
      { op: 'set_output_version', target: 'i_v', index: 0 },
      makeContext(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const data = result.state.nodes[0]!.data as {
      url?: string
      mediaWidth?: number
    }
    expect(data.url).toBe('https://cdn/a.png')
    expect(data.mediaWidth).toBe(100)
    expect(result.changedNodeIds).toEqual(['i_v'])
  })

  it('inverse 是**原来那个下标**，撤销回得去', () => {
    const before = state()
    const result = applyNodeAssistantOpV4(
      before,
      { op: 'set_output_version', target: 'i_v', index: 0 },
      makeContext(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inverse).toEqual({
      kind: 'op',
      op: { op: 'set_output_version', target: 'i_v', index: 1 },
    })
    const back = applyInverseV4(result.state, result.inverse, makeContext())
    expect((back.nodes[0]!.data as { url?: string }).url).toBe(
      'https://cdn/b.png',
    )
  })

  it('越界**失败可见**，⛔ 不静默钳到最后一版', () => {
    const result = applyNodeAssistantOpV4(
      state(),
      { op: 'set_output_version', target: 'i_v', index: 7 },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'unknownOutputVersion' })
  })

  it('文本卡没有产出可切', () => {
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_output_version', target: 't_02', index: 0 },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'notAGeneratedNode' })
  })
})

describe('split_output_version：拆出当前版本', () => {
  const state = (): NodeWorkflowStateV4 => ({
    version: 4,
    nodes: [versionedImageNode('i_v')],
    edges: [],
  })

  it('非破坏：原卡版本表一个字不动，新卡只带那一版', () => {
    const before = state()
    const result = applyNodeAssistantOpV4(
      before,
      { op: 'split_output_version', target: 'i_v', index: 0 },
      makeContext(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const origin = result.state.nodes.find((node) => node.id === 'i_v')!
    expect(
      (origin.data as { outputs?: { versions: unknown[] } }).outputs?.versions,
    ).toHaveLength(2)

    const spawned = result.state.nodes.find((node) => node.id !== 'i_v')!
    const data = spawned.data as {
      url?: string
      mediaWidth?: number
      outputs?: { versions: unknown[]; cur: number }
    }
    expect(data.url).toBe('https://cdn/a.png')
    expect(data.mediaWidth).toBe(100)
    expect(data.outputs?.versions).toHaveLength(1)
    // ⛔ 不与原卡重叠。
    expect(spawned.position).not.toEqual(origin.position)
  })

  it('缺省 index = 当前版；inverse 是删掉刚拆出来的那张', () => {
    const result = applyNodeAssistantOpV4(
      state(),
      { op: 'split_output_version', target: 'i_v' },
      makeContext(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const spawned = result.state.nodes.find((node) => node.id !== 'i_v')!
    expect((spawned.data as { url?: string }).url).toBe('https://cdn/b.png')
    expect(result.inverse).toEqual({ kind: 'removeNode', nodeId: spawned.id })
    const back = applyInverseV4(result.state, result.inverse, makeContext())
    expect(back.nodes).toHaveLength(1)
  })
})

describe('set_subtype：设为角色卡', () => {
  it('image 子型可换，inverse 回原来的子型', () => {
    const before = baseState()
    const result = applyNodeAssistantOpV4(
      before,
      { op: 'set_subtype', target: 'i_a', subtype: 'character' },
      makeContext(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.state.nodes[0]!.data as { subtype: string }).subtype).toBe(
      'character',
    )
    expect(result.inverse).toEqual({
      kind: 'op',
      op: { op: 'set_subtype', target: 'i_a', subtype: 'shot' },
    })
    const back = applyInverseV4(result.state, result.inverse, makeContext())
    expect((back.nodes[0]!.data as { subtype: string }).subtype).toBe('shot')
  })

  it('同一个子型不算一步（⛔ 不给撤销栈塞一条什么都没变的条目）', () => {
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_subtype', target: 'i_a', subtype: 'shot' },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'noChange' })
  })

  it('⛔ 只有 image 有子型可换：视频卡拒绝', () => {
    const result = applyNodeAssistantOpV4(
      baseState(),
      { op: 'set_subtype', target: 'v_02', subtype: 'character' },
      makeContext(),
    )
    expect(result).toMatchObject({ ok: false, reason: 'notAnImageNode' })
  })
})

describe('批操作：refs 别名（「生镜头」那一批）', () => {
  it('第二条 connect 认得出第一条刚建的那张', () => {
    const run = runBatch(baseState(), [
      {
        op: 'add_node',
        kind: 'video',
        subtype: 'shot',
        ref: 'shot',
      },
      {
        op: 'connect',
        source: 'i_a',
        target: 'shot',
        slot: NODE_SLOT_IDS.firstFrame,
      },
    ])
    const created = run.state.nodes.find(
      (node) => !baseState().nodes.some((old) => old.id === node.id),
    )!
    expect(run.state.edges).toHaveLength(1)
    expect(run.state.edges[0]).toMatchObject({
      source: 'i_a',
      target: created.id,
    })
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * 剧本投影（进度表 24 · `project_script`）
 * ───────────────────────────────────────────────────────────────────────── */

const SCRIPT_BODY = 'S01 · 雨夜街角 · 4s\nS02 · 递伞 · @小黑\nS03 · 对视'

function scriptState(body = SCRIPT_BODY): NodeWorkflowStateV4 {
  return {
    version: 4,
    nodes: [
      {
        id: 'sc_1',
        position: { x: 0, y: 0 },
        data: {
          kind: 'text',
          subtype: 'script',
          name: '剧本 · 借伞',
          status: 'idle',
          createdAt: NOW,
          body,
        },
      },
    ],
    edges: [],
  }
}

function projectedShots(state: NodeWorkflowStateV4): NodeV4[] {
  return state.nodes.filter(
    (node) =>
      node.data.kind === 'video' &&
      node.data.subtype === 'shot' &&
      node.data.scriptShot !== undefined,
  )
}

function scriptRefOf(node: NodeV4 | undefined) {
  return node?.data.kind === 'video' && node.data.subtype === 'shot'
    ? node.data.scriptShot
    : undefined
}

describe('project_script · 投影（画板 DesignD7Script ①②）', () => {
  it('⭐ create 按分镜建出一排镜头，并从剧本卡连到每镜的文本槽', () => {
    const run = runBatch(scriptState(), [
      { op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' },
    ])
    const shots = projectedShots(run.state)
    expect(shots).toHaveLength(3)
    expect(shots.map((node) => node.data.shotNo)).toEqual([1, 2, 3])
    // 每一镜一条边，源恒为剧本卡，槽是 `text`（角色 `script` = 正文那一档）。
    expect(run.state.edges).toHaveLength(3)
    for (const edge of run.state.edges) {
      expect(edge.source).toBe('sc_1')
      expect(edge.slot).toBe(NODE_SLOT_IDS.text)
    }
    expect(scriptRefOf(shots[0])).toMatchObject({
      scriptNodeId: 'sc_1',
      shotKey: 's1',
      state: 'synced',
    })
  })

  it('`@小黑` 开出角色空槽——只有名字，⛔ 没有 url / cardId（35 未落）', () => {
    const run = runBatch(scriptState(), [
      { op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' },
    ])
    const withRole = projectedShots(run.state).find(
      (node) => scriptRefOf(node)?.shotKey === 's2',
    )
    const slots =
      withRole?.data.kind === 'video' && withRole.data.subtype === 'shot'
        ? withRole.data.referenceSlots
        : undefined
    expect(slots).toEqual([{ role: '小黑' }])
  })

  it('时长写进生成档位（`4s` → params.duration）', () => {
    const run = runBatch(scriptState(), [
      { op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' },
    ])
    const first = projectedShots(run.state).find(
      (node) => scriptRefOf(node)?.shotKey === 's1',
    )
    expect(
      first?.data.kind === 'video' ? first.data.params?.duration : undefined,
    ).toBe('4')
  })

  it('⭐ 投影过的剧本再 create 被拒并提示改用 reproject', () => {
    const context = makeContext()
    const first = runBatch(
      scriptState(),
      [{ op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' }],
      context,
    )
    const again = applyNodeAssistantOpV4(
      first.state,
      { op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' },
      context,
    )
    expect(again).toMatchObject({ ok: false, reason: 'alreadyProjected' })
  })

  it('没投过的剧本 reproject 被拒；文本节点不是剧本卡也被拒', () => {
    const state = scriptState()
    expect(
      applyNodeAssistantOpV4(
        state,
        { op: 'project_script', scriptNodeId: 'sc_1', mode: 'reproject' },
        makeContext(),
      ),
    ).toMatchObject({ ok: false, reason: 'notProjected' })
    expect(
      applyNodeAssistantOpV4(
        baseState(),
        { op: 'project_script', scriptNodeId: 't_02', mode: 'create' },
        makeContext(),
      ),
    ).toMatchObject({ ok: false, reason: 'notScriptNode' })
  })

  it('拆不出镜的正文被拒（⛔ 不建一排空节点）', () => {
    expect(
      applyNodeAssistantOpV4(
        scriptState('   '),
        { op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' },
        makeContext(),
      ),
    ).toMatchObject({ ok: false, reason: 'emptyScript' })
  })
})

describe('project_script · 重投影 diff（画板 DesignD7Script ③）', () => {
  function reprojected(nextBody: string) {
    const context = makeContext()
    const first = runBatch(
      scriptState(),
      [{ op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' }],
      context,
    )
    const edited = replaceScriptBody(first.state, nextBody)
    const result = applyNodeAssistantOpV4(
      edited,
      { op: 'project_script', scriptNodeId: 'sc_1', mode: 'reproject' },
      context,
    )
    if (!result.ok) throw new Error(`reproject failed: ${result.reason}`)
    return { before: first.state, result }
  }

  function replaceScriptBody(
    state: NodeWorkflowStateV4,
    body: string,
  ): NodeWorkflowStateV4 {
    return {
      ...state,
      nodes: state.nodes.map((node) =>
        node.id === 'sc_1' && node.data.kind === 'text'
          ? { ...node, data: { ...node.data, body } }
          : node,
      ),
    }
  }

  it('⭐ 文案变了的旧镜只标「已变」并带上新文本，⛔ 不覆盖节点上的内容', () => {
    const { result } = reprojected(
      'S01 · 雨夜街角 · 4s\nS02 · 递伞 · 近景 · @小黑\nS03 · 对视',
    )
    const changed = projectedShots(result.state).find(
      (node) => scriptRefOf(node)?.shotKey === 's2',
    )!
    expect(scriptRefOf(changed)).toMatchObject({
      state: 'changed',
      // 左边不动：它是「上一次同步进来的那一段」。
      projectedText: '递伞 · @小黑',
      pendingText: '递伞 · 近景 · @小黑',
    })
    // 节点自己的提示词一个字没动 —— 用户可能已经在这一镜上改过、出过片。
    expect(
      changed.data.kind === 'video' ? changed.data.prompt : undefined,
    ).toBe('递伞 · @小黑')
  })

  it('⭐ 剧本里删掉的镜标灰不删', () => {
    const { result } = reprojected('S01 · 雨夜街角 · 4s\nS02 · 递伞 · @小黑')
    const shots = projectedShots(result.state)
    expect(shots).toHaveLength(3)
    expect(
      scriptRefOf(shots.find((node) => scriptRefOf(node)?.shotKey === 's3')),
    ).toMatchObject({
      state: 'dropped',
    })
  })

  it('新增的镜追加到末尾', () => {
    const { result } = reprojected(`${SCRIPT_BODY}\nS04 · 伞留下`)
    const created = projectedShots(result.state).find(
      (node) => scriptRefOf(node)?.shotKey === 's4',
    )!
    expect(created.data.shotNo).toBe(4)
  })

  it('改回原文的镜自己消掉角标（回到 synced）', () => {
    const context = makeContext()
    const first = runBatch(
      scriptState(),
      [{ op: 'project_script', scriptNodeId: 'sc_1', mode: 'create' }],
      context,
    )
    const changedBody = 'S01 · 雨夜街角 · 4s\nS02 · 递伞 · 近景\nS03 · 对视'
    const marked = applyNodeAssistantOpV4(
      replaceScriptBody(first.state, changedBody),
      { op: 'project_script', scriptNodeId: 'sc_1', mode: 'reproject' },
      context,
    )
    if (!marked.ok) throw new Error('reproject failed')
    const back = applyNodeAssistantOpV4(
      replaceScriptBody(marked.state, SCRIPT_BODY),
      { op: 'project_script', scriptNodeId: 'sc_1', mode: 'reproject' },
      context,
    )
    if (!back.ok) throw new Error('reproject failed')
    const node = projectedShots(back.state).find(
      (item) => scriptRefOf(item)?.shotKey === 's2',
    )
    expect(scriptRefOf(node)).toMatchObject({ state: 'synced' })
    expect(scriptRefOf(node)).not.toHaveProperty('pendingText')
  })

  /**
   * ⭐ spec 原文：inverse = **只删本次新增的那几面镜**，⛔ 不碰「标已变」与
   * 「标灰」的旧镜 —— 它们上面可能挂着用户已经生成的产物。
   */
  it('⭐ 撤销只删本次新增的镜，标记过的旧镜原样留着', () => {
    const { result } = reprojected(
      'S01 · 雨夜街角 · 4s\nS02 · 递伞 · 近景\nS04 · 伞留下',
    )
    const undone = applyInverseV4(result.state, result.inverse, makeContext())
    const shots = projectedShots(undone)
    // 本次新增的 S04 没了；S01/S02/S03 三面都还在。
    expect(shots.map((node) => scriptRefOf(node)?.shotKey).sort()).toEqual([
      's1',
      's2',
      's3',
    ])
    expect(
      scriptRefOf(shots.find((node) => scriptRefOf(node)?.shotKey === 's2')),
    ).toMatchObject({ state: 'changed' })
    expect(
      scriptRefOf(shots.find((node) => scriptRefOf(node)?.shotKey === 's3')),
    ).toMatchObject({ state: 'dropped' })
  })
})
