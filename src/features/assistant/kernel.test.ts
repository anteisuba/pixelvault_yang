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

const { plan, closeRound, recordTurn, soft, models, run, recipe } = vi.hoisted(
  () => ({
    plan: vi.fn(),
    recipe: vi.fn(),
    closeRound: vi.fn(async () => undefined),
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
  }),
)

vi.mock('@/lib/db', () => ({ db: {} }))
const memoryStore = vi.hoisted(() => ({
  memories: [] as unknown[],
  summaries: [] as unknown[],
  listed: vi.fn(),
  scheduled: vi.fn(),
}))
vi.mock('@/services/assistant-memory.service', () => ({
  listNextAssistantMemoriesForPrompt: async (...args: unknown[]) => {
    memoryStore.listed(...args)
    return memoryStore.memories
  },
}))
const skillStore = vi.hoisted(() => ({ rows: [] as unknown[] }))
const homeChat = vi.hoisted(() => ({ id: null as string | null }))
vi.mock('@/services/assistant-persona.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getHomeChatCharacterId: vi.fn(async () => homeChat.id),
}))
vi.mock('@/services/assistant-skill.service', async () => {
  const { resolveSkills } = await import('@/features/assistant/skills')
  return {
    loadAssistantSkills: async () => resolveSkills(skillStore.rows as never),
  }
})
vi.mock('@/services/kernel/assistant-v3-history.service', () => ({
  loadAssistantV3HistorySummaries: async () => ({
    summaries: memoryStore.summaries,
    canSummarize: true,
  }),
  scheduleAssistantV3HistorySummary: (input: unknown) =>
    memoryStore.scheduled(input),
}))
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
  requestProjectId: (request: AssistantOperatorRequest) =>
    request.workspaceKey?.startsWith('canvas:')
      ? request.workspaceKey.slice('canvas:'.length)
      : null,
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

import { assistantV3TurnFingerprint } from '@/lib/assistant-v3-history'

