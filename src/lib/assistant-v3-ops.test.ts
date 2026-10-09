import { describe, expect, it } from 'vitest'

import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'
import {
  AssistantV3EditOpInputSchema,
  type AssistantV3ParamsInput,
} from '@/types/assistant-v3'
import { buildAssistantV3Handles } from './assistant-v3-board'
import {
  translateAssistantV3Edit,
  translateAssistantV3Write,
} from './assistant-v3-ops'

const HARRY = 'image249e8bf4-8cc4-46eb-8125-3485e3a9053e'
const RON = 'image7bc23597-15e6-4026-9e34-0e2613ee3479'
const GOYLE = 'image9c0d1e2f-1111-4222-8333-444455556666'
const S01 = 'video16f1cb3f-4164-4eb7-8d49-a429fa5fff0f'
const SCRIPT = 'textb1572be4-fea9-47b2-b03f-b7e642008921'

const nodes: AssistantOperatorCanvasNode[] = [
  {
    id: HARRY,
    name: '哈利 · 黑袍',
    kind: 'image',
    subtype: 'character',
    text: '',
  },
  {
    id: RON,
    name: '罗恩 · 黑袍',
    kind: 'image',
    subtype: 'character',
    text: '',
  },
  {
    id: GOYLE,
    name: '高尔 · 黑袍',
    kind: 'image',
    subtype: 'character',
    text: '',
  },
  {
    id: S01,
    name: '全景推到中景',
    kind: 'video',
    subtype: 'shot',
    text: '全局设定：暖琥珀车厢灯与冷蓝灰雨窗。镜头1（0-5秒）：全景。',
    inputs: [
      { slot: 'reference', from: RON, edgeId: 'edge-ron' },
      { slot: 'reference', from: GOYLE, edgeId: 'edge-goyle' },
    ],
  },
  {
    id: SCRIPT,
    name: '剧本',
    kind: 'text',
    subtype: 'script',
    text: 'S01 · 全景 · 5s',
  },
] as AssistantOperatorCanvasNode[]

const context = {
  nodes,
  handles: buildAssistantV3Handles(nodes.map((node) => node.id)),
}
const h = (id: string) => context.handles.handleOf(id)
const noParams: AssistantV3ParamsInput = {
  aspectRatio: null,
  resolution: null,
  quality: null,
  duration: null,
  count: null,
  generateAudio: null,
  storyboardGrid: null,
}

