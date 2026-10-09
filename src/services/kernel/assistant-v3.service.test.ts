import { beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'

import { ASSISTANT_OPERATOR_REJECT_REASON_IDS } from '@/constants/assistant-operator'
import { AssistantOperatorStepSchema } from '@/types/assistant-operator'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorCanvasSnapshot,
  AssistantOperatorEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const { plan, critique, legacy, closeRound, model } = vi.hoisted(() => ({
  plan: vi.fn(),
  critique: vi.fn(),
  legacy: vi.fn(),
  closeRound: vi.fn(async () => undefined),
  model: { current: null as unknown },
}))

vi.mock('@/services/kernel/assistant-operator.service', () => ({
  prepareOperatorTurn: vi.fn(
    async (_clerkId: string, request: AssistantOperatorRequest) => ({
      request,
      user: { id: 'user-1', displayName: null, username: null },
      persona: { language: 'ui' },
      rules: [],
      route: { adapterType: 'openai', providerConfig: {}, apiKey: 'k' },
      questionTurn: false,
      modelId: 'gpt-6-luna',
      videoData: [],
      audioData: [],
      run: {
        stepSeq: 0,
        signal: undefined,
        inspectedCanvasReferences: null,
        state: { referenceUrls: [] },
      },
      composeSystemPrompt: () => '',
    }),
  ),
  planTool: plan,
  planCritiqueResult: critique,
  runOperatorTurn: legacy,
  closeRound,
  closeRoundBeforeStop: closeRound,
  runWithOperatorTimeBudget: async function* (
    options: { signal?: AbortSignal },
    turn: (options: {
      signal: AbortSignal
      pastSoftBudget: () => boolean
    }) => AsyncIterable<AssistantOperatorEvent>,
  ) {
    yield* turn({
      signal: options.signal ?? new AbortController().signal,
      pastSoftBudget: () => false,
    })
  },
  toStepEvent: (raw: unknown) => ({
    type: 'step',
    step: AssistantOperatorStepSchema.parse(raw),
  }),
  normalizePlanQuestions: (turn: {
    questions: {
      header: string
      question: string
      multiSelect: boolean
      allowOther: boolean
      options: { label: string; description: string }[]
    }[]
  }) =>
    turn.questions.map((question, index) => ({
      id: `question-${index + 1}`,
      header: question.header,
      question: question.question,
      multiSelect: question.multiSelect,
      allowOther: question.allowOther,
      options: question.options.map((option, optionIndex) => ({
        id: `option-${optionIndex + 1}`,
        label: option.label,
        description: option.description,
      })),
    })),
  resolveResponseLanguage: () => 'chinese',
  operatorCacheKey: () => 'v3:test',
  recordLedgerStep: vi.fn(),
  rememberStepArtifacts: vi.fn(),
  isFatalOperatorToolError: () => false,
  latestUserMessage: () => '',
  TOOL_FAILED_DETAIL: 'tool failed',
  OPERATOR_OUT_OF_STEPS_MESSAGES: { chinese: '步数用完了' },
  OPERATOR_SAME_FAILURE_MESSAGES: {
    chinese: (step: string) => `「${step}」连着失败了两次`,
  },
}))

vi.mock('@/services/kernel/assistant-v3-prompt.service', () => ({
  buildAssistantV3SystemPrompt: () => 'SYSTEM',
}))

vi.mock('@/services/kernel/assistant-v3-model.service', () => ({
  resolveAssistantV3Model: () => ({
    model: model.current,
    strictTools: false,
    providerOptions: () => ({}),
  }),
}))

vi.mock('@/services/kernel/assistant-completion.service', () => ({
  startCallLog: () => ({ onUsage: vi.fn(), finish: vi.fn() }),
}))

import { prepareOperatorTurn } from '@/services/kernel/assistant-operator.service'

import { runAssistantV3 } from './assistant-v3.service'

const HARRY = 'image249e8bf4-8cc4-46eb-8125-3485e3a9053e'
const GOYLE = 'image9c0d1e2f-1111-4222-8333-444455556666'
const S04B = 'video4f610510-8120-436b-b3ac-ba4202af49b5'

function canvas(
  withGoyle: boolean,
  shot?: Partial<AssistantOperatorCanvasNode>,
): AssistantOperatorCanvasSnapshot {
  const nodes = [
    {
      id: HARRY,
      name: '哈利 · 黑袍',
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
      id: S04B,
      name: '冲出门',
      kind: 'video',
      subtype: 'shot',
      text: '中景：女德拉科转身冲出门。',
      inputs: withGoyle
        ? [{ slot: 'reference', from: GOYLE, edgeId: 'edge-goyle' }]
        : [],
      ...shot,
    },
  ] as AssistantOperatorCanvasNode[]
  return {
    currentShotNo: null,
    selectedNodeIds: [],
    shots: [{ expanded: true, shotNo: null, title: 'loose', nodes }],
  }
}

function request(
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    workspaceKey: 'canvas:project-1',
    domain: 'canvas',
    messages: [{ role: 'user', content: 'S04b 去掉高尔的参考' }],
    snapshot: { prompt: '', canvas: canvas(true), availableModels: [] },
    ...overrides,
  } as unknown as AssistantOperatorRequest
}

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}

function textTurn(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: undefined },
      usage,
    },
  ]
}

