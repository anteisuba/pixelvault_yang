import { describe, expect, it } from 'vitest'

import {
  NODE_SLOT_IDS,
  NODE_SLOT_TEXT_ROLE_IDS,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import {
  connectIntoSlot,
  disconnectEdge,
  getSlotOccupancy,
  getSlotRoleOccupancy,
  listLiveConnectableSlots,
  markVersionBlocked,
  planSlotConnectRole,
  reconcileStateSlots,
  resolveCurrentSourceId,
  setSlotVersion,
  slotVersionId,
} from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

const NOW = '2026-09-07T00:00:00.000Z'

function imageNode(id: string, blocked = false): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'shot',
      name: id,
      status: 'idle',
      createdAt: NOW,
      url: `https://cdn.test/${id}.png`,
      ...(blocked ? { blocked: true, blockedReason: '首帧动作不自然' } : {}),
    },
  }
}

function shotNode(id: string, shotNo = 2): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      // `label` 必填，且**就是**稳定名（C1 契约修正 1）。
      label: id,
      name: id,
      status: 'idle',
      createdAt: NOW,
      shotNo,
    },
  }
}

function textNode(
  id: string,
  subtype: 'shotNote' | 'script' | 'rule' = 'shotNote',
  defaultRole?: NodeSlotTextRole,
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      subtype,
      name: id,
      status: 'idle',
      createdAt: NOW,
      body: '# S02\n控制室广角',
      ...(defaultRole ? { defaultRole } : {}),
    },
  }
}

function baseState(): NodeWorkflowStateV4 {
  return {
    version: 4,
    nodes: [
      imageNode('i_a'),
      imageNode('i_b'),
      shotNode('v_02'),
      textNode('t_02'),
    ],
    edges: [],
  }
}