describe('v3 edit → v4 op', () => {
  it('建卡一批落完：模型、参数、提示词都能指着同批的临时名（T03 / T18）', () => {
    const result = translateAssistantV3Edit(
      [
        {
          op: 'add',
          ref: 'new1',
          type: 'image/character',
          name: '赫敏 · 黑袍',
          model: 'gpt-image-2.5-flare',
          params: { ...noParams, aspectRatio: '3:4', resolution: '1K' },
          text: '一年级纯黑校袍全身',
          shot: null,
        },
        {
          op: 'connect',
          from: h(HARRY),
          to: 'new1',
          slot: 'reference',
          role: null,
        },
      ],
      context,
    )
    expect(result).toEqual({
      ok: true,
      ops: [
        {
          op: 'add_node',
          kind: 'image',
          subtype: 'character',
          ref: 'new1',
          name: '赫敏 · 黑袍',
        },
        { op: 'set_model', target: 'new1', modelId: 'gpt-image-2.5-flare' },
        {
          op: 'set_params',
          target: 'new1',
          params: { aspectRatio: '3:4', resolution: '1K' },
        },
        {
          op: 'set_prompt',
          target: 'new1',
          prompt: '一年级纯黑校袍全身',
          mode: 'replace',
        },
        { op: 'connect', source: HARRY, target: 'new1', slot: 'reference' },
      ],
    })
  })

  it('卡片类型只收板子上那种写法：image/image 在 schema 就被拦下', () => {
    const base = {
      op: 'add',
      ref: 'new1',
      name: '测试',
      model: null,
      params: null,
      text: null,
      shot: null,
    }
    expect(
      AssistantV3EditOpInputSchema.safeParse({ ...base, type: 'image/image' })
        .success,
    ).toBe(false)
    expect(
      AssistantV3EditOpInputSchema.safeParse({ ...base, type: 'image/result' })
        .success,
    ).toBe(true)
  })

  it('建卡不出坐标 —— 卡由画布放到空位（T18 叠卡）', () => {
    const result = translateAssistantV3Edit(
      [
        {
          op: 'add',
          ref: 'new1',
          type: 'image/character',
          name: '纳威',
          model: null,
          params: null,
          text: null,
          shot: null,
        },
      ],
      context,
    )
    expect(result.ok && result.ops[0]).not.toHaveProperty('position')
  })

  it('断线按「从哪张到哪张」找线，换成真 edgeId（I56）', () => {
    const result = translateAssistantV3Edit(
      [
        { op: 'disconnect', from: h(GOYLE), to: h(S01), slot: null },
        {
          op: 'connect',
          from: h(HARRY),
          to: h(S01),
          slot: 'reference',
          role: null,
        },
      ],
      context,
    )
    expect(result).toEqual({
      ok: true,
      ops: [
        { op: 'disconnect', edgeId: 'edge-goyle' },
        { op: 'connect', source: HARRY, target: S01, slot: 'reference' },
      ],
    })
  })

  it('断线把方向说反了：两张卡之间那条线照断（T25）', () => {
    const result = translateAssistantV3Edit(
      [{ op: 'disconnect', from: h(S01), to: h(GOYLE), slot: null }],
      context,
    )
    expect(result.ok && result.ops).toEqual([
      { op: 'disconnect', edgeId: 'edge-goyle' },
    ])
  })

  it('没有那条线：说清这张卡上现有哪些线，整批不落', () => {
    const result = translateAssistantV3Edit(
      [{ op: 'disconnect', from: h(HARRY), to: h(S01), slot: null }],
      context,
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain(
      `lines into ${h(S01)}: reference ← ${h(RON)}, reference ← ${h(GOYLE)}`,
    )
  })

  it('句柄抄错一位：给最近的句柄', () => {
    const wrong = `${h(HARRY).slice(0, -1)}0`
    const result = translateAssistantV3Edit(
      [{ op: 'delete', card: wrong }],
      context,
    )
    expect(!result.ok && result.error).toContain(`did you mean ${h(HARRY)}`)
  })

  it('镜头卡改名写 label，别的卡写 name', () => {
    const result = translateAssistantV3Edit(
      [
        { op: 'set', card: h(S01), name: '开场', model: null, params: null },
        { op: 'set', card: h(HARRY), name: '哈利', model: null, params: null },
      ],
      context,
    )
    expect(result.ok && result.ops).toEqual([
      { op: 'set_field', target: S01, field: 'label', value: '开场' },
      { op: 'set_field', target: HARRY, field: 'name', value: '哈利' },
    ])
  })

  it('挪镜号与投影剧本的参数由 schema 带齐（T09 / T22）', () => {
    const result = translateAssistantV3Edit(
      [
        { op: 'reorder_shot', from: 6, to: 9 },
        { op: 'project_script', script: h(SCRIPT), mode: 'reproject' },
      ],
      context,
    )
    expect(result.ok && result.ops).toEqual([
      { op: 'reorder_shot', from: 6, to: 9 },
      { op: 'project_script', scriptNodeId: SCRIPT, mode: 'reproject' },
    ])
  })
})

describe('v3 write → set_prompt / set_text', () => {
  it('找句换句只动那几个字，其余逐字不变（T07 / T08）', () => {
    const result = translateAssistantV3Write(
      {
        writes: [
          {
            card: h(S01),
            field: 'prompt',
            mode: 'edit',
            text: null,
            edits: [{ find: '冷蓝灰雨窗', replace: '冷蓝雨窗' }],
          },
        ],
      },
      context,
    )
    expect(result.ok && result.ops).toEqual([
      {
        op: 'set_prompt',
        target: S01,
        prompt: '全局设定：暖琥珀车厢灯与冷蓝雨窗。镜头1（0-5秒）：全景。',
        mode: 'replace',
      },
    ])
  })

  it('几处 find 都对着读到的原文找，一起换（T22：后一条落在前一条换掉的那段里）', () => {
    const result = translateAssistantV3Write(
      {
        writes: [
          {
            card: h(S01),
            field: 'prompt',
            mode: 'edit',
            text: null,
            edits: [
              { find: '全局设定', replace: '镜头1（0-5秒）' },
              { find: '镜头1（0-5秒）：全景', replace: '镜头1（0-6秒）：全景' },
            ],
          },
        ],
      },
      context,
    )
    expect(result.ok && result.ops).toEqual([
      {
        op: 'set_prompt',
        target: S01,
        prompt:
          '镜头1（0-5秒）：暖琥珀车厢灯与冷蓝灰雨窗。镜头1（0-6秒）：全景。',
        mode: 'replace',
      },
    ])
    const overlap = translateAssistantV3Write(
      {
        writes: [
          {
            card: h(S01),
            field: 'prompt',
            mode: 'edit',
            text: null,
            edits: [
              { find: '冷蓝灰雨窗', replace: 'x' },
              { find: '灰雨窗。镜头1', replace: 'y' },
            ],
          },
        ],
      },
      context,
    )
    expect(!overlap.ok && overlap.error).toContain('overlap')
  })

  it('要找的句子出现多次或没出现：不写，说清楚', () => {
    const missing = translateAssistantV3Write(
      {
        writes: [
          {
            card: h(S01),
            field: 'prompt',
            mode: 'edit',
            text: null,
            edits: [{ find: '不存在的句子', replace: 'x' }],
          },
        ],
      },
      context,
    )
    expect(!missing.ok && missing.error).toContain('occurs 0 times')
    const twice = translateAssistantV3Write(
      {
        writes: [
          {
            card: h(S01),
            field: 'prompt',
            mode: 'edit',
            text: null,
            edits: [{ find: '：', replace: 'x' }],
          },
        ],
      },
      context,
    )
    expect(!twice.ok && twice.error).toContain('occurs 2 times')
  })

  it('一次写几张卡，一批落', () => {
    const result = translateAssistantV3Write(
      {
        writes: [
          {
            card: h(HARRY),
            field: 'prompt',
            mode: 'replace',
            text: '哈利',
            edits: null,
          },
          {
            card: h(SCRIPT),
            field: 'text',
            mode: 'append',
            text: 'S02 · 门开',
            edits: null,
          },
        ],
      },
      context,
    )
    expect(result.ok && result.ops).toEqual([
      { op: 'set_prompt', target: HARRY, prompt: '哈利', mode: 'replace' },
      { op: 'set_text', target: SCRIPT, body: 'S02 · 门开', mode: 'append' },
    ])
  })

  it('字段与卡对不上：说清该写哪一格', () => {
    const result = translateAssistantV3Write(
      {
        writes: [
          {
            card: h(SCRIPT),
            field: 'prompt',
            mode: 'replace',
            text: 'x',
            edits: null,
          },
        ],
      },
      context,
    )
    expect(!result.ok && result.error).toContain('field "text"')
  })
})