function toolTurn(
  ...calls: { id: string; name: string; input: unknown }[]
): LanguageModelV3StreamPart[] {
  return [
    ...calls.map(
      (call): LanguageModelV3StreamPart => ({
        type: 'tool-call',
        toolCallId: call.id,
        toolName: call.name,
        input: JSON.stringify(call.input),
      }),
    ),
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: undefined },
      usage,
    },
  ]
}

function script(...turns: LanguageModelV3StreamPart[][]) {
  const queue = [...turns]
  const mock = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: queue.shift() ?? textTurn('…'),
      }),
    }),
  })
  model.current = mock
  return mock
}

async function collect(
  events: AsyncIterable<AssistantOperatorEvent>,
): Promise<AssistantOperatorEvent[]> {
  const out: AssistantOperatorEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function promptText(call: LanguageModelV3CallOptions): string {
  return JSON.stringify(call.prompt)
}

const disconnectGoyle = {
  id: 'call_1',
  name: 'edit',
  input: {
    ops: [
      { op: 'disconnect', from: 'img-9c0d1e', to: 'vid-4f6105', slot: null },
    ],
  },
}

describe('v3 内核', () => {
  beforeEach(() => {
    plan.mockReset()
    critique.mockReset()
    legacy.mockReset()
    closeRound.mockClear()
  })

  it('只回话：流式正文 + 定稿 + done，不发本轮记录', async () => {
    script(textTurn('S04b 现在接了高尔一张参考。'))
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(events.map((event) => event.type)).toEqual([
      'message_delta',
      'message',
      'done',
    ])
    expect(events[1]).toMatchObject({ text: 'S04b 现在接了高尔一张参考。' })
  })

  it('断线：按从哪到哪换成真 edgeId，交给前端落，停在 canvas_sync 并带上本轮记录', async () => {
    script(toolTurn(disconnectGoyle))
    plan.mockImplementation(async (_run, tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: S04B },
      observation: 'queued',
      apply: () => {},
    }))
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'canvas_batch',
      { ops: [{ op: 'disconnect', edgeId: 'edge-goyle' }] },
      'user-1',
    )
    expect(events.map((event) => event.type)).toEqual([
      'step',
      'step',
      'transcript',
      'stopped',
    ])
    expect(events[1]).toMatchObject({
      step: {
        tool: 'canvas_batch',
        status: 'done',
        title: '断开 「高尔 · 黑袍」 → 「冲出门」',
      },
    })
    expect(events[3]).toMatchObject({ reason: 'canvas_sync' })
  })

  it('接力：补上「落了」的结果，前缀逐字不变（只追加）', async () => {
    const mock = script(toolTurn(disconnectGoyle), textTurn('好了。'))
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: S04B },
      observation: 'queued',
      apply: () => {},
    }))
    const first = await collect(runAssistantV3('clerk-1', request()))
    const transcript = (
      first.find((event) => event.type === 'transcript') as {
        transcript: AssistantV3Transcript
      }
    ).transcript

    const second = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: { prompt: '', canvas: canvas(false), availableModels: [] },
          priorSteps: [
            {
              tool: 'canvas_batch',
              status: 'done',
              summary: '断开',
              thisTurn: true,
            },
          ],
          v3: { transcript },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(second.map((event) => event.type)).toEqual([
      'message_delta',
      'message',
      'done',
    ])
    const [firstCall, secondCall] = mock.doStreamCalls
    expect(secondCall.prompt.slice(0, firstCall.prompt.length)).toEqual(
      firstCall.prompt.slice(0, firstCall.prompt.length),
    )
    expect(promptText(secondCall)).toContain('Landed.')
    expect(promptText(secondCall)).toContain('vid-4f6105')
  })

  it('句柄抄错：这一步记成草稿、错误回给模型，带最近的句柄', async () => {
    const mock = script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: { ops: [{ op: 'delete', card: 'img-9c0d1f' }] },
      }),
      textTurn('没找到那张卡。'),
    )
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(plan).not.toHaveBeenCalled()
    expect(events[0]).toMatchObject({
      type: 'step',
      step: { status: 'error', draft: true },
    })
    expect(promptText(mock.doStreamCalls[1])).toContain(
      'did you mean img-9c0d1e',
    )
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('生成：出确认卡后停在等你确认', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'generate',
        input: { cards: ['img-249e8b'] },
      }),
    )
    plan.mockResolvedValue({
      kind: 'confirmGenerate',
      request: {
        model: { id: 'gpt-image-2.5-flare', label: 'Flare' },
        count: 1,
        specs: { aspectRatio: '3:4', resolution: '1K', durationSeconds: null },
        canvasNode: { id: HARRY, name: '哈利 · 黑袍' },
      },
    })
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'canvas_generate',
      { target: HARRY },
      'user-1',
    )
    expect(events.map((event) => event.type)).toEqual(['confirm', 'stopped'])
    expect(events[1]).toMatchObject({ reason: 'awaiting_confirm' })
  })

  it('同一件事因同一个原因连错两次：停下来说清楚', async () => {
    const bad = {
      id: 'call_x',
      name: 'edit',
      input: { ops: [{ op: 'delete', card: 'img-000000' }] },
    }
    script(toolTurn(bad), toolTurn({ ...bad, id: 'call_y' }))
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(events.at(-2)).toMatchObject({
      type: 'message',
      text: '「edit」连着失败了两次',
    })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('同一条回复里改画布之后的读：不跑，等板子回来再说', async () => {
    const mock = script(
      toolTurn(disconnectGoyle, {
        id: 'call_2',
        name: 'read',
        input: { cards: ['vid-4f6105'] },
      }),
    )
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: S04B },
      observation: 'queued',
      apply: () => {},
    }))
    const events = await collect(runAssistantV3('clerk-1', request()))
    const transcript = (
      events.find((event) => event.type === 'transcript') as {
        transcript: AssistantV3Transcript
      }
    ).transcript
    expect(transcript.at(-1)).toMatchObject({
      type: 'result',
      id: 'call_2',
      error: true,
    })
    expect(mock.doStreamCalls).toHaveLength(1)
  })

  it('同一条回复里的 edit 与 write 合成一批：一个过程行、一次接力，两条结果都补上', async () => {
    const mock = script(
      toolTurn(disconnectGoyle, {
        id: 'call_2',
        name: 'write',
        input: {
          writes: [
            {
              card: 'vid-4f6105',
              field: 'prompt',
              mode: 'edit',
              text: null,
              edits: [{ find: '女德拉科', replace: '她' }],
            },
          ],
        },
      }),
      textTurn('好了。'),
    )
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: S04B },
      observation: 'queued',
      apply: () => {},
    }))
    const first = await collect(runAssistantV3('clerk-1', request()))
    expect(plan).toHaveBeenCalledTimes(1)
    expect(plan.mock.calls[0][2]).toEqual({
      ops: [
        { op: 'disconnect', edgeId: 'edge-goyle' },
        {
          op: 'set_prompt',
          target: S04B,
          prompt: '中景：她转身冲出门。',
          mode: 'replace',
        },
      ],
    })
    expect(
      first.filter(
        (event) => event.type === 'step' && event.step.status === 'done',
      ),
    ).toHaveLength(1)
    const transcript = (
      first.find((event) => event.type === 'transcript') as {
        transcript: AssistantV3Transcript
      }
    ).transcript
    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: { prompt: '', canvas: canvas(false), availableModels: [] },
          priorSteps: [
            {
              tool: 'canvas_batch',
              status: 'done',
              summary: '断开',
              thisTurn: true,
            },
          ],
          v3: { transcript },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const relayed = promptText(mock.doStreamCalls[1])
    expect(relayed.match(/Landed\./g)).toHaveLength(2)
  })

  it('模型空回复：重试一次；还空就如实说，不拿「步数用完了」顶替', async () => {
    const empty: LanguageModelV3StreamPart[] = [
      {
        type: 'finish',
        finishReason: { unified: 'other', raw: undefined },
        usage,
      },
    ]
    const mock = script(empty, textTurn('好了。'))
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(mock.doStreamCalls).toHaveLength(2)
    expect(events.at(-2)).toMatchObject({ type: 'message', text: '好了。' })

    script(empty, empty)
    const twice = await collect(runAssistantV3('clerk-1', request()))
    expect(twice.at(-2)).toMatchObject({
      type: 'message',
      text: '这一步模型没有给出任何回复，什么都没改。再说一次，或者换个说法。',
    })
    expect(twice.at(-1)).toMatchObject({ type: 'done' })
  })

  it('过程行：同一批新建的卡写卡名、剧本镜头卡写镜号', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            {
              op: 'add',
              ref: 'new1',
              type: 'image/character',
              name: '赫敏 · 黑袍',
              model: null,
              params: null,
              text: null,
              shot: null,
            },
            {
              op: 'connect',
              from: 'new1',
              to: 'vid-4f6105',
              slot: 'reference',
              role: null,
            },
          ],
        },
      }),
    )
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: S04B },
      observation: 'queued',
      apply: () => {},
    }))
    const events = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: {
            prompt: '',
            canvas: canvas(true, {
              fromScript: { nodeId: 'text-1', shotKey: 's4b', state: 'synced' },
            }),
            availableModels: [],
          },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(events[1]).toMatchObject({
      step: { title: '新建「赫敏 · 黑袍」；连接 「赫敏 · 黑袍」 → S04b' },
    })
  })

  it('一次列两张：合成一张确认卡（队列条），两张都在上面', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'generate',
        input: { cards: ['img-249e8b', 'img-9c0d1e'] },
      }),
    )
    plan.mockImplementation(async (_run, _tool, args: { target: string }) => ({
      kind: 'confirmGenerate',
      request: {
        model: { id: 'gpt-image-2.5-flare', label: 'Flare' },
        count: 1,
        specs: { aspectRatio: '3:4', resolution: '1K', durationSeconds: null },
        canvasNode: {
          id: args.target,
          name: args.target === HARRY ? '哈利 · 黑袍' : '高尔 · 黑袍',
        },
      },
    }))
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(plan).toHaveBeenCalledTimes(2)
    expect(events.map((event) => event.type)).toEqual(['confirm', 'stopped'])
    expect(events[0]).toMatchObject({
      confirm: {
        request: {
          canvasNode: { id: HARRY },
          canvasNodes: [
            { id: HARRY, name: '哈利 · 黑袍' },
            { id: GOYLE, name: '高尔 · 黑袍' },
          ],
        },
      },
    })
  })

  it('一条回复里调两次生成：第一张确认卡停住时，补一句另一张没放', async () => {
    script(
      toolTurn(
        { id: 'call_1', name: 'generate', input: { cards: ['img-249e8b'] } },
        { id: 'call_2', name: 'generate', input: { cards: ['img-9c0d1e'] } },
      ),
    )
    plan.mockResolvedValue({
      kind: 'confirmGenerate',
      request: {
        model: { id: 'gpt-image-2.5-flare', label: 'Flare' },
        count: 1,
        specs: { aspectRatio: '3:4', resolution: '1K', durationSeconds: null },
        canvasNode: { id: HARRY, name: '哈利 · 黑袍' },
      },
    })
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(plan).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.type)).toEqual([
      'confirm',
      'message',
      'stopped',
    ])
    expect(events[1]).toMatchObject({
      text: expect.stringContaining('「高尔 · 黑袍」 还没放'),
    })
  })

  it('镜头卡出片前核对：第一次把问题交回模型，再调才摆确认卡', async () => {
    const shotBoard = request({
      snapshot: {
        prompt: '',
        canvas: canvas(true, {
          text: '镜头1（0-5秒）：她喊：{女德拉科：W-whatever! You’ll regret this, Potter!}',
          parameters: {
            values: { duration: '5' },
            options: { generateAudio: [false, true] },
          },
        }),
        availableModels: [],
      },
    } as Partial<AssistantOperatorRequest>)
    const generateShot = (id: string) => ({
      id,
      name: 'generate',
      input: { cards: ['vid-4f6105'] },
    })
    const mock = script(
      toolTurn(generateShot('call_1')),
      toolTurn(generateShot('call_2')),
    )
    plan.mockResolvedValue({
      kind: 'confirmGenerate',
      request: {
        model: { id: 'seedance-2.5', label: 'Seedance' },
        count: 1,
        specs: { aspectRatio: null, resolution: '720p', durationSeconds: 5 },
        canvasNode: { id: S04B, name: '冲出门' },
      },
    })
    const events = await collect(runAssistantV3('clerk-1', shotBoard))
    expect(promptText(mock.doStreamCalls[1])).toContain(
      'it has a spoken line but sound is off',
    )
    expect(plan).toHaveBeenCalledTimes(1)
    expect(events.at(-2)).toMatchObject({ type: 'confirm' })
  })

  it('看图评成图：把那张卡接的参考图和它的提示词一起交给评审', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'look',
        input: { cards: ['vid-4f6105'], question: '对照参考哪里不对？' },
      }),
      textTurn('裙子画成了长裤。'),
    )
    critique.mockResolvedValue({
      kind: 'read',
      payload: { imageUrl: 'https://cdn.test/result.png', goal: null },
      run: async () => ({
        result: {
          findings: [{ severity: 'warn', text: '裙子画成了长裤' }],
          advice: null,
          borrowedVisionRoute: false,
        },
        observation: 'critique_result — looked',
      }),
    })
    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          mentionedAssets: [
            {
              id: 'gen-1',
              url: 'https://cdn.test/result.png',
              label: '冲出门',
            },
          ],
          snapshot: {
            prompt: '',
            canvas: canvas(true, {
              referenceUrls: ['https://cdn.test/goyle.png'],
              referencePromptContext: '图片1「高尔 · 黑袍」',
            }),
            availableModels: [],
          },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(critique).toHaveBeenCalledWith(
      expect.anything(),
      { goal: '对照参考哪里不对？', targetIds: ['gen-1'] },
      'user-1',
      {
        referenceUrls: ['https://cdn.test/goyle.png'],
        // 参考图抬头 + 提示词正文，两段都交给看图那一跳。
        prompt: '图片1「高尔 · 黑袍」\n\n中景：女德拉科转身冲出门。',
        scriptNotes: null,
      },
    )
  })

  it('重投影接力：报出新建的镜和提示词还跟着旧剧本的镜', async () => {
    const SCRIPT = 'textb1572be4-fea9-47b2-b03f-b7e642008921'
    const S05 = 'video9c33dd53-1bb3-4e1b-a1e3-3bdc814143e2'
    const S07A = 'video283fcee0-57af-4a15-81a7-db198f953388'
    const board = (withSplit: boolean, s05: 'synced' | 'changed') =>
      ({
        currentShotNo: null,
        selectedNodeIds: [],
        shots: [
          {
            expanded: true,
            shotNo: null,
            title: 'loose',
            nodes: [
              {
                id: SCRIPT,
                name: '剧本',
                kind: 'text',
                subtype: 'script',
                text: 'S05 · …',
              },
              {
                id: S05,
                name: '分院',
                kind: 'video',
                subtype: 'shot',
                text: '分院帽："GRYFFINDOR!"',
                fromScript: { nodeId: SCRIPT, shotKey: 's5', state: s05 },
              },
              ...(withSplit
                ? [
                    {
                      id: S07A,
                      name: '帽檐下',
                      kind: 'video',
                      subtype: 'shot',
                      text: '帽檐下',
                      fromScript: {
                        nodeId: SCRIPT,
                        shotKey: 's7a',
                        state: 'synced',
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      }) as unknown as AssistantOperatorCanvasSnapshot
    const mock = script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            { op: 'project_script', script: 'txt-b1572b', mode: 'reproject' },
          ],
        },
      }),
      textTurn('好了。'),
    )
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: SCRIPT },
      observation: 'queued',
      apply: () => {},
    }))
    const first = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: {
            prompt: '',
            canvas: board(false, 'synced'),
            availableModels: [],
          },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const transcript = (
      first.find((event) => event.type === 'transcript') as {
        transcript: AssistantV3Transcript
      }
    ).transcript
    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: {
            prompt: '',
            canvas: board(true, 'changed'),
            availableModels: [],
          },
          priorSteps: [
            {
              tool: 'canvas_batch',
              status: 'done',
              summary: '投影',
              thisTurn: true,
            },
          ],
          v3: { transcript },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const relayed = promptText(mock.doStreamCalls[1])
    expect(relayed).toContain('New shots: vid-283fce S07a')
    expect(relayed).toContain('Script line changed: vid-9c33dd S05')
  })

  it('被厂商的内容审核拦下：不重试，直说是审核', async () => {
    const mock = script([
      {
        type: 'finish',
        finishReason: { unified: 'content-filter', raw: 'PROHIBITED_CONTENT' },
        usage,
      },
    ])
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(mock.doStreamCalls).toHaveLength(1)
    expect(events.at(-2)).toMatchObject({
      type: 'message',
      text: expect.stringContaining('内容审核拦下了'),
    })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('接不了的厂商 / 没有画布：交回旧内核', async () => {
    legacy.mockImplementation(async function* () {
      yield { type: 'done' }
    })
    const events = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: { prompt: '', availableModels: [] },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(legacy).toHaveBeenCalled()
    expect(events).toEqual([{ type: 'done' }])
  })
})