import { runAssistantNext } from './kernel'
import { pickChatMood, workMoodReminder } from './prompt'

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
  it('首页带着小配方（第 9g 步）：照图片台跑，会话仍在首页，系统提示按首页写', async () => {
    const main = mockModel([textTurn('好。')])
    models.main = main
    const prepare = vi.mocked(prepareOperatorTurn)
    prepare.mockClear()
    await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('来张猫', {
          domain: 'home',
          workspaceKey: 'home',
          snapshot: {
            ...imageRequest('').snapshot,
            specs: {
              aspectRatio: '1:1',
              resolution: null,
              qualityOptions: [],
              backgroundOptions: [],
              aspectRatioOptions: ['1:1'],
              resolutionOptions: [],
            },
          },
        } as never),
      ),
    )
    expect(prepare).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({ domain: 'image', workspaceKey: 'home' }),
      expect.anything(),
      expect.objectContaining({ homeDraft: true }),
    )
    const sent = promptOf(main.doStreamCalls[0]!)
    expect(sent).toContain('THE PAGE: HOME')
    expect(sent).toContain('HOME — no bench is open')
    expect(sent).toContain('THE DRAFT — what is in it right now.')
  })

  it('没开台 = 和现在这位聊天（用户 10-26）：首页按设置里那张卡带上 chatCharacterId；台上 / 盖过章的照旧', async () => {
    const card = '11111111-1111-4111-8111-111111111111'
    const stamped = '22222222-2222-4222-8222-222222222222'
    homeChat.id = card
    const prepare = vi.mocked(prepareOperatorTurn)
    try {
      models.main = mockModel([textTurn('在呢。')])
      prepare.mockClear()
      await collect(
        runAssistantNext(
          'clerk-1',
          imageRequest('嗨', { domain: 'home', workspaceKey: 'home' } as never),
        ),
      )
      expect(prepare.mock.calls[0]?.[1]).toMatchObject({
        chatCharacterId: card,
      })

      models.main = mockModel([textTurn('好。')])
      prepare.mockClear()
      await collect(runAssistantNext('clerk-1', imageRequest('改一下')))
      expect(prepare.mock.calls[0]?.[1]).not.toHaveProperty('chatCharacterId')

      models.main = mockModel([textTurn('嗯。')])
      prepare.mockClear()
      await collect(
        runAssistantNext(
          'clerk-1',
          imageRequest('嗨', {
            domain: 'home',
            workspaceKey: 'home',
            chatCharacterId: stamped,
          } as never),
        ),
      )
      expect(prepare.mock.calls[0]?.[1]).toMatchObject({
        chatCharacterId: stamped,
      })
    } finally {
      homeChat.id = null
    }
  })

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

  it('厂商 403 额度用完：认出原因、带余额文案，不说成一句「调用失败」', async () => {
    models.main = mockModel([
      new APICallError({
        message: 'Forbidden',
        url: 'https://api.x.ai/v1/responses',
        requestBodyValues: {},
        statusCode: 403,
        responseBody: JSON.stringify({
          code: 'permission-denied',
          error:
            'Your team t-1 has either used all available credits or reached its monthly spending limit.',
        }),
      }),
    ])
    await expect(
      collect(runAssistantNext('clerk-1', imageRequest('你好'))),
    ).rejects.toMatchObject({
      i18nKey: 'errors.provider.insufficientBalance',
      message: expect.stringContaining('monthly spending limit'),
    })
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

describe('记忆与之前几轮（第 6 步）', () => {
  beforeEach(() => {
    memoryStore.memories = []
    memoryStore.summaries = []
    memoryStore.listed.mockReset()
    memoryStore.scheduled.mockReset()
  })

  it('「关于你」那几条带编号进系统提示；隐身一条都不读', async () => {
    memoryStore.memories = [
      {
        id: '3f9a1c2b-0000-4000-8000-000000000000',
        scope: 'global',
        kind: 'preference',
        source: 'assistant',
        text: '人物图默认 3:4',
        projectId: null,
        projectName: null,
        characterCardId: null,
        characterName: null,
        createdAt: '2026-10-23T00:00:00.000Z',
        updatedAt: '2026-10-23T00:00:00.000Z',
      },
    ]
    const main = mockModel([textTurn('好。')])
    models.main = main
    await collect(runAssistantNext('clerk-1', imageRequest('出一张人物')))
    const system = promptOf(main.doStreamCalls[0]!)
    expect(system).toContain('[记忆·3f9a1c2b] 人物图默认 3:4')
    expect(memoryStore.listed).toHaveBeenCalledWith('user-1', {
      characterCardId: null,
      projectId: null,
      limit: 12,
    })

    memoryStore.listed.mockReset()
    const quiet = mockModel([textTurn('好。')])
    models.main = quiet
    await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('出一张人物', { incognito: true }),
      ),
    )
    expect(memoryStore.listed).not.toHaveBeenCalled()
    expect(promptOf(quiet.doStreamCalls[0]!)).not.toContain('人物图默认 3:4')
  })

  it('滑出去的那几轮：摘要接在系统提示里，管过的那一轮不再原样发', async () => {
    const first = [
      { role: 'user' as const, content: '主角是马尔福，冬装' },
      { role: 'assistant' as const, content: '记住了。' },
    ]
    memoryStore.summaries = [
      {
        through: assistantV3TurnFingerprint(first),
        turns: 1,
        decisions: ['主角是马尔福、冬装'],
        preferences: [],
        openItems: [],
        names: [],
      },
    ]
    const main = mockModel([textTurn('好。')])
    models.main = main
    await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('再来一张', {
          conversationId: 'conv-1',
          messages: [
            ...first,
            { role: 'user', content: '换个背景' },
            { role: 'assistant', content: '换成雪地了。' },
            { role: 'user', content: '再来一张' },
          ],
        }),
      ),
    )
    const prompt = promptOf(main.doStreamCalls[0]!)
    expect(prompt).toContain('EARLIER IN THIS CONVERSATION')
    expect(prompt).toContain('主角是马尔福、冬装')
    expect(prompt).not.toContain('主角是马尔福，冬装')
    expect(prompt).toContain('换成雪地了。')
    expect(memoryStore.scheduled).toHaveBeenCalledTimes(1)
  })

  it('和角色聊天：自己的系统提示、角色卡打头、记忆读她那份、故事向摘要、每轮末尾一句别出戏', async () => {
    memoryStore.memories = []
    memoryStore.summaries = []
    memoryStore.listed.mockReset()
    memoryStore.scheduled.mockReset()
    const prepare = vi.mocked(prepareOperatorTurn)
    const original = prepare.getMockImplementation()!
    prepare.mockImplementationOnce(async (...args) => {
      const prepared = await original(...args)
      return {
        ...prepared,
        persona: {
          ...prepared.persona,
          name: null,
          characterCardId: 'card-7',
          promptCharacter: {
            name: '马尔福',
            identity: '斯莱特林的学生',
            behavior: '嘴硬心软',
            speech: '说话带点傲慢。偶尔叫你「笨蛋」。',
            boundaries: '不会当着别人面道谢',
            catchphrases: [],
            backstory: '',
            moods: ['嘴硬：先否认再软下来'],
            learnedPhrases: ['摸鱼', '绝了'],
            relationship: '叫你「波特」，嘴上嫌弃其实很在意',
          },
          roleplay: {
            scenario: '图书馆的午后',
            opening: '',
            examples: [{ user: '', reply: '哼，别以为我会谢你。' }],
            journal: '今天他又来借书，我假装没看见。',
          },
        },
      } as typeof prepared
    })
    const main = mockModel([textTurn('哼，又是你。')])
    models.main = main
    const events = await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('你好呀', {
          conversationId: 'conv-chat',
          chatCharacterId: 'card-7',
          chatVoice: { expressive: false },
        } as never),
      ),
    )
    // ②c-2：她说的那几段带记号，界面拆成气泡。
    const said = events.filter(
      (event) => event.type === 'message' || event.type === 'message_delta',
    )
    expect(said.length).toBeGreaterThan(0)
    expect(
      said.every(
        (event) =>
          'chat' in event && event.chat && 'spoken' in event && event.spoken,
      ),
    ).toBe(true)
    const prompt = promptOf(main.doStreamCalls[0]!)
    expect(prompt).toContain('you are that character')
    expect(prompt).not.toContain("You are ANTEI's creative assistant")
    expect(prompt.indexOf('THIS CHAT — you are 马尔福')).toBeLessThan(
      prompt.indexOf("THIS CREATOR'S SETTINGS"),
    )
    expect(prompt).toContain('图书馆的午后')
    // C：她自己写的关系和最近一篇日记跟着聊天走。
    expect(prompt).toContain('叫你「波特」，嘴上嫌弃其实很在意')
    expect(prompt).toContain('「今天他又来借书，我假装没看见。」')
    expect(prompt).toContain('STAY IN CHARACTER as 马尔福 — 说话带点傲慢。')
    // 示例对白不再跟着提醒走（10-26：英文示例把中文聊天带成英文、照着示例说）。
    expect(prompt).not.toContain('You sound like')
    expect(prompt).toContain(
      'Answer what the creator just said, in the language they wrote it in.',
    )
    expect(prompt).toContain(
      "What you won't do, and your flaws: 不会当着别人面道谢",
    )
    // F：这一轮的口吻跟着提醒走、学到的说法在卡上、像发消息一样一行一个气泡。
    expect(prompt).toContain('This time your mood is: 嘴硬：先否认再软下来')
    expect(prompt).toContain(
      "Words you've picked up from the creator: 「摸鱼」 「绝了」",
    )
    expect(prompt).toContain('one line is one message bubble')
    // 开着声音：方括号语气提示的写法进这一轮（10-26 换内核后丢了，念出来没情绪）。
    expect(prompt).toContain('HOW YOUR VOICE SOUNDS')
    expect(prompt).toContain('[laughing]')
    expect(memoryStore.listed).toHaveBeenCalledWith('user-1', {
      characterCardId: 'card-7',
      projectId: null,
      limit: 12,
    })
    expect(memoryStore.scheduled).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'story' }),
    )
  })

  it('「/」点名的技能：全文进这一轮的消息；关掉的内置在设置那段点名', async () => {
    memoryStore.memories = []
    memoryStore.summaries = []
    skillStore.rows = [
      {
        id: 'a1b2c3d4-0000-4000-8000-000000000000',
        name: '冬装三视图',
        description: '冬装角色出三视图',
        body: '三视图一律白底，正侧背。',
        references: {},
        builtinSlug: null,
        enabled: true,
      },
      {
        id: 'b1b2c3d4-0000-4000-8000-000000000000',
        name: '参考图分工',
        description: '',
        body: null,
        references: {},
        builtinSlug: 'reference-roles',
        enabled: false,
      },
    ]
    const main = mockModel([textTurn('好。')])
    models.main = main
    await collect(
      runAssistantNext('clerk-1', imageRequest('/冬装三视图 马尔福')),
    )
    const prompt = promptOf(main.doStreamCalls[0]!)
    expect(prompt).toContain('THE CREATOR CALLED THIS SKILL WITH /冬装三视图')
    expect(prompt).toContain('三视图一律白底，正侧背。')
    expect(prompt).toContain('what they wrote after it: 马尔福')
    expect(prompt).toContain(
      'SKILLS THE CREATOR TURNED OFF — do not read these: 技能·参考图分工',
    )
    expect(prompt).not.toContain('- 技能·冬装三视图')
    skillStore.rows = []
  })
})

