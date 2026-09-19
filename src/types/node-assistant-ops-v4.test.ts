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
  it('op 表全部有一条 spec，且 spec 里没有词表外的 op', () => {
    // C3c-②Q 新增 `set_voice_profile`（嵌套载荷，不并进 `set_field`，理由见
    // `NODE_ASSISTANT_OP_V4_IDS` 上的注释）。
    // 第三期加一条只读的 `plan_rerun_downstream`（只列名单，不改图不花钱）。
    // S3b 再加三条：`set_output_version` / `split_output_version` 是**产出**版本
    // 那一排小点（⚠ 与入口槽的 `set_slot_version` 是两件事），`set_subtype` 是
    // 「设为角色卡」（⚠ 不并进 `set_field`：换子型会换一套槽位与工具条）。
    // +5 = 剪辑台五条（S8）：整表替换 + 四条单段手势。
    // +3 = 字幕三条（S8d）：T 轨上的段是另一种形状，⛔ 不并进上面那五条。
    // +1 = `project_script`（进度表 24）：剧本卡按分镜投影成一排镜头节点。
    expect(NODE_ASSISTANT_OPS_V4).toHaveLength(32)
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

  /**
   * ⚠ 需确认档只有两条，判据同源：**一句话能删掉一整镜 / 长出一整排节点**。
   * ⛔ 往这张名单里加第三条之前先读 `NODE_ASSISTANT_OP_V4_IDS` 上那两段注释 ——
   * 确认档每多一条，自动落那一档就少一条，而那是助手好不好用的主轴。
   */
  it('需确认档只有 delete 与 project_script，且都不自动落', () => {
    const confirm = Object.entries(NODE_ASSISTANT_OP_V4_SPECS).filter(
      ([, spec]) => spec.tier === NODE_ASSISTANT_OP_V4_TIER_IDS.confirm,
    )
    expect(confirm.map(([op]) => op).sort()).toEqual(
      [
        NODE_ASSISTANT_OP_V4_IDS.delete,
        NODE_ASSISTANT_OP_V4_IDS.projectScript,
      ].sort(),
    )
    for (const [, spec] of confirm) expect(spec.autoApply).toBe(false)
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

  it('project_script 的 mode 缺省 create，词表外的档整条拒收', () => {
    expect(
      NodeAssistantOpV4Schema.parse({
        op: 'project_script',
        scriptNodeId: 'sc_1',
      }),
    ).toMatchObject({ mode: 'create' })
    expect(
      NodeAssistantOpV4Schema.parse({
        op: 'project_script',
        scriptNodeId: 'sc_1',
        mode: 'reproject',
      }),
    ).toMatchObject({ mode: 'reproject' })
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'project_script',
        scriptNodeId: 'sc_1',
        mode: 'replace',
      }).success,
    ).toBe(false)
    // ⛔ 载荷里没有分镜列表：拆镜由执行器按剧本正文现算。
    expect(
      NodeAssistantOpV4Schema.parse({
        op: 'project_script',
        scriptNodeId: 'sc_1',
        shots: [{ key: 's1', text: '编的' }],
      }),
    ).not.toHaveProperty('shots')
    expect(
      NodeAssistantOpV4Schema.safeParse({ op: 'project_script' }).success,
    ).toBe(false)
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

  it('connect 带文本角色；缺席合法（缺省 script）', () => {
    expect(
      NodeAssistantOpV4Schema.parse({
        op: 'connect',
        source: 't_1',
        target: 'v_02',
        slot: 'text',
        role: 'style',
      }),
    ).toMatchObject({ role: 'style' })
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'connect',
        source: 't_1',
        target: 'v_02',
        slot: 'text',
      }).success,
    ).toBe(true)
    // 词表外的角色整条拒收。
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'connect',
        source: 't_1',
        target: 'v_02',
        slot: 'text',
        role: 'narration',
      }).success,
    ).toBe(false)
  })

  it('角色卡 id 能经 set_field / attach_asset 写进去', () => {
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'set_field',
        target: 'i_char',
        field: 'contextCardId',
        value: 'card_7f3',
      }).success,
    ).toBe(true)
    expect(
      NodeAssistantOpV4Schema.parse({
        op: 'attach_asset',
        target: 'i_char',
        slot: 'reference',
        sourceNodeId: 'i_1',
        contextCardId: 'card_7f3',
      }),
    ).toMatchObject({ contextCardId: 'card_7f3' })
  })

  it('镜头标签是改名对象：set_field 收 label', () => {
    expect(
      NodeAssistantOpV4Schema.safeParse({
        op: 'set_field',
        target: 'v_02',
        field: 'label',
        value: '有人还在',
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