/** S6：LoRA 台那张脸 —— 动的是表单，改动随步落、当场就有结果。 */
describe('v3 内核 · LoRA 台', () => {
  const TYPHOEUS = 'cmg1abcd0000typhoeus'
  const SAMPLE = 'https://cdn.test/sample.png'

  function loraRequest(
    message: string,
    overrides: Partial<AssistantOperatorRequest> = {},
  ): AssistantOperatorRequest {
    return {
      workspaceKey: 'lora',
      domain: 'lora',
      messages: [{ role: 'user', content: message }],
      snapshot: {
        prompt: 'typhoeus, 1girl',
        negativePrompt: 'lowres',
        model: { id: 'illustrious-runner', label: 'WAI-Illustrious-SDXL' },
        availableModels: [
          { id: 'illustrious-runner', label: 'WAI-Illustrious-SDXL' },
        ],
        loraParameters: { steps: 20, guidanceScale: 6 },
        loras: {
          items: [
            {
              id: TYPHOEUS,
              name: '提弗洛斯',
              weight: 1,
              enabled: true,
              family: 'Illustrious',
              compatible: true,
              triggerWord: 'typhoeus',
              triggerEnabled: true,
              recommendedPrompt: null,
              sourcePrompts: [],
            },
          ],
          baseFamily: 'Illustrious',
          minWeight: 0.1,
          maxWeight: 2,
        },
        viewingRecipe: {
          loraName: '提弗洛斯',
          position: 2,
          total: 5,
          recipe: {
            imageUrl: SAMPLE,
            source: 'model_version_image',
            prompt: 'snow, warming hands',
            sampler: 'Euler a',
            steps: 25,
            cfgScale: 7,
          },
        },
      },
      ...overrides,
    } as unknown as AssistantOperatorRequest
  }

  function preparedWith(prompt: string, modelId: string | undefined) {
    vi.mocked(prepareOperatorTurn).mockImplementationOnce(
      async (_clerkId, request) =>
        ({
          request,
          user: { id: 'user-1', displayName: null, username: null },
          persona: { language: 'ui' },
          rules: [],
          route: { adapterType: 'openai', providerConfig: {}, apiKey: 'k' },
          modelId,
          run: {
            stepSeq: 0,
            signal: undefined,
            inspectedCanvasReferences: null,
            state: { referenceUrls: [], prompt, negativePrompt: 'lowres' },
          },
        }) as never,
    )
  }

  /** 旧执行器回来的改动步（载荷照它真实的形状，步的 schema 按工具校验）。 */
  const mutated = (observation: string) =>
    plan.mockImplementation(
      async (_run, tool: string, args: Record<string, unknown>) => ({
        kind: 'mutate',
        payload:
          tool === 'set_lora_weight'
            ? { ...args, name: '提弗洛斯' }
            : tool === 'set_prompt'
              ? { value: args.value, mode: 'replace' }
              : args,
        inverse:
          tool === 'set_lora_weight'
            ? { loraId: args.loraId, weight: 1 }
            : tool === 'set_prompt'
              ? { value: 'typhoeus, 1girl', mode: 'replace' }
              : {},
        observation,
        apply: () => {},
      }),
    )

  beforeEach(() => {
    plan.mockReset()
    legacy.mockReset()
  })

  it('板子是一张表单，左边打开的示例图跟着板子给模型看', async () => {
    const mock = script(textTurn('看得到。'))
    await collect(runAssistantV3('clerk-1', loraRequest('能看到左边的示例吗')))
    const prompt = promptText(mock.doStreamCalls[0]!)
    expect(prompt).toContain('LORA WORKBENCH')
    expect(prompt).toContain(
      'example 2 / 5 of 提弗洛斯 (its picture is attached)',
    )
    expect(legacy).not.toHaveBeenCalled()
  })

  it('助手模型选「自动」（没有型号）也走 v3，⛔ 不退回旧内核', async () => {
    preparedWith('typhoeus, 1girl', undefined)
    script(textTurn('好。'))
    await collect(runAssistantV3('clerk-1', loraRequest('你好')))
    expect(legacy).not.toHaveBeenCalled()
  })

  it('调权重：句柄换成资产 id 交给旧执行器，当场就有结果、⛔ 不接力', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [{ op: 'set_weight', lora: 'lora-cmg1ab', weight: 0.7 }],
        },
      }),
      textTurn('压到 0.7 了。'),
    )
    mutated('weight is 0.7 now')
    const events = await collect(
      runAssistantV3('clerk-1', loraRequest('提弗洛斯的权重设成 0.7')),
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'set_lora_weight',
      { loraId: TYPHOEUS, weight: 0.7 },
      'user-1',
    )
    expect(events.map((event) => event.type)).not.toContain('transcript')
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('追加：拼好整段再写，⛔ 不让旧执行器把追加读成替换', async () => {
    preparedWith('typhoeus, 1girl', 'gpt-6-luna')
    script(
      toolTurn({
        id: 'call_1',
        name: 'write',
        input: {
          writes: [
            {
              field: 'prompt',
              mode: 'append',
              text: ', detailed eyes',
              edits: null,
            },
          ],
        },
      }),
      textTurn('补上了。'),
    )
    mutated('written')
    await collect(runAssistantV3('clerk-1', loraRequest('加上 detailed eyes')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'set_prompt',
      { value: 'typhoeus, 1girl, detailed eyes', overwrite: true },
      'user-1',
    )
  })

  /**
   * 2026-10-10：Gemini 3 每次工具调用带一个思考签名，回放时缺了 SDK 就塞占位签名，
   * 模型丢了上一步的思考 —— 存进本轮记录、下一步原样交回。
   */
  it('Gemini 的思考签名跟着本轮记录走，下一步原样交回', async () => {
    const mock = script(
      [
        {
          type: 'tool-call',
          toolCallId: 'call_1',
          toolName: 'read',
          input: JSON.stringify({ items: ['prompt'] }),
          providerMetadata: { google: { thoughtSignature: 'sig-1' } },
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
        },
      ],
      textTurn('读完了。'),
    )
    await collect(runAssistantV3('clerk-1', loraRequest('看看提示词')))
    const replayed = JSON.stringify(mock.doStreamCalls[1]!.prompt)
    expect(replayed).toContain('"thoughtSignature":"sig-1"')
  })

  it('停在搭配卡上：这条回复没写正文，就把卡上的 say 放在卡上方', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            {
              op: 'propose_setup',
              question: '画风收一点？',
              say: '画风压到 0.5，免得盖过角色。',
              mounts: [],
              unmounts: [],
              weights: [{ lora: 'lora-cmg1ab', weight: 0.8 }],
            },
          ],
        },
      }),
    )
    plan.mockResolvedValue({
      kind: 'confirmLoraSetup',
      setup: { question: 'q' },
    })
    const events = await collect(
      runAssistantV3('clerk-1', loraRequest('交给你调')),
    )
    const types = events.map((event) => event.type)
    expect(types.indexOf('message')).toBeLessThan(types.indexOf('confirm'))
    expect(events.find((event) => event.type === 'message')).toMatchObject({
      text: '画风压到 0.5，免得盖过角色。',
    })
  })

  it('参数：Civitai 的「Euler a」换成跑得了的采样器名', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            {
              op: 'set_params',
              steps: 25,
              cfg: 7,
              seed: null,
              width: null,
              height: null,
              sampler: 'Euler a',
              scheduler: null,
            },
          ],
        },
      }),
      textTurn('套上了。'),
    )
    mutated('parameters set')
    await collect(runAssistantV3('clerk-1', loraRequest('复刻这张图的参数')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'set_lora_parameters',
      { steps: 25, guidanceScale: 7, runnerSampler: 'euler_ancestral' },
      'user-1',
    )
  })
})