describe('画布（第 9a 步）', () => {
  const SHOT = 'video16f1cb3f-4164-4eb7-8d49-a429fa5fff0f'
  const NEW = 'image7bc23597-15e6-4026-9e34-0e2613ee3479'
  const card = (id: string, name: string, kind: 'image' | 'video') => ({
    id,
    name,
    kind,
    subtype: kind === 'video' ? 'shot' : 'character',
    text: '',
  })
  const canvasRequest = (
    nodes: ReturnType<typeof card>[],
    overrides: Partial<AssistantOperatorRequest> = {},
  ) =>
    ({
      workspaceKey: 'canvas:proj-1',
      domain: 'canvas',
      kernel: 'next',
      messages: [{ role: 'user', content: '加一张角色卡连到镜头上' }],
      snapshot: {
        prompt: '',
        availableModels: [],
        canvas: {
          currentShotNo: null,
          selectedNodeIds: [],
          shots: [{ expanded: true, shotNo: 1, title: 'S1', nodes }],
        },
      },
      ...overrides,
    }) as unknown as AssistantOperatorRequest

  it('加卡 + 连线合成一批交给浏览器落，停在 canvas_sync；落完那一跳补上新卡的句柄再接着跑', async () => {
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: SHOT },
      observation: 'queued',
      apply: () => {},
    }))
    const first = mockModel([
      toolTurn({
        id: 'e1',
        name: 'edit',
        input: {
          changes: [
            {
              op: 'add_card',
              ref: 'new1',
              type: 'image/character',
              name: '女主',
              text: 'a girl, full body',
            },
            {
              op: 'connect',
              from: 'new1',
              to: 'vid-16f1cb',
              port: 'reference',
            },
          ],
        },
      }),
    ])
    models.main = first
    const hop1 = await collect(
      runAssistantNext(
        'clerk-1',
        canvasRequest([card(SHOT, '镜头1', 'video')]),
      ),
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'canvas_batch',
      { ops: expect.any(Array) },
      'user-1',
    )
    expect(
      (plan.mock.calls[0]![2] as { ops: unknown[] }).ops.length,
    ).toBeGreaterThanOrEqual(2)
    expect(hop1.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'canvas_sync',
    })
    const relay = hop1.find((event) => event.type === 'transcript') as {
      transcript: AssistantV3Transcript
    }
    expect(relay.transcript).toHaveLength(1)

    const second = mockModel([textTurn('加好了。')])
    models.main = second
    const hop2 = await collect(
      runAssistantNext(
        'clerk-1',
        canvasRequest(
          [card(SHOT, '镜头1', 'video'), card(NEW, '女主', 'image')],
          {
            priorSteps: [
              {
                tool: 'canvas_batch',
                status: 'done',
                summary: '加卡',
                thisTurn: true,
              },
            ],
            v3: { transcript: relay.transcript },
          } as Partial<AssistantOperatorRequest>,
        ),
      ),
    )
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
    expect(
      second.doStreamCalls[0]!.prompt.map((message) => message.role),
    ).toEqual(['system', 'user', 'assistant', 'tool'])
    const sent = promptOf(second.doStreamCalls[0]!)
    expect(sent).toContain('Landed.')
    expect(sent).toContain('new1 → img-7bc235')
  })

  it('同一步里 edit 之后的 look / generate 不跑（板子还在落）', async () => {
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: SHOT },
      observation: 'queued',
      apply: () => {},
    }))
    models.main = mockModel([
      toolTurn(
        {
          id: 'e1',
          name: 'edit',
          input: {
            changes: [{ op: 'set_card', card: 'vid-16f1cb', name: '开场' }],
          },
        },
        { id: 'g1', name: 'generate', input: { cards: ['vid-16f1cb'] } },
      ),
    ])
    const hop1 = await collect(
      runAssistantNext(
        'clerk-1',
        canvasRequest([card(SHOT, '镜头1', 'video')]),
      ),
    )
    expect(hop1.find((event) => event.type === 'confirm')).toBeUndefined()
    expect(hop1.at(-1)).toMatchObject({ reason: 'canvas_sync' })
  })

  it('画布上没给卡的 generate 回一句要列卡', async () => {
    const main = mockModel([
      toolTurn({ id: 'g1', name: 'generate', input: {} }),
      textTurn('好。'),
    ])
    models.main = main
    await collect(
      runAssistantNext(
        'clerk-1',
        canvasRequest([card(SHOT, '镜头1', 'video')]),
      ),
    )
    expect(promptOf(main.doStreamCalls[1]!)).toContain(
      'generate on the canvas needs cards',
    )
  })
})

