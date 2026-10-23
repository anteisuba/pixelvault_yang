import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError, simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'

import { AssistantOperatorStepSchema } from '@/types/assistant-operator'
import type {
  AssistantOperatorEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const { plan, closeRound, legacy, recordTurn, soft, models, run, recipe } =
  vi.hoisted(() => ({
    plan: vi.fn(),
    recipe: vi.fn(),
    closeRound: vi.fn(async () => undefined),
    legacy: vi.fn(),
    recordTurn: vi.fn(),
    /** 第一步之后再问几次「过软线没有」才算过（`Infinity` = 不过）。 */
    soft: { afterStep: Number.POSITIVE_INFINITY, seen: 0 },
    /** 新接法与它的保守接法（`fallback`）各一个假模型。 */
    models: { main: null as unknown, fallback: null as unknown },
    run: {
      stepSeq: 0,
      ledgerSteps: 0,
      signal: undefined as AbortSignal | undefined,
      skipReferenceReview: false,
      mainModelLooks: false,
      nextKernel: false,
      loraIndex: new Map<string, { candidateId: string; name: string }>(),
      apiKeyId: 'key-1',
      state: {
        prompt: 'a girl in a garden',
        negativePrompt: '',
        loras: [],
        referenceUrls: [],
      },
    },
  }))

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/features/assistant/workspace.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/assistant/workspace.service')
  >()),
  readPictureRecipe: recipe,
}))
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(async () => {
    throw new Error('no pictures in this test')
  }),
  detectTrustedImageMime: vi.fn(),
  uploadToR2: vi.fn(),
}))
vi.mock('@/services/kernel/assistant-completion.service', () => ({
  startCallLog: () => ({ onUsage: vi.fn(), finish: vi.fn() }),
}))
vi.mock('@/services/assistant-turn-record.service', () => ({
  recordAssistantTurn: recordTurn,
}))
vi.mock('@/services/kernel/assistant-operator.service', () => ({
  prepareOperatorTurn: vi.fn(
    async (_clerkId: string, request: AssistantOperatorRequest) => ({
      request,
      user: { id: 'user-1', displayName: null, username: null },
      persona: {
        language: 'ui',
        reasoningEffort: 'medium',
        routeModel: 'auto',
      },
      rules: [],
      assistantMemories: [],
      route: { adapterType: 'anthropic', providerConfig: {}, apiKey: 'k' },
      modelId: 'claude-sonnet-5-5',
      run,
    }),
  ),
  planTool: plan,
  runOperatorTurn: legacy,
  closeRoundV3: closeRound,
  closeRoundV3BeforeStop: closeRound,
  runWithOperatorTimeBudget: async function* (
    options: { signal?: AbortSignal },
    turn: (options: {
      signal: AbortSignal
      pastSoftBudget: () => boolean
    }) => AsyncIterable<AssistantOperatorEvent>,
  ) {
    soft.seen = 0
    yield* turn({
      signal: options.signal ?? new AbortController().signal,
      pastSoftBudget: () => {
        soft.seen += 1
        return soft.seen > soft.afterStep
      },
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
      ...question,
      options: question.options.map((option, optionIndex) => ({
        id: `option-${optionIndex + 1}`,
        label: option.label,
        description: option.description,
      })),
    })),
  resolveResponseLanguage: () => 'chinese',
  operatorCacheKey: () => 'next:test',
  recordLedgerStep: vi.fn(() => {
    run.ledgerSteps += 1
  }),
  rememberStepArtifacts: vi.fn(),
  isFatalOperatorToolError: () => false,
  TOOL_FAILED_DETAIL: 'tool failed',
  buildAssistantMemorySection: () => '',
  buildCharacterSection: () => '',
  buildCreatorSection: () => '',
  buildModelDialectSection: () => '',
  buildPersonaStyleSection: () => '',
  RESPONSE_LANGUAGE_LABELS: { chinese: 'Chinese' },
}))
vi.mock('@/features/assistant/models', () => ({
  resolveNextModel: () => {
    const shape = {
      nativeTools: {},
      strictTools: false,
      maxOutputTokens: undefined,
      providerOptions: () => ({}),
      system: (text: { stable: string; creator: string }) =>
        `${text.stable}${text.creator}`,
      messages: (messages: unknown[]) => messages,
    }
    return {
      ...shape,
      model: models.main,
      path: 'test+search',
      fallback: {
        ...shape,
        model: models.fallback,
        path: 'test',
        fallback: null,
      },
    }
  },
}))

