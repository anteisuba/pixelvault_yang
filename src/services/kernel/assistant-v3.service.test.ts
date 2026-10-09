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