describe('v3 内核 · 图片台', () => {
  const run = {
    stepSeq: 0,
    signal: undefined,
    inspectedCanvasReferences: null,
    skipReferenceReview: false,
    state: { referenceUrls: ['https://cdn.test/ref-1.png'], prompt: '' },
  }

  function imageRequest(
    message: string,
    overrides: Partial<AssistantOperatorRequest> = {},
  ): AssistantOperatorRequest {
    return {
      workspaceKey: 'image-natural',
      domain: 'image',
      messages: [{ role: 'user', content: message }],
      snapshot: {
        prompt: 'a girl in a garden',
        negativePrompt: '',
        model: { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro' },
        availableModels: [
          { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro' },
          {
            id: 'gpt-image-2',
            label: 'GPT Image 2',
            channels: [
              { id: 'openai', label: 'OpenAI' },
              { id: 'fal', label: 'fal' },
            ],
          },
        ],
        specs: {
          quality: null,
          preview: null,
          background: null,
          aspectRatio: '1:1',
          resolution: '1K',
          aspectRatioOptions: ['1:1', '2:3', '16:9'],
          resolutionOptions: ['1K', '2K'],
        },
        count: { value: 1, options: [1, 2, 4] },
        references: {
          items: [{ url: 'https://cdn.test/ref-1.png', label: '艾弥丝' }],
          limit: 4,
        },
      },
      mentionedAssets: [
        { id: 'asset-heart', url: 'https://cdn.test/heart.png', label: '图1' },
      ],
      ...overrides,
    } as unknown as AssistantOperatorRequest
  }

  beforeEach(() => {
    plan.mockReset()
    legacy.mockReset()
    run.skipReferenceReview = false
    vi.mocked(prepareOperatorTurn).mockImplementation(
      async (_clerkId, request) =>
        ({
          request,
          user: { id: 'user-1', displayName: null, username: null },
          persona: { language: 'ui' },
          rules: [],
          route: { adapterType: 'openai', providerConfig: {}, apiKey: 'k' },
          modelId: 'gpt-6-luna',
          run,
        }) as never,
    )
    // 这几题只问交给旧执行器的参数：回「台上本来就是这样」，不画改动步。
    plan.mockResolvedValue({
      kind: 'rejected',
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
      detail: 'already so',
    })
  })

  it('板子是一张表单：每个旋钮带上能选的值，写提示词不走参考图简报那道闸', async () => {
    const mock = script(textTurn('看到了。'))
    await collect(runAssistantV3('clerk-1', imageRequest('台上都设了什么')))
    const prompt = promptText(mock.doStreamCalls[0]!)
    expect(prompt).toContain('IMAGE WORKBENCH')
    expect(prompt).toContain('aspect ratio 1:1 (options: 1:1, 2:3, 16:9)')
    expect(prompt).toContain(
      'GPT Image 2 [gpt-image-2] (channels: OpenAI [openai], fal [fal])',
    )
    expect(prompt).toContain('ref-1 \\"艾弥丝\\"')
    expect(run.skipReferenceReview).toBe(true)
    expect(legacy).not.toHaveBeenCalled()
  })

  it('标签台也走 v3：板子印出分角色与画面文字', async () => {
    const mock = script(textTurn('好。'))
    await collect(
      runAssistantV3(
        'clerk-1',
        imageRequest('你好', {
          workspaceKey: 'image-tags',
          snapshot: {
            ...imageRequest('').snapshot,
            novelAiCharacters: {
              mode: 'v4',
              max: 6,
              layout: {
                positioning: 'auto',
                characters: [
                  {
                    prompt: 'aemeath_(wuthering_waves)',
                    negativePrompt: '',
                    position: { x: 0.5, y: 0.5 },
                    dialogue: 'hi',
                  },
                ],
              },
            },
            novelAiSceneTexts: { items: [], maxChars: 40, latinOnly: true },
          },
        } as never),
      ),
    )
    const prompt = promptText(mock.doStreamCalls[0]!)
    expect(prompt).toContain(
      '- 1: \\"aemeath_(wuthering_waves)\\" · says \\"hi\\"',
    )
    expect(prompt).toContain('this model draws English letters only')
    expect(legacy).not.toHaveBeenCalled()
  })

  it('改画幅、张数、换模型：没说的清晰度沿用台上的值，渠道按名字认', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            {
              op: 'set_specs',
              aspectRatio: '2:3',
              resolution: null,
              quality: null,
              background: null,
            },
            { op: 'set_count', count: 4 },
            { op: 'set_model', model: 'GPT Image 2', channel: 'fal' },
          ],
        },
      }),
      textTurn('换好了。'),
    )
    await collect(runAssistantV3('clerk-1', imageRequest('全身立绘，出四张')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'set_specs',
      { aspectRatio: '2:3', resolution: '1K' },
      'user-1',
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'set_count',
      { count: 4 },
      'user-1',
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'set_model',
      { modelId: 'gpt-image-2', channelId: 'fal' },
      'user-1',
    )
  })

  it('挂参考图按附图的名字找资产；卸下 ref-1 交的是 @Image1 的 1', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            { op: 'unmount_reference', ref: 'ref-1' },
            { op: 'mount_reference', asset: '图1' },
          ],
        },
      }),
      textTurn('换上了。'),
    )
    await collect(runAssistantV3('clerk-1', imageRequest('用图1当参考')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'unmount_reference',
      { slotIndex: 1 },
      'user-1',
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'mount_reference',
      { assetId: 'asset-heart' },
      'user-1',
    )
  })

  it('联网只认创作者点名的来源：模型自己加的「只搜 danbooru」丢掉，快搜才走得到自带联网', async () => {
    const search = (onlySources: string[]) => ({
      id: 'call_1',
      name: 'search_web',
      input: { goal: '艾弥丝的英文名', entities: ['艾弥丝'], onlySources },
    })
    script(toolTurn(search(['danbooru'])), textTurn('查到了。'))
    await collect(runAssistantV3('clerk-1', imageRequest('艾弥丝英文名是什么')))
    expect(plan).toHaveBeenLastCalledWith(
      expect.anything(),
      'research',
      { goal: '艾弥丝的英文名', entities: ['艾弥丝'] },
      'user-1',
    )
    // 光提到站名不算：问的是标签，不是「只在 Danbooru 查」。
    script(toolTurn(search(['danbooru'])), textTurn('查到了。'))
    await collect(
      runAssistantV3('clerk-1', imageRequest('艾弥丝的 Danbooru 标签是什么')),
    )
    expect(plan).toHaveBeenLastCalledWith(
      expect.anything(),
      'research',
      { goal: '艾弥丝的英文名', entities: ['艾弥丝'] },
      'user-1',
    )
    script(toolTurn(search(['danbooru'])), textTurn('查到了。'))
    await collect(
      runAssistantV3('clerk-1', imageRequest('只在 danbooru 上查艾弥丝')),
    )
    expect(plan).toHaveBeenLastCalledWith(
      expect.anything(),
      'research',
      {
        goal: '艾弥丝的英文名',
        entities: ['艾弥丝'],
        onlySources: ['danbooru'],
      },
      'user-1',
    )
  })

  it('不在这台上的模型：拒掉并把原因交回模型', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [{ op: 'set_model', model: 'Midjourney', channel: null }],
        },
      }),
      textTurn('这台没有。'),
    )
    const events = await collect(
      runAssistantV3('clerk-1', imageRequest('换成 Midjourney')),
    )
    expect(plan).not.toHaveBeenCalled()
    expect(JSON.stringify(events)).toContain(
      'not one of the models on the board',
    )
  })
})