describe('connectIntoSlot', () => {
  it('把内容送进具名槽并成为当前版', () => {
    const result = connectIntoSlot(baseState(), {
      source: 'i_a',
      target: 'v_02',
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e1',
      now: NOW,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.addedAsVersion).toBe(false)
    expect(result.versionCount).toBe(1)
    const target = result.state.nodes.find((node) => node.id === 'v_02')
    expect(target?.data.slots?.firstFrame?.cur).toBe(slotVersionId('e1'))
    expect(resolveCurrentSourceId(target!, NODE_SLOT_IDS.firstFrame)).toBe(
      'i_a',
    )
  })

  it('往已有内容的轮播槽再连一条 = 追加第 2 版并设为当前，旧边不删', () => {
    const first = connectIntoSlot(baseState(), {
      source: 'i_a',
      target: 'v_02',
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e1',
      now: NOW,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = connectIntoSlot(first.state, {
      source: 'i_b',
      target: 'v_02',
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e2',
      now: NOW,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.addedAsVersion).toBe(true)
    expect(second.versionCount).toBe(2)
    expect(second.state.edges).toHaveLength(2)
    const target = second.state.nodes.find((node) => node.id === 'v_02')
    expect(target?.data.slots?.firstFrame?.cur).toBe(slotVersionId('e2'))
  })

  it('拒绝 kind 不合法的槽', () => {
    const result = connectIntoSlot(baseState(), {
      source: 't_02',
      target: 'v_02',
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e1',
    })
    expect(result).toEqual({ ok: false, reason: 'kindNotAllowed' })
  })

  it('语义门：已判失败的图不能作首帧', () => {
    const state = baseState()
    state.nodes[0] = imageNode('i_a', true)
    const result = connectIntoSlot(state, {
      source: 'i_a',
      target: 'v_02',
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e1',
    })
    expect(result).toEqual({ ok: false, reason: 'blockedSource' })
  })

  it('同源同槽重复连线被拒', () => {
    const first = connectIntoSlot(baseState(), {
      source: 'i_a',
      target: 'v_02',
      slot: NODE_SLOT_IDS.reference,
      edgeId: 'e1',
      now: NOW,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const again = connectIntoSlot(first.state, {
      source: 'i_a',
      target: 'v_02',
      slot: NODE_SLOT_IDS.reference,
      edgeId: 'e2',
    })
    expect(again).toEqual({ ok: false, reason: 'duplicateEdge' })
  })
})

describe('reconcileStateSlots', () => {
  it('迁移产物只有边、没有 slots，也能重算出 binding，且幂等', () => {
    const state: NodeWorkflowStateV4 = {
      ...baseState(),
      edges: [
        {
          id: 'e1',
          source: 'i_a',
          sourceHandle: 'out',
          target: 'v_02',
          slot: NODE_SLOT_IDS.firstFrame,
        },
      ],
    }
    const once = reconcileStateSlots(state, { now: NOW })
    const twice = reconcileStateSlots(once, { now: '2099-01-01T00:00:00.000Z' })
    expect(
      once.nodes.find((n) => n.id === 'v_02')?.data.slots?.firstFrame,
    ).toEqual({
      slot: 'firstFrame',
      versions: [
        {
          id: slotVersionId('e1'),
          edgeId: 'e1',
          sourceNodeId: 'i_a',
          blocked: false,
          addedAt: NOW,
        },
      ],
      cur: slotVersionId('e1'),
    })
    expect(twice).toEqual(once)
  })
})

describe('disconnectEdge', () => {
  it('删掉当前版后 cur 回落到上一个未停用版', () => {
    let state = baseState()
    for (const [edgeId, source] of [
      ['e1', 'i_a'],
      ['e2', 'i_b'],
    ] as const) {
      const step = connectIntoSlot(state, {
        source,
        target: 'v_02',
        slot: NODE_SLOT_IDS.firstFrame,
        edgeId,
        now: NOW,
      })
      expect(step.ok).toBe(true)
      if (!step.ok) return
      state = step.state
    }
    const { state: after, removed } = disconnectEdge(state, 'e2', { now: NOW })
    expect(removed?.id).toBe('e2')
    const target = after.nodes.find((node) => node.id === 'v_02')
    expect(target?.data.slots?.firstFrame?.cur).toBe(slotVersionId('e1'))
  })

  it('删光之后槽绑定整个消失', () => {
    const first = connectIntoSlot(baseState(), {
      source: 'i_a',
      target: 'v_02',
      slot: NODE_SLOT_IDS.firstFrame,
      edgeId: 'e1',
      now: NOW,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const { state } = disconnectEdge(first.state, 'e1', { now: NOW })
    expect(
      state.nodes.find((node) => node.id === 'v_02')?.data.slots,
    ).toBeUndefined()
    expect(
      getSlotOccupancy('v_02', NODE_SLOT_IDS.firstFrame, state.edges),
    ).toBe(0)
  })
})

describe('版本轮播', () => {
  function twoVersions(): NodeWorkflowStateV4 {
    let state = baseState()
    for (const [edgeId, source] of [
      ['e1', 'i_a'],
      ['e2', 'i_b'],
    ] as const) {
      const step = connectIntoSlot(state, {
        source,
        target: 'v_02',
        slot: NODE_SLOT_IDS.firstFrame,
        edgeId,
        now: NOW,
      })
      if (!step.ok) throw new Error('setup failed')
      state = step.state
    }
    return state
  }

  it('设为当前可以回到旧版', () => {
    const result = setSlotVersion(
      twoVersions(),
      'v_02',
      NODE_SLOT_IDS.firstFrame,
      slotVersionId('e1'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.state.nodes.find((n) => n.id === 'v_02')?.data.slots?.firstFrame
        ?.cur,
    ).toBe(slotVersionId('e1'))
  })

  it('停用版本不能设为当前，并给理由', () => {
    const blocked = markVersionBlocked(
      twoVersions(),
      'v_02',
      NODE_SLOT_IDS.firstFrame,
      slotVersionId('e1'),
      true,
      '首帧动作不自然',
    )
    expect(blocked.ok).toBe(true)
    if (!blocked.ok) return
    const result = setSlotVersion(
      blocked.state,
      'v_02',
      NODE_SLOT_IDS.firstFrame,
      slotVersionId('e1'),
    )
    expect(result).toEqual({
      ok: false,
      reason: 'blockedVersion',
      blockedReason: '首帧动作不自然',
    })
  })

  it('停用当前版 → cur 回落到未停用版', () => {
    const blocked = markVersionBlocked(
      twoVersions(),
      'v_02',
      NODE_SLOT_IDS.firstFrame,
      slotVersionId('e2'),
      true,
      '构图不对',
    )
    expect(blocked.ok).toBe(true)
    if (!blocked.ok) return
    expect(
      blocked.state.nodes.find((n) => n.id === 'v_02')?.data.slots?.firstFrame
        ?.cur,
    ).toBe(slotVersionId('e1'))
  })
})

describe('listLiveConnectableSlots', () => {
  it('图片源在镜头上点亮首帧/尾帧/参考，不点亮语音与文本', () => {
    const state = baseState()
    const slots = listLiveConnectableSlots(
      state.nodes.find((n) => n.id === 'i_a')!,
      state.nodes.find((n) => n.id === 'v_02')!,
      state.edges,
    )
    expect(slots).toEqual(['firstFrame', 'lastFrame', 'reference'])
  })

  it('文本源只点亮 text 槽', () => {
    const state = baseState()
    const slots = listLiveConnectableSlots(
      state.nodes.find((n) => n.id === 't_02')!,
      state.nodes.find((n) => n.id === 'v_02')!,
      state.edges,
    )
    expect(slots).toEqual(['text'])
  })

  it('叶子源（image.reference）没有入口，一个槽都不点亮', () => {
    const state = baseState()
    const leafBase = imageNode('i_leaf')
    const leaf: NodeV4 = {
      ...leafBase,
      data: { ...leafBase.data, kind: 'image', subtype: 'reference' },
    }
    expect(
      listLiveConnectableSlots(state.nodes[0]!, leaf, state.edges),
    ).toEqual([])
  })
})

describe('文本槽按角色算容量（C1 契约修正 2）', () => {
  function textScene(): NodeWorkflowStateV4 {
    return {
      version: 4,
      nodes: [
        shotNode('v_02'),
        textNode('t_script', 'script'),
        textNode('t_script2', 'script'),
        textNode('t_rule', 'rule'),
      ],
      edges: [],
    }
  }

  it('第一条剧本落 script，binding 上记下角色', () => {
    const result = connectIntoSlot(textScene(), {
      source: 't_script',
      target: 'v_02',
      slot: NODE_SLOT_IDS.text,
      edgeId: 'e1',
      now: NOW,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const binding = result.state.nodes.find((n) => n.id === 'v_02')?.data.slots
      ?.text
    expect(binding?.versions[0]?.role).toBe(NODE_SLOT_TEXT_ROLE_IDS.script)
  })

  it('script 已满（0..1）时第二条剧本自动落 style，⛔ 不报满', () => {
    const first = connectIntoSlot(textScene(), {
      source: 't_script',
      target: 'v_02',
      slot: NODE_SLOT_IDS.text,
      edgeId: 'e1',
      now: NOW,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = connectIntoSlot(first.state, {
      source: 't_script2',
      target: 'v_02',
      slot: NODE_SLOT_IDS.text,
      edgeId: 'e2',
      now: NOW,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const versions =
      second.state.nodes.find((n) => n.id === 'v_02')?.data.slots?.text
        ?.versions ?? []
    expect(versions.map((version) => version.role)).toEqual([
      NODE_SLOT_TEXT_ROLE_IDS.script,
      NODE_SLOT_TEXT_ROLE_IDS.style,
    ])
  })

  it('显式给 role 就照给的算：script 满了再显式要 script → 报满', () => {
    const first = connectIntoSlot(textScene(), {
      source: 't_script',
      target: 'v_02',
      slot: NODE_SLOT_IDS.text,
      edgeId: 'e1',
      now: NOW,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(
      connectIntoSlot(first.state, {
        source: 't_script2',
        target: 'v_02',
        slot: NODE_SLOT_IDS.text,
        edgeId: 'e2',
        role: NODE_SLOT_TEXT_ROLE_IDS.script,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'slotFull' })
  })

  it('规则文本推成 style，与已有剧本并存，两个角色各算各的', () => {
    const first = connectIntoSlot(textScene(), {
      source: 't_script',
      target: 'v_02',
      slot: NODE_SLOT_IDS.text,
      edgeId: 'e1',
      now: NOW,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = connectIntoSlot(first.state, {
      source: 't_rule',
      target: 'v_02',
      slot: NODE_SLOT_IDS.text,
      edgeId: 'e2',
      now: NOW,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const target = second.state.nodes.find((n) => n.id === 'v_02')!
    expect(
      getSlotRoleOccupancy(
        target,
        NODE_SLOT_IDS.text,
        second.state.edges,
        second.state.nodes,
        NODE_SLOT_TEXT_ROLE_IDS.script,
      ),
    ).toBe(1)
    expect(
      getSlotRoleOccupancy(
        target,
        NODE_SLOT_IDS.text,
        second.state.edges,
        second.state.nodes,
        NODE_SLOT_TEXT_ROLE_IDS.style,
      ),
    ).toBe(1)
  })

  it('拖线点亮按角色算：script 满了 text 槽仍然点亮（会落 style）', () => {
    const first = connectIntoSlot(textScene(), {
      source: 't_script',
      target: 'v_02',
      slot: NODE_SLOT_IDS.text,
      edgeId: 'e1',
      now: NOW,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const state = first.state
    expect(
      listLiveConnectableSlots(
        state.nodes.find((n) => n.id === 't_script2')!,
        state.nodes.find((n) => n.id === 'v_02')!,
        state.edges,
        { nodes: state.nodes },
      ),
    ).toEqual([NODE_SLOT_IDS.text])
    expect(
      planSlotConnectRole(
        state.nodes.find((n) => n.id === 't_script2')!,
        state.nodes.find((n) => n.id === 'v_02')!,
        NODE_SLOT_IDS.text,
        state.edges,
        state.nodes,
      ).role,
    ).toBe(NODE_SLOT_TEXT_ROLE_IDS.style)
  })
})
