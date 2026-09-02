import { describe, expect, it } from 'vitest'

import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import {
  describeOperatorStepDetail,
  fromStoredOperatorMessages,
  historyToOperatorMessages,
  historyToPriorSteps,
  toOperatorHistory,
  toStoredOperatorMessages,
} from '@/lib/studio-operator-history'
import { AssistantConversationMessageSchema } from '@/types/assistant-conversation'
import type { AssistantOperatorStep } from '@/types/assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'
import type { StudioOperatorHistoryEntry } from '@/types/studio-operator-history'

/**
 * 会话历史落库的**判据闸**（P4-B）。
 *
 * 这一层钉的每一条都对应一个「编译器看不见、闸门三绿、用户下一次点击就中招」的
 * 失败：
 *  ① 存进去的东西里带着 `inverse` —— 刷新之后那颗撤销钮点下去，撤的是几天前
 *    那张表单上的值（画布原话：「过期提案再点应用只会做错事」）；
 *  ② 存进去的东西里带着 base64 —— schema 注释明令不许，而它是静默变大的；
 *  ③ `running` 那一帧落库 —— 历史里留下一条永远转着圈的日志；
 *  ④ 撤销痕迹丢了 —— 助手下一轮把用户撤掉的改动又做一遍（拍板 18 的反面）；
 *  ⑤ 存下来的消息过不了服务端那道 `sanitizeMessages` —— 整段历史静默消失。
 */

function step(overrides: Record<string, unknown>): AssistantOperatorStep {
  return overrides as unknown as AssistantOperatorStep
}

const SET_PROMPT_STEP = step({
  id: 'step-1',
  tool: 'set_prompt',
  title: '写进提示词',
  reason: '你说要冷调',
  status: 'done',
  payload: { value: 'a cold blue street', mode: 'replace' },
  // ⭐ 撤销的本钱 —— 它**绝不能**出现在落库的那一份里。
  inverse: { value: '用户原来手写的那一段' },
})

const CRITIQUE_STEP = step({
  id: 'step-2',
  tool: 'critique_result',
  title: '看了这张',
  status: 'done',
  payload: {
    imageUrl: 'https://cdn.example.com/result.png',
    thumbnailUrl: 'https://cdn.example.com/result-thumb.png',
    modelLabel: 'Seedream 4',
    goal: null,
  },
  result: {
    findings: [
      { ok: true, text: '冷调到位' },
      { ok: false, text: '伞的边缘糊了' },
    ],
    advice: '下一轮把伞往前推一点',
    borrowedVisionRoute: false,
  },
})

function threadEntries(): StudioOperatorThreadEntry[] {
  return [
    {
      kind: 'user',
      id: 'user-1',
      text: '帮我把这张调冷一点',
      attachments: [
        {
          id: 'asset-1',
          url: 'https://cdn.example.com/ref.png',
          label: '雨夜街景',
          kind: 'image',
          thumbnailUrl: 'https://cdn.example.com/ref-thumb.png',
        },
        // ⛔ 本地预览：进不了库（下次加载必然是死链）。
        {
          id: 'local-1',
          url: 'blob:http://localhost:3000/abcd',
          label: '刚拖进来的',
          kind: 'image',
        },
      ],
    },
    { kind: 'plan', id: 'plan-1', steps: ['读状态', '改提示词'] },
    { kind: 'message', id: 'msg-1', text: '好，我来调。' },
    {
      kind: 'step',
      id: 'run-1:step-1',
      step: SET_PROMPT_STEP,
      runKey: 'run-1',
      undone: true,
    },
    {
      kind: 'step',
      id: 'run-1:step-9',
      step: step({
        id: 'step-9',
        tool: 'set_count',
        title: '正在改张数',
        status: 'running',
        payload: { count: 2 },
        inverse: { count: 1 },
      }),
      runKey: 'run-1',
      undone: false,
    },
    {
      kind: 'step',
      id: 'run-1:step-2',
      step: CRITIQUE_STEP,
      runKey: 'run-1',
      undone: false,
    },
    { kind: 'system', id: 'sys-1', code: 'undoStep', subject: '写进提示词' },
    { kind: 'domainMark', id: 'domain-1', domain: 'video' },
  ]
}