describe('v3 内核 · 角色页', () => {
  const RON = 'b27ce882-f139-42a7-8361-29a13c74643d'
  const run = {
    stepSeq: 0,
    signal: undefined,
    inspectedCanvasReferences: null,
    state: { referenceUrls: [], prompt: '' },
  }

  function cardsRequest(message: string): AssistantOperatorRequest {
    const open = {
      id: RON,
      name: '罗恩',
      work: null,
      imageCount: 3,
      hasProfile: false,
      look: '',
      identity: '',
      behavior: '',
      speech: '',
      backstory: '',
      characterTags: [],
      appearanceTags: [],
      loraTrigger: '',
      imagesOnCard: 1,
      cardImageUrls: ['https://cdn.test/ron.png'],
    }
    return {
      workspaceKey: 'cards',
      domain: 'cards',
      messages: [{ role: 'user', content: message }],
      snapshot: {
        prompt: '',
        availableModels: [],
        cards: {
          total: 2,
          characters: [
            {
              id: RON,
              name: '罗恩',
              work: null,
              imageCount: 3,
              hasProfile: false,
            },
            {
              id: 'ad992b94-baf2-45c7-8185-d0b02ace5b02',
              name: '赫敏',
              work: null,
              imageCount: 1,
              hasProfile: false,
            },
          ],
          open,
        },
      },
    } as unknown as AssistantOperatorRequest
  }

  beforeEach(() => {
    plan.mockReset()
    legacy.mockReset()
    vi.mocked(prepareOperatorTurn).mockImplementation(
      async (_clerkId, request) =>
        ({
          request,
          user: { id: 'user-1', displayName: null, username: null },
          persona: { language: 'ui' },
          rules: [],
          route: { adapterType: 'openai', providerConfig: {}, apiKey: 'k' },
          modelId: 'gpt-6-luna',
          run,
        }) as never,
    )
  })

  it('板子：角色名册用句柄，打开那位的设定与图一起给模型看', async () => {
    const mock = script(textTurn('他还没有设定。'))
    await collect(runAssistantV3('clerk-1', cardsRequest('他有设定吗')))
    const prompt = promptText(mock.doStreamCalls[0]!)
    expect(prompt).toContain('CHARACTER PAGE')
    expect(prompt).toMatch(/OPEN: char-b27ce8\S* 「罗恩」/)
    expect(prompt).toContain('attached below as card-1…card-1')
    expect(legacy).not.toHaveBeenCalled()
  })

  it('提议设定：句柄换成角色 id，卡上方先说 say，停在设定卡上', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            {
              op: 'propose_profile',
              character: 'char-b27ce8',
              say: '身份和说话方式查到了，经历还缺。',
              fields: [
                {
                  field: 'identity',
                  text: '韦斯莱家第六个孩子，哈利最好的朋友。',
                  source: 'Harry Potter Wiki',
                  sourceUrl:
                    'https://harrypotter.fandom.com/wiki/Ronald_Weasley',
                  added: null,
                },
              ],
            },
          ],
        },
      }),
    )
    plan.mockResolvedValue({
      kind: 'confirmCharacterProfile',
      profile: { characterId: RON, fields: [] },
    })
    const events = await collect(
      runAssistantV3('clerk-1', cardsRequest('查一下罗恩的设定交给我挑')),
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'propose_character_profile',
      {
        characterId: RON,
        fields: [
          {
            field: 'identity',
            text: '韦斯莱家第六个孩子，哈利最好的朋友。',
            source: 'Harry Potter Wiki',
            sourceUrl: 'https://harrypotter.fandom.com/wiki/Ronald_Weasley',
          },
        ],
      },
      'user-1',
    )
    const types = events.map((event) => event.type)
    expect(types.indexOf('message')).toBeLessThan(types.indexOf('confirm'))
    expect(events.find((event) => event.type === 'confirm')).toMatchObject({
      confirm: { kind: 'characterProfile' },
    })
  })

  it('交给图片助手：那句话里的句柄换回角色名', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            {
              op: 'hand_off',
              character: 'char-b27ce8',
              say: '库里没有背面图。',
              request:
                '基于罗恩（char-b27ce8）现有正面立绘画一张背面图，参考 char-ad992b 的画风',
            },
          ],
        },
      }),
    )
    plan.mockResolvedValue({
      kind: 'confirmImageHandoff',
      handoff: { characterId: RON, request: 'x' },
    })
    await collect(runAssistantV3('clerk-1', cardsRequest('缺一张背面图')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'hand_off_to_image_assistant',
      {
        characterId: RON,
        request: '基于罗恩现有正面立绘画一张背面图，参考 赫敏 的画风',
      },
      'user-1',
    )
  })

  it('read 一个网址就读那一页；look card 核对打开那位的图', async () => {
    script(
      toolTurn(
        {
          id: 'call_1',
          name: 'read',
          input: {
            items: ['https://harrypotter.fandom.com/wiki/Ronald_Weasley'],
          },
        },
        {
          id: 'call_2',
          name: 'look',
          input: { images: ['card'], question: '图和设定对得上吗' },
        },
      ),
      textTurn('读完了。'),
    )
    plan.mockResolvedValue({
      kind: 'rejected',
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
      detail: 'ok',
    })
    await collect(runAssistantV3('clerk-1', cardsRequest('读一下他的 wiki')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'read_url',
      { url: 'https://harrypotter.fandom.com/wiki/Ronald_Weasley' },
      'user-1',
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'check_character_look',
      { characterId: RON },
      'user-1',
    )
  })
})