import { prepareOperatorTurn } from '@/services/kernel/assistant-operator.service'

import { runAssistantNext } from './kernel'

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}

const finish = (unified: 'stop' | 'tool-calls'): LanguageModelV3StreamPart => ({
  type: 'finish',
  finishReason: { unified, raw: undefined },
  usage,
})

function textTurn(text: string): LanguageModelV3StreamPart[] {
  return [
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    finish('stop'),
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
    finish('tool-calls'),
  ]
}

function mockModel(turns: (LanguageModelV3StreamPart[] | Error)[]) {
  const queue = [...turns]
  return new MockLanguageModelV3({
    doStream: async () => {
      const next = queue.shift() ?? textTurn('…')
      if (next instanceof Error) throw next
      return { stream: simulateReadableStream({ chunks: next }) }
    },
  })
}

async function collect(
  events: AsyncIterable<AssistantOperatorEvent>,
): Promise<AssistantOperatorEvent[]> {
  const out: AssistantOperatorEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

const promptOf = (call: LanguageModelV3CallOptions) =>
  JSON.stringify(call.prompt)

function imageRequest(
  message: string,
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    workspaceKey: 'image-natural',
    domain: 'image',
    kernel: 'next',
    messages: [{ role: 'user', content: message }],
    snapshot: {
      prompt: 'a girl in a garden',
      negativePrompt: '',
      model: { id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro' },
      availableModels: [{ id: 'seedream-5.0-pro', label: 'Seedream 5.0 Pro' }],
      count: { value: 1, options: [1, 2, 4] },
    },
    ...overrides,
  } as unknown as AssistantOperatorRequest
}

const editPrompt = {
  id: 'call_1',
  name: 'edit',
  // Claude 式：只写用到的那几格。
  input: {
    changes: [
      { op: 'prompt', mode: 'edit', edits: [{ find: 'girl', replace: 'boy' }] },
    ],
  },
}

beforeEach(() => {
  plan.mockReset()
  closeRound.mockClear()
  legacy.mockReset()
  recordTurn.mockReset()
  soft.afterStep = Number.POSITIVE_INFINITY
  run.stepSeq = 0
  run.ledgerSteps = 0
  run.state.prompt = 'a girl in a garden'
  run.nextKernel = false
  run.loraIndex.clear()
  recipe.mockReset()
  plan.mockImplementation(
    async (_run, tool: string, args: { value?: string }) => ({
      kind: 'mutate',
      payload: { value: args.value, mode: 'replace' },
      inverse: { value: 'a girl in a garden', mode: 'replace' },
      observation: `landed ${tool.length}`,
      apply: () => {
        if (args.value !== undefined) run.state.prompt = args.value
      },
    }),
  )
})

describe('新内核主循环', () => {
  it('改提示词：落一步，结果接回给模型，模型说完收尾；不设步数闸', async () => {
    const main = mockModel([toolTurn(editPrompt), textTurn('改好了。')])
    models.main = main
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('把女孩换成男孩')),
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'set_prompt',
      {
        value: 'a boy in a garden',
        overwrite: true,
        // 找句换句的那几处一起下发：浏览器在台上此刻的文字上照换（只改那一处）。
        edits: [{ find: 'girl', replace: 'boy' }],
      },
      'user-1',
    )
    expect(events.map((event) => event.type)).toEqual([
      'step',
      'step',
      'message_delta',
      'message',
      'done',
    ])
    expect(main.doStreamCalls).toHaveLength(2)
    // 第二次调用：前一步的整段回复原样在前，工具结果接在后面。
    const second = main.doStreamCalls[1]!.prompt
    expect(second.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
    ])
    expect(promptOf(main.doStreamCalls[1]!)).toContain('1. prompt — landed')
    expect(recordTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'done',
        promptVersion: expect.stringMatching(/^next-/),
      }),
    )
  })

  it('出图：只出确认卡、停下等创作者（钱闸不变）', async () => {
    models.main = mockModel([
      toolTurn({ id: 'g1', name: 'generate', input: { say: '出一张看看' } }),
    ])
    plan.mockResolvedValue({
      kind: 'confirmGenerate',
      request: { count: 1 },
    })
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('出一张')),
    )
    expect(events.find((event) => event.type === 'confirm')).toBeTruthy()
    expect(events.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'awaiting_confirm',
    })
  })

  it('同一步里改动没落下：后面的出图不出卡，让模型先改好', async () => {
    const main = mockModel([
      toolTurn(
        {
          id: 'e1',
          name: 'edit',
          input: { changes: [{ op: 'prompt', mode: 'replace', text: null }] },
        },
        { id: 'g1', name: 'generate', input: { say: '出一张' } },
      ),
      textTurn('提示词没改成，先停一下。'),
    ])
    models.main = main
    plan.mockResolvedValue({ kind: 'confirmGenerate', request: { count: 1 } })
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('换衣服再出一张')),
    )
    expect(events.find((event) => event.type === 'confirm')).toBeUndefined()
    expect(promptOf(main.doStreamCalls[1]!)).toContain('Fix that edit first')
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('读不懂的入参回一句哪一格不对，模型改了再来（⛔ 不判死）', async () => {
    const main = mockModel([
      toolTurn({
        id: 'bad',
        name: 'edit',
        input: { changes: [{ op: 'paint' }] },
      }),
      toolTurn(editPrompt),
      textTurn('好了。'),
    ])
    models.main = main
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('改一下')),
    )
    expect(promptOf(main.doStreamCalls[1]!)).toContain('changes.0.op')
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('入参不是合法 JSON：只回一条结果（两条同 id 厂商会拒收），模型重发', async () => {
    const main = mockModel([
      [
        {
          type: 'tool-call',
          toolCallId: 'broken',
          toolName: 'edit',
          input: '{"changes":[{"op":"prompt","text":"a "cat',
        },
        finish('tool-calls'),
      ],
      toolTurn(editPrompt),
      textTurn('好了。'),
    ])
    models.main = main
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('改一下')),
    )
    const second = main.doStreamCalls[1]!.prompt
    const results = second.flatMap((message) =>
      message.role === 'tool'
        ? message.content.filter(
            (part) =>
              part.type === 'tool-result' && part.toolCallId === 'broken',
          )
        : [],
    )
    expect(results).toHaveLength(1)
    expect(JSON.stringify(results)).toContain('not a valid JSON object')
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('过了软线：存好这一轮、交接力条；下一次请求从原处接着跑', async () => {
    soft.afterStep = 0
    const first = mockModel([toolTurn(editPrompt)])
    models.main = first
    const hop1 = await collect(
      runAssistantNext('clerk-1', imageRequest('把女孩换成男孩')),
    )
    const relay = hop1.find((event) => event.type === 'transcript') as
      | { transcript: AssistantV3Transcript }
      | undefined
    expect(hop1.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'time_budget',
    })
    expect(relay?.transcript).toHaveLength(1)
    expect(relay?.transcript[0]).toMatchObject({
      type: 'board',
      turn: { hop: 1 },
    })

    soft.afterStep = Number.POSITIVE_INFINITY
    const second = mockModel([textTurn('接着说完。')])
    models.main = second
    const hop2 = await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('把女孩换成男孩', {
          v3: { transcript: relay!.transcript },
        } as never),
      ),
    )
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
    // 接着跑的那一次：上一跳的完整回复与工具结果都在。
    expect(
      second.doStreamCalls[0]!.prompt.map((message) => message.role),
    ).toEqual(['system', 'user', 'assistant', 'tool'])
    expect(recordTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ hop: 2 }),
    )
  })

  it.each([
    ['同一型号接着跑：思考块原样交回', 'claude-sonnet-5-5', true],
    ['接力时换了型号：旧型号的思考块先拿掉', 'gpt-5.5', false],
  ])('%s', async (_name, nextModelId, keepsReasoning) => {
    soft.afterStep = 0
    models.main = mockModel([
      [
        { type: 'reasoning-start', id: 'r' },
        { type: 'reasoning-delta', id: 'r', delta: '先改提示词' },
        { type: 'reasoning-end', id: 'r' },
        ...toolTurn(editPrompt),
      ],
    ])
    const hop1 = await collect(
      runAssistantNext('clerk-1', imageRequest('把女孩换成男孩')),
    )
    const relay = hop1.find((event) => event.type === 'transcript') as {
      transcript: AssistantV3Transcript
    }

    soft.afterStep = Number.POSITIVE_INFINITY
    const prepare = vi.mocked(prepareOperatorTurn)
    const original = prepare.getMockImplementation()!
    prepare.mockImplementationOnce(async (...args) => ({
      ...(await original(...args)),
      modelId: nextModelId,
    }))
    const second = mockModel([textTurn('接着说完。')])
    models.main = second
    await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('把女孩换成男孩', {
          v3: { transcript: relay.transcript },
        } as never),
      ),
    )
    const sent = JSON.stringify(second.doStreamCalls[0]!.prompt)
    expect(sent.includes('先改提示词')).toBe(keepsReasoning)
    // 改动记录（我们的工具调用与结果）两种情况都留着。
    expect(sent).toContain('"tool-result"')
  })

  it('新接法被厂商拒了（400）：整轮换成保守接法再试', async () => {
    models.main = mockModel([
      new APICallError({
        message: 'unknown tool type',
        url: 'https://api.test',
        requestBodyValues: {},
        statusCode: 400,
      }),
    ])
    const fallback = mockModel([textTurn('好。')])
    models.fallback = fallback
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('你好')),
    )
    expect(fallback.doStreamCalls).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('厂商自己跑的联网：时间线上一行「联网查」，结果留给模型自己读', async () => {
    const main = mockModel([
      [
        {
          type: 'tool-call',
          toolCallId: 'srv_1',
          toolName: 'web_search',
          input: JSON.stringify({ query: '长离 官方设定' }),
          providerExecuted: true,
        },
        {
          type: 'tool-result',
          toolCallId: 'srv_1',
          toolName: 'web_search',
          result: [{ url: 'https://wiki.test/changli', title: '长离' }],
        },
        {
          type: 'source',
          sourceType: 'url',
          id: 's1',
          url: 'https://wiki.test/changli',
          title: '长离',
        },
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: '查到了。' },
        { type: 'text-end', id: 't' },
        finish('stop'),
      ],
    ])
    models.main = main
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('长离长什么样')),
    )
    const steps = events.filter((event) => event.type === 'step') as {
      step: { tool: string; status: string; title: string }
    }[]
    expect(steps.map((event) => [event.step.tool, event.step.status])).toEqual([
      ['search_web', 'running'],
      ['search_web', 'done'],
    ])
    expect(steps[0]!.step.title).toContain('长离 官方设定')
  })
})

