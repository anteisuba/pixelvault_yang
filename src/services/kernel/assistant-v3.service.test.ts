import { beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'

import { AssistantOperatorStepSchema } from '@/types/assistant-operator'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorCanvasSnapshot,
  AssistantOperatorEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const { plan, legacy, closeRound, model } = vi.hoisted(() => ({
  plan: vi.fn(),
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

import { runAssistantV3 } from './assistant-v3.service'

const HARRY = 'image249e8bf4-8cc4-46eb-8125-3485e3a9053e'
const GOYLE = 'image9c0d1e2f-1111-4222-8333-444455556666'
const S04B = 'video4f610510-8120-436b-b3ac-ba4202af49b5'

function canvas(withGoyle: boolean): AssistantOperatorCanvasSnapshot {
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