describe('线程 → 可读历史', () => {
  it('⛔ 一个字节的可操作载荷都不带：inverse / payload / primed 全不在', () => {
    const serialized = JSON.stringify(
      toStoredOperatorMessages(toOperatorHistory(threadEntries())),
    )

    expect(serialized).not.toContain('inverse')
    expect(serialized).not.toContain('payload')
    expect(serialized).not.toContain('primed')
    expect(serialized).not.toContain('runKey')
    // 撤销的本钱（改之前那段原文）也不能顺着 inverse 漏出去。
    expect(serialized).not.toContain('用户原来手写的那一段')
  })

  it('⛔ 零 base64 / 零 blob —— 取不到的地址整条不进历史', () => {
    const history = toOperatorHistory([
      {
        kind: 'user',
        id: 'user-1',
        text: '看这张',
        attachments: [
          {
            id: 'a',
            url: 'data:image/png;base64,iVBORw0KGgo=',
            label: '粘进来的',
            kind: 'image',
          },
          {
            id: 'b',
            url: 'blob:http://localhost:3000/x',
            label: '本地的',
            kind: 'image',
          },
          {
            id: 'c',
            url: 'https://cdn.example.com/ok.png',
            label: '库里的',
            kind: 'image',
          },
        ],
      },
    ])

    const entry = history[0]
    expect(entry?.kind).toBe('user')
    expect(entry?.kind === 'user' ? entry.attachments : []).toEqual([
      {
        id: 'c',
        label: '库里的',
        kind: 'image',
        url: 'https://cdn.example.com/ok.png',
      },
    ])
    expect(JSON.stringify(history)).not.toContain('base64')
  })

  it('`running` 那一帧不落库 —— 历史里没有永远转圈的日志', () => {
    const history = toOperatorHistory(threadEntries())
    expect(history.some((entry) => entry.id === 'run-1:step-9')).toBe(false)
  })

  it('撤销痕迹留着（划线是历史事实），但没有可撤的本钱', () => {
    const history = toOperatorHistory(threadEntries())
    const undoneStep = history.find((entry) => entry.id === 'run-1:step-1')
    expect(undoneStep).toMatchObject({
      kind: 'step',
      tool: 'set_prompt',
      title: '写进提示词',
      reason: '你说要冷调',
      status: 'done',
      undone: true,
    })
    expect(Object.keys(undoneStep ?? {})).not.toContain('firstInverse')
  })

  it('评价卡只留文字与图 URL —— ⛔ 没有 runKey，也就画不出「还原这轮」', () => {
    const history = toOperatorHistory(threadEntries())
    const critique = history.find((entry) => entry.id === 'run-1:step-2')
    expect(critique).toMatchObject({
      kind: 'step',
      critique: {
        imageUrl: 'https://cdn.example.com/result.png',
        thumbnailUrl: 'https://cdn.example.com/result-thumb.png',
        modelLabel: 'Seedream 4',
        findings: [
          { ok: true, text: '冷调到位' },
          { ok: false, text: '伞的边缘糊了' },
        ],
        advice: '下一轮把伞往前推一点',
      },
    })
  })

  it('域标记进历史 —— 跨域线程在单值 surface 之外唯一的痕迹', () => {
    const history = toOperatorHistory(threadEntries())
    expect(history).toContainEqual({
      kind: 'domainMark',
      id: 'domain-1',
      domain: 'video',
    })
  })

  it('空正文的气泡不进历史', () => {
    expect(
      toOperatorHistory([
        { kind: 'message', id: 'msg-1', text: '   ' },
        { kind: 'user', id: 'user-1', text: '', attachments: [] },
      ]),
    ).toEqual([])
  })
})