describe('开台（第 9e 步）', () => {
  const openTags = { id: 'o1', name: 'open', input: { bench: 'tags' } }

  it('开到标签台：停在 bench_open 交接力条；到了那一跳，open 的结果是新台的板子，接着跑', async () => {
    models.main = mockModel([toolTurn(openTags)])
    const hop1 = await collect(
      runAssistantNext('clerk-1', imageRequest('改成 NAI 标签再出一张')),
    )
    expect(hop1.at(-1)).toMatchObject({
      type: 'stopped',
      reason: 'bench_open',
      open: { workspace: 'image-tags' },
    })
    const relay = hop1.find((event) => event.type === 'transcript') as {
      transcript: AssistantV3Transcript
    }
    expect(relay.transcript).toHaveLength(1)

    const second = mockModel([textTurn('到了，接着改。')])
    models.main = second
    const hop2 = await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('改成 NAI 标签再出一张', {
          workspaceKey: 'image-tags',
          v3: { transcript: relay.transcript },
        } as never),
      ),
    )
    expect(hop2.at(-1)).toMatchObject({ type: 'done' })
    expect(
      second.doStreamCalls[0]!.prompt.map((message) => message.role),
    ).toEqual(['system', 'user', 'assistant', 'tool'])
    const sent = promptOf(second.doStreamCalls[0]!)
    expect(sent).toContain('Opened the tag bench')
    expect(sent).toContain('a girl in a garden')
  })

  it('浏览器没换过去（还在原台）：如实说没开成，⛔ 不当成到了', async () => {
    models.main = mockModel([toolTurn(openTags)])
    const hop1 = await collect(
      runAssistantNext('clerk-1', imageRequest('改成 NAI 标签再出一张')),
    )
    const relay = hop1.find((event) => event.type === 'transcript') as {
      transcript: AssistantV3Transcript
    }
    const second = mockModel([textTurn('没开成。')])
    models.main = second
    await collect(
      runAssistantNext(
        'clerk-1',
        imageRequest('改成 NAI 标签再出一张', {
          v3: { transcript: relay.transcript },
        } as never),
      ),
    )
    expect(promptOf(second.doStreamCalls[0]!)).toContain(
      'the tag bench did not open',
    )
  })

  it('同一步里 open 之后的调用不跑；已经在那个台上就直说，不白跳', async () => {
    models.main = mockModel([
      toolTurn(openTags, editPrompt),
      // 第二跳不会来：第一跳停在 bench_open。
    ])
    const hop1 = await collect(
      runAssistantNext('clerk-1', imageRequest('换台再改')),
    )
    expect(plan).not.toHaveBeenCalled()
    expect(hop1.at(-1)).toMatchObject({ reason: 'bench_open' })

    const main = mockModel([
      toolTurn({ id: 'o2', name: 'open', input: { bench: 'image' } }),
      textTurn('就在这儿。'),
    ])
    models.main = main
    const events = await collect(
      runAssistantNext('clerk-1', imageRequest('打开图片台')),
    )
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(promptOf(main.doStreamCalls[1]!)).toContain(
      'You are on the image bench already',
    )
  })
})

