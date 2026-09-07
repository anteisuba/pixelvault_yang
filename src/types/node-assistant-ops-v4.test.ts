import { describe, expect, it } from 'vitest'

import {
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_OP_V4_SPECS,
  NODE_ASSISTANT_OP_V4_TIER_IDS,
  NODE_ASSISTANT_OPS_V4,
  type NodeAssistantOpV4Id,
} from '@/constants/node-assistant-ops'
import { NodeAssistantOpV4Schema } from '@/types/node-assistant-ops'

describe('v4 op 表（spec §5）', () => {
  it('18 条 op 全部有一条 spec，且 spec 里没有词表外的 op', () => {
    expect(NODE_ASSISTANT_OPS_V4).toHaveLength(18)
    expect(Object.keys(NODE_ASSISTANT_OP_V4_SPECS).sort()).toEqual(
      [...NODE_ASSISTANT_OPS_V4].sort(),
    )
  })

  it('每条 op 都能被 schema 解析（词表与载荷不许分叉）', () => {
    const parsable = new Set(
      NodeAssistantOpV4Schema.options.map(
        (option) => option.shape.op.value as NodeAssistantOpV4Id,
      ),
    )
    for (const op of NODE_ASSISTANT_OPS_V4) {
      expect(parsable.has(op)).toBe(true)
    }
  })

  it('算不出 inverse 的一律不自动落（§5 纪律 2）', () => {
    for (const [op, spec] of Object.entries(NODE_ASSISTANT_OP_V4_SPECS)) {
      if (spec.inverse !== null) continue
      // 读类没有副作用，自动落无害；有副作用又无 inverse 的只有 generate。
      if (spec.group === 'read') continue
      expect(op).toBe(NODE_ASSISTANT_OP_V4_IDS.generate)
      expect(spec.autoApply).toBe(false)
    }
  })

  it('唯一花钱的是 generate，且是硬确认档', () => {
    const paid = Object.entries(NODE_ASSISTANT_OP_V4_SPECS).filter(
      ([, spec]) => spec.tier === NODE_ASSISTANT_OP_V4_TIER_IDS.hardConfirm,
    )
    expect(paid.map(([op]) => op)).toEqual([NODE_ASSISTANT_OP_V4_IDS.generate])
  })

  it('唯一需确认的结构 op 是 delete（owner 拍板「画-2」）', () => {
    const confirm = Object.entries(NODE_ASSISTANT_OP_V4_SPECS).filter(
      ([, spec]) => spec.tier === NODE_ASSISTANT_OP_V4_TIER_IDS.confirm,
    )
    expect(confirm.map(([op]) => op)).toEqual([NODE_ASSISTANT_OP_V4_IDS.delete])
    expect(
      NODE_ASSISTANT_OP_V4_SPECS[NODE_ASSISTANT_OP_V4_IDS.delete].autoApply,
    ).toBe(false)
  })

  it('inverse 指向的一定也是词表里的 op', () => {
    for (const spec of Object.values(NODE_ASSISTANT_OP_V4_SPECS)) {
      if (spec.inverse === null) continue
      expect(NODE_ASSISTANT_OPS_V4).toContain(spec.inverse)
    }
  })
})

describe('v4 op 载荷', () => {
  it('connect 的 slot 必填——没有槽的连线在 v4 里不存在', () => {
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'connect',
        source: 'a',
        target: 'b',
      }).success,
    ).toBe(false)
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'connect',
        source: 'a',
        target: 'b',
        slot: 'firstFrame',
      }).success,
    ).toBe(true)
  })

  it('槽名不在词表里就整条拒收', () => {
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'connect',
        source: 'a',
        target: 'b',
        slot: 'frame',
      }).success,
    ).toBe(false)
  })

  it('set_field 的 field 是封闭词表', () => {
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'set_field',
        target: 'a',
        field: 'url',
        value: 'https://example.com/x.png',
      }).success,
    ).toBe(false)
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'set_field',
        target: 'a',
        field: 'blocked',
        value: true,
      }).success,
    ).toBe(true)
  })

  it('set_prompt / set_text 剥掉 [[node:id]] 标记后再落节点', () => {
    const parsed = NodeAssistantOpV4Schema.parse({
      op: 'set_prompt',
      target: 'a',
      prompt: '沿用 [[node:i_1]] 的构图',
      mode: 'replace',
    })
    expect(parsed).toMatchObject({ prompt: '沿用 的构图' })
  })

  it('move_to_shot 的 shotNo 可为 null（移出镜头带）', () => {
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'move_to_shot',
        target: 'a',
        shotNo: null,
      }).success,
    ).toBe(true)
  })

  it('attach_asset / connect 的载荷里没有 URL 字段（§5 纪律 1）', () => {
    const parsed = NodeAssistantOpV4Schema.parse({
      op: 'attach_asset',
      target: 'v_02',
      slot: 'reference',
      sourceNodeId: 'i_1',
      url: 'https://example.com/x.png',
    })
    expect(parsed).not.toHaveProperty('url')
  })
})