describe('历史 ↔ 库里的 messages', () => {
  it('存下来的每一条都过得了服务端那道 schema', () => {
    const stored = toStoredOperatorMessages(toOperatorHistory(threadEntries()))
    for (const message of stored) {
      const parsed = AssistantConversationMessageSchema.safeParse(message)
      expect(parsed.success, JSON.stringify(message)).toBe(true)
    }
  })

  it('存了再读回来，一条不差', () => {
    const history = toOperatorHistory(threadEntries())
    expect(
      fromStoredOperatorMessages(toStoredOperatorMessages(history)),
    ).toEqual(history)
  })

  it('用户那条存成 user，其余存成 assistant', () => {
    const stored = toStoredOperatorMessages(toOperatorHistory(threadEntries()))
    expect(stored[0]).toMatchObject({ role: 'user' })
    expect(
      stored.slice(1).every((message) => message.role === 'assistant'),
    ).toBe(true)
  })

  it('⚠ 旧助手写的纯对白整条跳过 —— 不混进操作员线程', () => {
    expect(
      fromStoredOperatorMessages([
        { role: 'user', content: '旧助手的一句话' },
        {
          role: 'assistant',
          content: '写进提示词',
          operator: {
            kind: 'step',
            id: 's-1',
            tool: 'set_prompt',
            title: '写进提示词',
            status: 'done',
            undone: false,
          },
        },
      ]),
    ).toEqual([
      {
        kind: 'step',
        id: 's-1',
        tool: 'set_prompt',
        title: '写进提示词',
        status: 'done',
        undone: false,
      },
    ])
  })

  it('读不出来的载荷整条跳过，⛔ 不把半截东西渲染出去', () => {
    expect(
      fromStoredOperatorMessages([
        {
          role: 'assistant',
          content: '坏的',
          operator: { kind: 'step', id: 's-1' } as never,
        },
      ]),
    ).toEqual([])
  })
})

describe('历史 → 下一轮的语境', () => {
  const history: StudioOperatorHistoryEntry[] = [
    { kind: 'user', id: 'u1', text: '第一句', attachments: [] },
    { kind: 'message', id: 'm1', text: '好' },
    {
      kind: 'step',
      id: 's1',
      tool: 'set_prompt',
      title: '写进提示词',
      status: 'done',
      undone: true,
    },
    {
      kind: 'step',
      id: 's2',
      tool: 'set_model',
      title: '换成 Seedream 4',
      status: 'done',
      undone: false,
    },
    {
      kind: 'step',
      id: 's3',
      tool: 'retired_tool_from_last_year',
      title: '老工具',
      status: 'done',
      undone: false,
    },
  ]

  it('只有对白进 messages，日志 / 计划 / 系统行不进', () => {
    expect(historyToOperatorMessages(history)).toEqual([
      { role: 'user', content: '第一句' },
      { role: 'assistant', content: '好' },
    ])
  })

  it('对白只回放最后几条 —— 显示是全部，进上下文的是账单', () => {
    const many: StudioOperatorHistoryEntry[] = Array.from(
      { length: STUDIO_OPERATOR_HISTORY.replayMessages + 5 },
      (_, index) => ({
        kind: 'user' as const,
        id: `u${index}`,
        text: `第 ${index} 句`,
        attachments: [],
      }),
    )
    const messages = historyToOperatorMessages(many)
    expect(messages).toHaveLength(STUDIO_OPERATOR_HISTORY.replayMessages)
    expect(messages.at(-1)?.content).toBe(
      `第 ${STUDIO_OPERATOR_HISTORY.replayMessages + 4} 句`,
    )
  })

  it('被撤销的步照样带上去且标 error —— 否则助手下一轮又做一遍', () => {
    const steps = historyToPriorSteps(history)
    expect(steps).toEqual([
      {
        tool: 'set_prompt',
        status: 'error',
        summary: 'The creator UNDID this — do not redo it. (写进提示词)',
      },
      { tool: 'set_model', status: 'done', summary: '换成 Seedream 4' },
    ])
  })

  it('已经不在词表里的工具整条丢掉 —— 一条装饰性的历史不值一次 400', () => {
    expect(
      historyToPriorSteps(history).some((prior) =>
        prior.tool.startsWith('retired'),
      ),
    ).toBe(false)
  })
})