describe('pickChatMood（10-26「更像真人」F）', () => {
  it('每轮挑一种、同一轮重跑同一种、连着两轮不重复；没写口吻 = null', () => {
    const moods = ['慵懒', '嘴硬', '狡黠']
    const picks = Array.from({ length: 40 }, (_, turn) =>
      pickChatMood(moods, 'card-7', turn),
    )
    for (let turn = 1; turn < picks.length; turn += 1)
      expect(picks[turn]).not.toBe(picks[turn - 1])
    expect(new Set(picks)).toEqual(new Set(moods))
    expect(pickChatMood(moods, 'card-7', 5)).toBe(picks[5])
    expect(pickChatMood(['只有一种'], 'card-7', 3)).toBe('只有一种')
    expect(pickChatMood([], 'card-7', 3)).toBeNull()
  })
})

describe('workMoodReminder（10-26 工作台：说话像她、干活直说）', () => {
  it('这一轮的口吻只管开头和收尾；没写口吻、没用角色 = null', () => {
    const persona = {
      name: null,
      characterCardId: 'card-7',
      promptCharacter: {
        name: 'Denia',
        identity: '',
        behavior: '',
        speech: '说话慢',
        catchphrases: [],
        backstory: '',
        boundaries: '',
        moods: ['慵懒'],
      },
    } as never
    expect(workMoodReminder(persona, 3)).toBe(
      '(This time your mood as Denia is: 慵懒 — let it colour the opening and the closing, never the report.)',
    )
    expect(
      workMoodReminder(
        {
          ...(persona as object),
          promptCharacter: {
            ...(persona as { promptCharacter: object }).promptCharacter,
            moods: [],
          },
        } as never,
        3,
      ),
    ).toBeNull()
    expect(workMoodReminder({ name: null } as never, 3)).toBeNull()
  })
})