describe('第 4 步：各台的改法', () => {
  const resultsOf = (main: MockLanguageModelV3) =>
    promptOf(main.doStreamCalls[1]!)

  it('新内核借旧执行器时打上 nextKernel（只修不拒那几道闸认它）', async () => {
    models.main = mockModel([textTurn('好。')])
    await collect(runAssistantNext('clerk-1', imageRequest('你好')))
    expect(run.nextKernel).toBe(true)
  })

  it('LoRA 台 add_lora：按名字搜一遍（不出过程行），挑名字对得上的那把挂上', async () => {
    plan.mockImplementation(async (_run, tool: string, args: unknown) => {
      if (tool === 'search_loras')
        return {
          kind: 'read',
          payload: args,
          run: async () => {
            run.loraIndex.set('c-other', {
              candidateId: 'c-other',
              name: 'malfoid style',
            })
            run.loraIndex.set('c-1', { candidateId: 'c-1', name: 'Malfoid' })
            return { result: {}, observation: '' }
          },
        }
      // 挂上那一步的载荷要整份候选（导入在浏览器），这里只看路由对不对。
      return { kind: 'rejected', reason: 'unknownValue', detail: 'stub mount' }
    })
    const main = mockModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          changes: [{ op: 'add_lora', lora: 'LoRA·malfoid', weight: 0.8 }],
        },
      }),
      textTurn('挂好了。'),
    ])
    models.main = main
    const events = await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('挂上 malfoid', {
          domain: 'lora',
          snapshot: {
            prompt: '1boy',
            model: { id: 'illustrious', label: 'Illustrious' },
            availableModels: [{ id: 'illustrious', label: 'Illustrious' }],
            loras: {
              items: [],
              baseFamily: 'illustrious',
              minWeight: 0,
              maxWeight: 2,
            },
          },
        } as unknown as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(plan.mock.calls.map((call) => call[1])).toEqual([
      'search_loras',
      'mount_lora',
    ])
    expect(plan.mock.calls[1]![2]).toEqual({ candidateId: 'c-1', weight: 0.8 })
    // 搜的那一下不出过程行，只有挂上那一行。
    expect(events.filter((event) => event.type === 'step')).toHaveLength(1)
    expect(resultsOf(main)).toContain('stub mount')
  })

  it('套用配方：拆成这台有的那几格逐条落，这台没有的说清楚', async () => {
    recipe.mockResolvedValue({
      tag: '图_12',
      prompt: '1girl, red hair',
      negative: 'lowres',
      model: 'seedream-5.0-pro',
      aspectRatio: '3:4',
      width: 768,
      height: 1024,
      options: { guidanceScale: 5, notOnBench: 1 },
      loras: [{ name: 'malfoid', weight: 0.8 }],
      references: ['图_3', null],
    })
    plan.mockImplementation(
      async (_run, tool: string, args: { value?: string }) =>
        tool === 'set_prompt' || tool === 'set_negative'
          ? {
              kind: 'mutate',
              payload: { value: args.value, mode: 'replace' },
              inverse: { value: '' },
              observation: `${tool} landed`,
              apply: () => {},
            }
          : {
              kind: 'rejected',
              reason: 'unknownValue',
              detail: `${tool} stub`,
            },
    )
    const main = mockModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: { changes: [{ op: 'apply_recipe', picture: '图_12' }] },
      }),
      textTurn('套好了。'),
    ])
    models.main = main
    await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('套用图_12的配方', {
          snapshot: {
            ...imageRequest('').snapshot,
            capabilities: [
              {
                key: 'guidanceScale',
                kind: 'slider',
                value: null,
                available: true,
              },
            ],
          },
        } as unknown as Partial<AssistantOperatorRequest>),
      ),
    )
    const calls = plan.mock.calls.map((call) => [call[1], call[2]])
    // 型号与台上相同不换；提示词、负面词整段写；台上有的参数才套；参考图按编号挂。
    expect(calls).toContainEqual([
      'set_prompt',
      { value: '1girl, red hair', overwrite: true },
    ])
    expect(calls).toContainEqual([
      'set_negative',
      { value: 'lowres', overwrite: true },
    ])
    expect(calls).toContainEqual([
      'set_capability',
      { key: 'guidanceScale', value: 5 },
    ])
    expect(calls.some((call) => call[0] === 'set_model')).toBe(false)
    expect(
      calls.some(
        (call) =>
          call[0] === 'set_capability' &&
          (call[1] as { key: string }).key === 'notOnBench',
      ),
    ).toBe(false)
    expect(calls.some((call) => call[0] === 'mount_reference')).toBe(true)
    const results = resultsOf(main)
    expect(results).toContain('图_12')
    expect(results).toContain('they only go on the LoRA bench')
    expect(results).toContain('uploaded picture')
  })

  it('套用配方：查不到那张图就只回这一条', async () => {
    recipe.mockResolvedValue(null)
    const main = mockModel([
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: { changes: [{ op: 'apply_recipe', picture: '图_99999' }] },
      }),
      textTurn('没找到。'),
    ])
    models.main = main
    await collect(runAssistantNext('clerk-1', imageRequest('套用图_99999')))
    expect(plan).not.toHaveBeenCalled()
    expect(resultsOf(main)).toContain("no such picture of the creator's")
  })
})