/**
 * 画布域的日志进历史（C0 / C1-pre）。
 *
 * 历史条目的 `tool` 是自由字符串、`detail` 是一行字，所以画布十条**照常落库**
 * —— 与工作台各条同一条约束：一个字节的 `payload` / `inverse` 都不带（撤的是
 * 画布宿主自己的 inverse，刷新之后它不存在）。
 */
const STAGE_NODES_STEP = step({
  id: 'step-3',
  tool: 'stage_nodes',
  title: '搭了两个节点',
  reason: '先把主角与镜头立起来',
  status: 'done',
  payload: {
    items: [
      { alias: 'new:1', type: 'characterImage', title: '主角' },
      { alias: 'new:2', type: 'shot' },
    ],
  },
  inverse: { nodeIds: ['new:1', 'new:2'] },
})

describe('画布域的日志进历史（C1-pre）', () => {
  it('照常落库：标题 / 工具名 / 理由 / 一行详情，⛔ 没有 payload / inverse', () => {
    const history = toOperatorHistory([
      {
        kind: 'step',
        id: 'run-2:step-3',
        step: STAGE_NODES_STEP,
        runKey: 'run-2',
        undone: false,
      },
    ])
    expect(history).toEqual([
      {
        kind: 'step',
        id: 'run-2:step-3',
        tool: 'stage_nodes',
        title: '搭了两个节点',
        reason: '先把主角与镜头立起来',
        undone: false,
        status: 'done',
        detail: '2 · characterImage "主角", shot',
      },
    ])
    const serialized = JSON.stringify(toStoredOperatorMessages(history))
    expect(serialized).not.toContain('inverse')
    expect(serialized).not.toContain('payload')
    expect(serialized).not.toContain('new:1')
    // 存了再读回来，一条不差；下一轮的 priorSteps 也带上它（工具在词表里）。
    expect(
      fromStoredOperatorMessages(toStoredOperatorMessages(history)),
    ).toEqual(history)
    expect(historyToPriorSteps(history)).toEqual([
      { tool: 'stage_nodes', status: 'done', summary: '搭了两个节点' },
    ])
  })

  it('详情印用户认得出的东西（节点 id / 类型 / 字段名），⛔ 不印落地 URL', () => {
    expect(
      describeOperatorStepDetail(
        step({
          id: 's',
          tool: 'read_graph',
          title: 'x',
          status: 'done',
          payload: {},
          result: { digest: '3 nodes · 2 edges' },
        }),
      ),
    ).toBe('3 nodes · 2 edges')
    expect(
      describeOperatorStepDetail(
        step({
          id: 's',
          tool: 'connect_nodes',
          title: 'x',
          status: 'done',
          payload: { items: [{ source: 'new:1', target: 'n9' }] },
          inverse: { items: [{ source: 'new:1', target: 'n9' }] },
        }),
      ),
    ).toBe('1 · new:1 → n9')
    expect(
      describeOperatorStepDetail(
        step({
          id: 's',
          tool: 'set_node_fields',
          title: 'x',
          status: 'done',
          payload: {
            items: [
              {
                nodeId: 'n1',
                fields: { prompt: '很长的一段', title: '主角' },
                mode: 'replace',
              },
            ],
          },
          inverse: {
            items: [{ nodeId: 'n1', fields: { prompt: null, title: null } }],
          },
        }),
      ),
    ).toBe('n1: prompt, title')
    expect(
      describeOperatorStepDetail(
        step({
          id: 's',
          tool: 'set_node_model',
          title: 'x',
          status: 'done',
          payload: {
            nodeId: 'n1',
            modelId: 'seedream-4',
            optionId: 'ws:seedream-4',
            modelLabel: 'Seedream 4',
          },
          inverse: { nodeId: 'n1', model: null },
        }),
      ),
    ).toBe('n1 · Seedream 4')
    const attach = describeOperatorStepDetail(
      step({
        id: 's',
        tool: 'attach_refs',
        title: 'x',
        status: 'done',
        payload: {
          nodeId: 'n1',
          refs: [
            {
              id: 'r1',
              url: 'https://cdn.example.com/secret-key.png',
              role: 'identity',
              source: 'canvas',
              sourceId: 'n2',
            },
          ],
        },
        inverse: { nodeId: 'n1', refIds: ['r1'] },
      }),
    )
    expect(attach).toBe('n1 · 1 · n2')
    expect(attach).not.toContain('https://')
    expect(
      describeOperatorStepDetail(
        step({
          id: 's',
          tool: 'set_review_state',
          title: 'x',
          status: 'done',
          payload: { nodeId: 'n1', state: 'rejected', reason: '手指糊了' },
          inverse: { nodeId: 'n1', state: null },
        }),
      ),
    ).toBe('n1 · rejected · 手指糊了')
    expect(
      describeOperatorStepDetail(
        step({
          id: 's',
          tool: 'prime_node_generate',
          title: 'x',
          status: 'done',
          payload: { nodeId: 'n1', primed: true },
          inverse: { nodeId: 'n1', primed: false },
        }),
      ),
    ).toBe('n1')
    expect(
      describeOperatorStepDetail(
        step({
          id: 's',
          tool: 'update_script_doc',
          title: 'x',
          status: 'done',
          payload: {
            doc: {
              title: '雨夜',
              logline: '',
              roles: [{ id: 'r' }],
              shots: [{ id: 'a' }, { id: 'b' }],
            },
          },
          inverse: { doc: null },
        }),
      ),
    ).toBe('雨夜 · 1 role(s) · 2 shot(s)')
  })
})

/**
 * ⭐ 反问在历史里剩下**一条 message**，⛔ 不是一种新的历史条目（C3）。
 * 论据与本模块头注同源（可读 ≠ 可操作）：历史里那张卡上的按钮点下去会发消息、
 * 续跑一轮，而那一轮的语境早就不在了。留下的是真的发生过的那句话。
 */
describe('反问进历史（C3）', () => {
  it('问题 + 选项 + 用户选的那一项 → 一条 message，⛔ 没有 askId、没有可点的东西', () => {
    const history = toOperatorHistory([
      {
        kind: 'ask',
        id: 'ask-1',
        askId: 'ask-1',
        question: '这一镜要几秒？',
        options: [
          { label: '5 秒', consequence: '一个动作，节奏紧' },
          { label: '10 秒' },
        ],
        answer: '10 秒',
      },
    ])
    expect(history).toEqual([
      {
        kind: 'message',
        id: 'ask-1',
        text: '这一镜要几秒？\n· 5 秒 — 一个动作，节奏紧\n· 10 秒\n→ 10 秒',
      },
    ])
    expect(JSON.stringify(history)).not.toContain('askId')
  })

  it('还没回答的反问照样进历史（问过就是问过），⛔ 空问题整条丢掉', () => {
    expect(
      toOperatorHistory([
        {
          kind: 'ask',
          id: 'ask-2',
          askId: 'ask-2',
          question: '横的还是竖的？',
          options: [],
        },
      ]),
    ).toEqual([{ kind: 'message', id: 'ask-2', text: '横的还是竖的？' }])

    expect(
      toOperatorHistory([
        {
          kind: 'ask',
          id: 'ask-3',
          askId: 'ask-3',
          question: '   ',
          options: [],
        },
      ]),
    ).toEqual([])
  })
})
