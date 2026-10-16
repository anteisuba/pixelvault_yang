import { beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider'

import {
  ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
} from '@/constants/assistant-operator'
import { pickAutoAssistantRouteModel } from '@/constants/assistant-persona'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AssistantModelKeyMissingError } from '@/lib/errors'
import {
  expectSelectedProviderOnly,
  providerUsesOf,
} from '@/test/selected-provider-only'
import { AssistantOperatorStepSchema } from '@/types/assistant-operator'
import type {
  AssistantOperatorCanvasNode,
  AssistantOperatorCanvasSnapshot,
  AssistantOperatorEvent,
  AssistantOperatorPriorStep,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

const {
  plan,
  legacy,
  closeRound,
  model,
  characterReminder,
  served,
  fetchAsBuffer,
  resolveModel,
  recordTurn,
  effortPerStep,
  maxOutputTokens,
  queryRaw,
} = vi.hoisted(() => ({
  plan: vi.fn(),
  legacy: vi.fn(),
  closeRound: vi.fn(async () => undefined),
  model: { current: null as unknown },
  characterReminder: vi.fn((): string | null => null),
  /** 测试里下得来的图：地址 → 格式（没登记的下不来）。 */
  served: new Map<string, string>(),
  fetchAsBuffer: vi.fn(),
  /** 记下主模型按哪条路由、哪个型号建（「只用所选那一家」要数它）。 */
  resolveModel: vi.fn(),
  /** 每轮的过程记录：每一跳收尾交过去的那一份。 */
  recordTurn: vi.fn(),
  /** 这一家能不能按步换思考档（`effortPerStep`，§2.6）。 */
  effortPerStep: { current: true },
  /** 这一家交给 `streamText` 的输出上限（`undefined` = 不发）。 */
  maxOutputTokens: { current: undefined as number | undefined },
  /** 查自家作品配方那条裸 SQL（「反推读原配方」）：默认一张都不是自家做的。 */
  queryRaw: vi.fn(async (): Promise<unknown[]> => []),
}))

vi.mock('@/lib/db', () => ({ db: { $queryRaw: queryRaw } }))

/** 测试里下得来的片子：地址 → 多大（真的 mp4 文件头）。 */
const clipsServed = new Map<string, number>()

/** 图的内容写着格式与地址（`png:https://…`）：附没附、附在哪，按它认。 */
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer,
  uploadToR2: vi.fn(),
  detectTrustedImageMime: async (
    buffer: Buffer,
    formats: ReadonlySet<string>,
  ) => {
    const format = buffer.toString().split(':')[0] ?? ''
    if (!formats.has(format)) throw new Error('unsupported image')
    return { format, mimeType: `image/${format}`, width: 512, height: 768 }
  },
}))

vi.mock('@/services/kernel/assistant-operator.service', () => ({
  prepareOperatorTurn: vi.fn(
    async (_clerkId: string, request: AssistantOperatorRequest) => ({
      request,
      user: { id: 'user-1', displayName: null, username: null },
      persona: { language: 'ui', reasoningEffort: 'high' },
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
  buildCharacterReminder: characterReminder,
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
      options: { label: string; description: string; assetUrl?: string }[]
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
        ...(option.assetUrl ? { assetUrl: option.assetUrl } : {}),
      })),
    })),
  resolveResponseLanguage: () => 'chinese',
  operatorCacheKey: () => 'v3:test',
  recordLedgerStep: vi.fn(),
  rememberStepArtifacts: vi.fn(),
  isFatalOperatorToolError: () => false,
  latestUserMessage: () => '',
  memoryScopeForDomain: (domain: string) =>
    domain === 'cards' ? 'global' : domain,
  requestProjectId: () => null,
  memoryAsRule: (memory: {
    id: string
    text: string
    source: string
    createdAt: string
  }) => ({
    id: memory.id,
    scope: null,
    text: memory.text,
    kind: 'note',
    source: memory.source,
    createdAt: memory.createdAt,
  }),
  TOOL_FAILED_DETAIL: 'tool failed',
  OPERATOR_OUT_OF_STEPS_MESSAGES: { chinese: '步数用完了' },
  OPERATOR_SAME_FAILURE_MESSAGES: {
    chinese: (step: string) => `「${step}」连着失败了两次`,
  },
}))

vi.mock('@/services/kernel/assistant-v3-prompt.service', () => ({
  buildAssistantV3SystemPrompt: () => ({
    rules: 'SYSTEM',
    creator: '',
    text: 'SYSTEM',
  }),
}))

vi.mock(
  '@/services/kernel/assistant-v3-model.service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/services/kernel/assistant-v3-model.service')
    >()),
    resolveAssistantV3Model: (...args: unknown[]) => {
      resolveModel(...args)
      return {
        model: model.current,
        strictTools: false,
        effortPerStep: effortPerStep.current,
        maxOutputTokens: maxOutputTokens.current,
        // 档位原样摆进请求，用例按步读它（`doStreamCalls[n].providerOptions`）。
        providerOptions: (_cacheKey: string, effort: string) => ({
          test: { effort },
        }),
        system: (prompt: { rules: string; creator: string }) =>
          `${prompt.rules}${prompt.creator}`,
        messages: (messages: unknown[]) => messages,
      }
    },
  }),
)

/** P3 翻记忆：`search_library kind "memories"` 读它，⛔ 真打库。 */
const searchMemories = vi.fn(async (..._args: unknown[]) => [] as unknown[])
vi.mock('@/services/assistant-memory.service', () => ({
  searchAssistantMemories: (...args: unknown[]) => searchMemories(...args),
}))

vi.mock('@/services/kernel/assistant-completion.service', () => ({
  startCallLog: () => ({ onUsage: vi.fn(), finish: vi.fn() }),
}))

vi.mock('@/services/assistant-turn-record.service', () => ({
  recordAssistantTurn: recordTurn,
}))

import { prepareOperatorTurn } from '@/services/kernel/assistant-operator.service'
import { assertAssistantMediaRoute } from '@/lib/assistant-media-gate'
import { planClipFrames } from '@/lib/video-frame-plan'

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

/** 这一次调用附了哪几张图（按图里写着的地址认）：user 消息里的 + 工具结果里的。 */
function attachedPictures(call: LanguageModelV3CallOptions): string[] {
  const urlOf = (data: unknown) => {
    const text =
      typeof data === 'string'
        ? Buffer.from(data, 'base64').toString()
        : Buffer.from(data as Uint8Array).toString()
    return text.slice(text.indexOf(':') + 1)
  }
  return call.prompt.flatMap((message) => {
    if (message.role === 'user')
      return message.content.flatMap((part) =>
        part.type === 'file' && part.mediaType.startsWith('image/')
          ? [urlOf(part.data)]
          : [],
      )
    if (message.role === 'tool')
      return message.content.flatMap((part) =>
        part.type === 'tool-result' && part.output.type === 'content'
          ? part.output.value.flatMap((item) =>
              item.type === 'image-data' ? [urlOf(item.data)] : [],
            )
          : [],
      )
    return []
  })
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

beforeEach(() => {
  served.clear()
  queryRaw.mockReset()
  queryRaw.mockResolvedValue([])
  resolveModel.mockClear()
  effortPerStep.current = true
  maxOutputTokens.current = undefined
  clipsServed.clear()
  fetchAsBuffer.mockReset()
  fetchAsBuffer.mockImplementation(
    async (url: string, options?: { maxBytes?: number }) => {
      const bytes = clipsServed.get(url)
      if (bytes !== undefined) {
        if (options?.maxBytes !== undefined && bytes > options.maxBytes)
          throw new Error(
            `Image exceeds maximum size of ${options.maxBytes} bytes (declared ${bytes}).`,
          )
        return {
          buffer: Buffer.concat([
            Buffer.from([0, 0, 0, 24]),
            Buffer.from(`ftypisom:${url}`, 'ascii'),
          ]),
          mimeType: 'video/mp4',
        }
      }
      const format = served.get(url)
      if (!format) throw new Error('unreachable')
      return { buffer: Buffer.from(`${format}:${url}`), mimeType: 'image/*' }
    },
  )
})

/** 浏览器按片长计划抽好的那组帧（`captureClipFrames` 交上来的形状）。 */
function capturedClip(
  sourceUrl: string,
  label: string,
  durationSeconds: number,
  nodeId?: string,
) {
  return {
    sourceUrl,
    label,
    durationSeconds,
    ...(nodeId ? { nodeId } : {}),
    frames: planClipFrames(durationSeconds).entries.map((entry) => ({
      index: entry.index,
      timestampSeconds: entry.timestampSeconds,
      dataUrl: `data:image/webp;base64,${Buffer.from(`webp:${sourceUrl}#${entry.index}`).toString('base64')}`,
    })),
  }
}

/** 这一次调用附了哪几段片子本体（按 mp4 里写着的地址认）。 */
function attachedClips(call: LanguageModelV3CallOptions): string[] {
  return call.prompt.flatMap((message) =>
    message.role === 'user'
      ? message.content.flatMap((part) => {
          if (part.type !== 'file' || !part.mediaType.startsWith('video/'))
            return []
          const text = Buffer.from(part.data as Uint8Array).toString()
          return [text.slice(text.indexOf(':') + 1)]
        })
      : [],
  )
}

describe('v3 内核', () => {
  beforeEach(() => {
    plan.mockReset()
    legacy.mockReset()
    closeRound.mockClear()
  })

  const HARRY_PNG = 'https://cdn.test/harry.png'
  const GOYLE_PNG = 'https://cdn.test/goyle.png'

  /** 两张角色图卡各指着画布参考位上自己那张图（`referenceImageIndex`）。 */
  function lookSnapshot(withGoyle = true) {
    const board = canvas(withGoyle)
    const shot = board.shots[0]
    if (shot?.expanded)
      shot.nodes = shot.nodes.map((node) =>
        node.id === HARRY
          ? { ...node, referenceImageIndex: 0 }
          : node.id === GOYLE
            ? { ...node, referenceImageIndex: 1 }
            : node,
      )
    return { prompt: '', canvas: board, availableModels: [] }
  }

  /** 这一轮选的模型与画布参考位（不给就用文件顶上那份默认）。 */
  function preparedOnce(
    route: { adapterType: string; modelId: string },
    referenceUrls: string[],
  ) {
    const run = {
      stepSeq: 0,
      signal: undefined,
      inspectedCanvasReferences: null,
      skipReferenceReview: false,
      state: { referenceUrls },
    }
    vi.mocked(prepareOperatorTurn).mockImplementationOnce(
      async (_clerkId, request) =>
        ({
          request,
          user: { id: 'user-1', displayName: null, username: null },
          persona: { language: 'ui' },
          rules: [],
          route: {
            adapterType: route.adapterType,
            providerConfig: {},
            apiKey: 'k',
          },
          modelId: route.modelId,
          run,
        }) as never,
    )
    return run
  }

  const OPENAI = { adapterType: 'openai', modelId: 'gpt-6-luna' }
  const lookBoth = {
    id: 'call_look',
    name: 'look',
    input: { cards: ['img-249e8b', 'img-9c0d1e'], question: '哪张是哈利？' },
  }

  /**
   * 搜索期第二片：联网那两种每张脸都开 —— 画布上 search_library 的 web_images /
   * web_videos 交给旧执行器那两条（⛔ 不当成搜素材库）。
   */
  it('画布：search_library 的 web_images / web_videos 走联网找图 / 找视频', async () => {
    plan.mockResolvedValue({
      kind: 'rejected',
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
      detail: 'ok',
    })
    script(
      toolTurn(
        {
          id: 'call_videos',
          name: 'search_library',
          input: { query: '鸣潮 长离 PV', kind: 'web_videos', subject: null },
        },
        {
          id: 'call_images',
          name: 'search_library',
          input: { query: '长离', kind: 'web_images', subject: '鸣潮 长离' },
        },
      ),
      textTurn('找到了。'),
    )
    await collect(runAssistantV3('clerk-1', request()))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'search_web_videos',
      { query: '鸣潮 长离 PV' },
      'user-1',
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'search_web_images',
      { query: '长离', subject: '鸣潮 长离', preferOfficial: true },
      'user-1',
    )
    expect(plan).not.toHaveBeenCalledWith(
      expect.anything(),
      'search_assets',
      expect.anything(),
      expect.anything(),
    )
  })

  it('⭐ P3：search_library kind memories 翻记忆，⛔ 不走素材库；翻到的给模型看、空的说没有', async () => {
    searchMemories.mockResolvedValueOnce([
      {
        id: 'mem-1',
        scope: 'canvas',
        kind: 'preference',
        source: 'assistant',
        text: '分镜一律 16:9',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ])
    const mock = script(
      toolTurn(
        {
          id: 'call_mem',
          name: 'search_library',
          input: { query: '画幅', kind: 'memories', subject: null },
        },
        {
          id: 'call_mem_2',
          name: 'search_library',
          input: { query: '角色名', kind: 'memories', subject: null },
        },
      ),
      textTurn('记得，16:9。'),
    )
    const events = await collect(runAssistantV3('clerk-1', request()))
    expect(searchMemories).toHaveBeenCalledWith('user-1', {
      scope: 'canvas',
      projectId: null,
      query: '画幅',
    })
    expect(plan).not.toHaveBeenCalled()
    const next = promptText(mock.doStreamCalls[1]!)
    expect(next).toContain('- [preference] 分镜一律 16:9')
    expect(next).toContain('Nothing you remember matches')
    expect(
      events.some(
        (event) =>
          event.type === 'step' &&
          event.step.status === 'done' &&
          event.step.title === '翻记忆 画幅',
      ),
    ).toBe(true)
    expect(JSON.stringify(mock.doStreamCalls[0]!.tools)).toContain(
      'kind \\"memories\\"',
    )
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

  it('准备这一轮时 ⛔ 不读上几轮的结论记录（P2：v3 用不上）', async () => {
    script(textTurn('好的。'))
    await collect(runAssistantV3('clerk-1', request()))
    expect(prepareOperatorTurn).toHaveBeenCalledWith(
      'clerk-1',
      expect.anything(),
      expect.anything(),
      { skipPriorRounds: true },
    )
  })

  it('自动生成开着：这一轮的话前面挂一行 AUTO-GENERATE ON（带张数上限），关着不挂', async () => {
    const on = script(textTurn('好。'))
    await collect(runAssistantV3('clerk-1', request({ autoGenerate: true })))
    expect(promptText(on.doStreamCalls[0]!)).toContain(
      'AUTO-GENERATE ON — at most 4 pictures this turn in total.',
    )
    const off = script(textTurn('好。'))
    await collect(runAssistantV3('clerk-1', request()))
    expect(promptText(off.doStreamCalls[0]!)).not.toContain(
      'AUTO-GENERATE ON —',
    )
  })

  it('用角色时这一轮的话末尾带一句别出戏（附录J ③），没用角色不带', async () => {
    characterReminder.mockReturnValueOnce(
      'STAY IN CHARACTER as Denia — 说话短。',
    )
    const on = script(textTurn('好。'))
    await collect(runAssistantV3('clerk-1', request()))
    const text = promptText(on.doStreamCalls[0]!)
    expect(text).toContain('STAY IN CHARACTER as Denia — 说话短。')
    // 在这一轮的话之后 —— 离生成点最近。
    expect(text.indexOf('STAY IN CHARACTER')).toBeGreaterThan(
      text.indexOf('THE CREATOR SAYS'),
    )
    const off = script(textTurn('好。'))
    await collect(runAssistantV3('clerk-1', request()))
    expect(promptText(off.doStreamCalls[0]!)).not.toContain('STAY IN CHARACTER')
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

  describe('思考档按步调（§2.6）', () => {
    /** 开轮那一跳落一个 edit，接力那一跳（纯落地步）收尾：两次调用各用哪一档。 */
    async function landThenClose(
      landed: Partial<AssistantOperatorPriorStep> = { status: 'done' },
    ) {
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
      await collect(
        runAssistantV3(
          'clerk-1',
          request({
            snapshot: {
              prompt: '',
              canvas: canvas(false),
              availableModels: [],
            },
            priorSteps: [
              {
                tool: 'canvas_batch',
                status: 'done',
                summary: '断开',
                thisTurn: true,
                ...landed,
              },
            ],
            v3: { transcript },
          } as Partial<AssistantOperatorRequest>),
        ),
      )
      return mock.doStreamCalls.map((call) => call.providerOptions)
    }

    it('开轮那一步用创作者选的那一档；纯落地步降到 low', async () => {
      expect(await landThenClose()).toEqual([
        { test: { effort: 'high' } },
        { test: { effort: 'low' } },
      ])
    })

    it('换档赔缓存的那几家（effortPerStep 关）：整轮照用创作者那一档', async () => {
      effortPerStep.current = false
      expect(await landThenClose()).toEqual([
        { test: { effort: 'high' } },
        { test: { effort: 'high' } },
      ])
    })

    it('画布那一批只落了一部分（结果不算错）：照用创作者那一档', async () => {
      expect(
        await landThenClose({
          status: 'error',
          rejectReason: 'canvasBatchPartial',
          detail: '第 2 条没落：连线目标不存在',
        }),
      ).toEqual([{ test: { effort: 'high' } }, { test: { effort: 'high' } }])
    })

    it('上一步失败了（不是纯落地）：照用创作者那一档', async () => {
      const mock = script(
        toolTurn({
          id: 'call_1',
          name: 'edit',
          input: { ops: [{ op: 'delete', card: 'img-9c0d1f' }] },
        }),
        textTurn('没找到那张卡。'),
      )
      await collect(runAssistantV3('clerk-1', request()))
      expect(mock.doStreamCalls.map((call) => call.providerOptions)).toEqual([
        { test: { effort: 'high' } },
        { test: { effort: 'high' } },
      ])
    })
  })

  it('主步带上这一家的输出上限（P2 §2.3）；没有（代理 / Grok）就一个字不发', async () => {
    maxOutputTokens.current = 64_000
    const capped = script(textTurn('好的。'))
    await collect(runAssistantV3('clerk-1', request()))
    expect(capped.doStreamCalls[0]?.maxOutputTokens).toBe(64_000)
    maxOutputTokens.current = undefined
    const open = script(textTurn('好的。'))
    await collect(runAssistantV3('clerk-1', request()))
    expect(open.doStreamCalls[0]?.maxOutputTokens).toBeUndefined()
  })

  it('read "lane:<n>"（板子分级）：那条带上的卡照原路读，一次最多 12 张，其余一行；折起来的带、没有的带照实说', async () => {
    const lane = Array.from(
      { length: 14 },
      (_, index) =>
        ({
          id: `video${String(index + 10).padStart(2, '0')}a1b2c3-0000-4000-8000-000000000000`,
          name: `S01 素材${index}`,
          kind: 'video',
          subtype: 'shot',
          text: `第 ${index} 段提示词`,
        }) as AssistantOperatorCanvasNode,
    )
    const mock = script(
      toolTurn({
        id: 'call_1',
        name: 'read',
        input: { cards: ['lane:1', 'lane:2', 'lane:7'] },
      }),
      textTurn('看过了。'),
    )
    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: {
            prompt: '',
            availableModels: [],
            canvas: {
              currentShotNo: null,
              selectedNodeIds: [],
              shots: [
                { expanded: true, shotNo: 1, title: 'S1', nodes: lane },
                { expanded: false, shotNo: 2, title: 'S2', nodeCount: 5 },
              ],
            },
          },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const tool = mock.doStreamCalls[1]!.prompt.find(
      (message) => message.role === 'tool',
    )!
    const part = tool.content[0] as {
      output: { type: string; value: string }
    }
    const read = {
      output: part.output.value,
      error: part.output.type === 'error-text',
    }
    expect(read.error).toBe(false)
    for (const index of [0, 11])
      expect(read.output).toContain(`第 ${index} 段提示词`)
    expect(read.output).not.toContain('第 12 段提示词')
    expect(read.output).toContain(
      '2 more cards there, one line each — read them by handle:',
    )
    expect(read.output).toMatch(/vid-22a1b2 · video\/shot 「S01 素材12」/)
    expect(read.output).toContain(
      "LANE 2 is collapsed on the creator's screen: its 5 cards are not available to you.",
    )
    expect(read.output).toContain('There is no LANE 7 on the board.')
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

  it('改动已经落下、收尾那一步空回复：不重试，⛔ 不说「什么都没改」', async () => {
    script(toolTurn(disconnectGoyle))
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

    const empty: LanguageModelV3StreamPart[] = [
      {
        type: 'finish',
        finishReason: { unified: 'other', raw: undefined },
        usage,
      },
    ]
    const mock = script(empty, textTurn('不该被问到'))
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
    expect(mock.doStreamCalls).toHaveLength(1)
    const message = second.find((event) => event.type === 'message') as {
      text: string
    }
    expect(message.text).toContain('已经落下')
    expect(message.text).not.toContain('什么都没改')
    expect(second.at(-1)).toMatchObject({ type: 'done' })
  })

  it('模型一直不回第一个分片：到点掐掉、原样重问一次，⛔ 不干等到硬线', async () => {
    vi.useFakeTimers()
    try {
      const queue = [null, textTurn('好了。')]
      const mock = new MockLanguageModelV3({
        doStream: async (options) => {
          const chunks = queue.shift()
          if (chunks) {
            return { stream: simulateReadableStream({ chunks }) }
          }
          // 一个分片都不给，直到被 abort。
          return {
            stream: new ReadableStream<LanguageModelV3StreamPart>({
              start(controller) {
                options.abortSignal?.addEventListener('abort', () =>
                  controller.error(new DOMException('aborted', 'AbortError')),
                )
              },
            }),
          }
        },
      })
      model.current = mock
      const pending = collect(runAssistantV3('clerk-1', request()))
      await vi.advanceTimersByTimeAsync(61_000)
      const events = await pending
      expect(mock.doStreamCalls).toHaveLength(2)
      expect(events.at(-2)).toMatchObject({ type: 'message', text: '好了。' })
      expect(events.at(-1)).toMatchObject({ type: 'done' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('重问一次还是不回：报提供商超时（可重试的那种错）', async () => {
    vi.useFakeTimers()
    try {
      const mock = new MockLanguageModelV3({
        doStream: async (options) => ({
          stream: new ReadableStream<LanguageModelV3StreamPart>({
            start(controller) {
              options.abortSignal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              )
            },
          }),
        }),
      })
      model.current = mock
      const pending = collect(runAssistantV3('clerk-1', request())).catch(
        (error: unknown) => error,
      )
      await vi.advanceTimersByTimeAsync(61_000)
      await vi.advanceTimersByTimeAsync(61_000)
      const result = await pending
      expect(mock.doStreamCalls).toHaveLength(2)
      expect(result).toMatchObject({ errorCode: 'PROVIDER_TIMEOUT' })
    } finally {
      vi.useRealTimers()
    }
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

  it('look：图交到主模型眼前，只附给紧跟着的那一步；⛔ 不另起看图子调用', async () => {
    const run = preparedOnce(OPENAI, [HARRY_PNG, GOYLE_PNG])
    served.set(HARRY_PNG, 'png')
    served.set(GOYLE_PNG, 'png')
    const mock = script(
      toolTurn(lookBoth),
      toolTurn({
        id: 'call_read',
        name: 'read',
        input: { cards: ['img-249e8b'] },
      }),
      textTurn('左边那张是哈利。'),
    )
    const events = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: lookSnapshot(),
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    // ⛔ 写词 / 出图前也不另看参考图（五张脸都设）。
    expect(run.skipReferenceReview).toBe(true)
    expect(plan).not.toHaveBeenCalled()

    const [before, next, after] = mock.doStreamCalls
    expect(attachedPictures(before!)).toEqual([])
    expect(attachedPictures(next!)).toEqual([HARRY_PNG, GOYLE_PNG])
    // OpenAI 协议的 tool 消息只收文字：结果写字，图跟在后面那条 user 里。
    expect(next!.prompt.at(-2)?.role).toBe('tool')
    expect(next!.prompt.at(-1)?.role).toBe('user')
    expect(JSON.stringify(next!.prompt.at(-1))).toContain(
      'PICTURES FROM YOUR look (in order): 1 = 「img-249e8b 哈利 · 黑袍」 · 2 = 「img-9c0d1e 高尔 · 黑袍」',
    )
    expect(promptText(next!)).toContain(
      'You are looking at these pictures for: \\"哪张是哈利？\\"',
    )
    // 再往后只剩工具结果那行字。
    expect(attachedPictures(after!)).toEqual([])
    expect(promptText(after!)).toContain('for your next step only')

    // 过程行只说看了哪几张，⛔ 不另起一行「看到了什么」。
    const steps = events.flatMap((event) =>
      event.type === 'step' ? [event.step] : [],
    )
    expect(steps[0]).toMatchObject({
      tool: 'read_state',
      status: 'done',
      title: '查看「哈利 · 黑袍」；查看「高尔 · 黑袍」',
      payload: { nodeIds: [HARRY, GOYLE] },
      result: { digest: '哈利 · 黑袍 · 高尔 · 黑袍' },
    })
    expect(steps).toHaveLength(2)
  })

  it('Gemini：图放进 look 那条工具结果本身，⛔ 不另接一条 user', async () => {
    preparedOnce({ adapterType: 'gemini', modelId: 'gemini-3.8-flash' }, [
      HARRY_PNG,
      GOYLE_PNG,
    ])
    served.set(HARRY_PNG, 'png')
    const mock = script(
      toolTurn({
        id: 'call_look',
        name: 'look',
        input: { cards: ['img-249e8b'], question: '是谁？' },
      }),
      textTurn('是哈利。'),
    )
    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: lookSnapshot(),
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const next = mock.doStreamCalls[1]!
    expect(next.prompt.at(-1)).toMatchObject({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call_look',
          output: { type: 'content' },
        },
      ],
    })
    expect(attachedPictures(next)).toEqual([HARRY_PNG])
  })

  it('look：一张下不来只点名那一张，其余照样交到眼前', async () => {
    const GOYLE_GIF = 'https://cdn.test/goyle.gif'
    preparedOnce(OPENAI, [HARRY_PNG, GOYLE_GIF])
    served.set(HARRY_PNG, 'png')
    served.set(GOYLE_GIF, 'gif')
    const mock = script(toolTurn(lookBoth), textTurn('左边是哈利。'))
    const events = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: lookSnapshot(),
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const next = mock.doStreamCalls[1]!
    expect(attachedPictures(next)).toEqual([HARRY_PNG])
    expect(promptText(next)).toContain(
      'Could not load 「img-9c0d1e 高尔 · 黑袍」',
    )
    expect(events.find((event) => event.type === 'step')).toMatchObject({
      step: { tool: 'read_state', status: 'done' },
    })
  })

  describe('画布上的视频卡（看图期第二段）', () => {
    const TAKE = 'https://cdn.test/s04b.mp4'
    const lookTake = {
      id: 'call_look',
      name: 'look',
      input: { cards: ['vid-4f6105'], question: '动作连贯吗' },
    }
    const withTake = () => ({
      prompt: '',
      canvas: canvas(true, { videoUrl: TAKE, hasOutput: true }),
      availableModels: [],
    })

    it('⭐ Gemini 看一张没被 @ 的视频卡：片子本体只附给下一次，跟在工具结果后面', async () => {
      clipsServed.set(TAKE, 3_000_000)
      preparedOnce({ adapterType: 'gemini', modelId: 'gemini-3-pro' }, [])
      const mock = script(toolTurn(lookTake), textTurn('中段停住了。'))
      await collect(
        runAssistantV3(
          'clerk-1',
          request({
            snapshot: withTake(),
          } as Partial<AssistantOperatorRequest>),
        ),
      )
      expect(attachedClips(mock.doStreamCalls[0]!)).toEqual([])
      const next = mock.doStreamCalls[1]!
      expect(attachedClips(next)).toEqual([TAKE])
      // 片子不进 functionResponse：tool 之后那条 user 里。
      const roles = next.prompt.map((message) => message.role)
      expect(roles.slice(-2)).toEqual(['tool', 'user'])
      expect(promptText(next)).toContain(
        'The clip itself comes with this result, for your next step only: 「vid-4f6105 冲出门」.',
      )
    })

    it('⭐ 别家看一张没被 @ 的视频卡：只回一句请创作者 @ 它，⛔ 不下片子、不借 Gemini', async () => {
      clipsServed.set(TAKE, 3_000_000)
      preparedOnce({ adapterType: 'openai', modelId: 'gpt-6-luna' }, [])
      const mock = script(toolTurn(lookTake), textTurn('请 @ 一下。'))
      const events = await collect(
        runAssistantV3(
          'clerk-1',
          request({
            snapshot: withTake(),
          } as Partial<AssistantOperatorRequest>),
        ),
      )
      expect(fetchAsBuffer).not.toHaveBeenCalled()
      expect(promptText(mock.doStreamCalls[1]!)).toContain(
        'is a clip you were not shown: you only watch clips the creator points at. Ask them to @ the clip in their message.',
      )
      // 什么都没看：不出过程行。
      expect(events.some((event) => event.type === 'step')).toBe(false)
    })

    it('被 @ 的视频卡：帧整轮在眼前，look 它按卡 id 认出「已经在你眼前」', async () => {
      preparedOnce({ adapterType: 'anthropic', modelId: 'claude-opus-5' }, [])
      const mock = script(toolTurn(lookTake), textTurn('好。'))
      await collect(
        runAssistantV3(
          'clerk-1',
          request({
            snapshot: withTake(),
            videoClips: [capturedClip(TAKE, '冲出门', 9, S04B)],
          } as Partial<AssistantOperatorRequest>),
        ),
      )
      expect(promptText(mock.doStreamCalls[0]!)).toContain(
        'CLIPS THE CREATOR POINTED AT (in order): 1 = clip 「冲出门」 (6 frames sampled across 9 s)',
      )
      expect(promptText(mock.doStreamCalls[1]!)).toContain(
        "Already in front of you in the creator's message: 「vid-4f6105 冲出门」 (clip 1 of CLIPS THE CREATOR POINTED AT).",
      )
      expect(fetchAsBuffer).not.toHaveBeenCalledWith(TAKE, expect.anything())
    })

    it('⛔ 看不了图的模型：被指着的片子一段也不摆、不下', async () => {
      preparedOnce(
        {
          adapterType: 'deepseek',
          modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
        },
        [],
      )
      const mock = script(textTurn('看不了。'))
      await collect(
        runAssistantV3(
          'clerk-1',
          request({
            snapshot: withTake(),
            videoClips: [capturedClip(TAKE, '冲出门', 9, S04B)],
          } as Partial<AssistantOperatorRequest>),
        ),
      )
      const prompt = promptText(mock.doStreamCalls[0]!)
      expect(prompt).not.toContain('CLIPS THE CREATOR POINTED AT')
      expect(attachedPictures(mock.doStreamCalls[0]!)).toEqual([])
      expect(fetchAsBuffer).not.toHaveBeenCalled()
    })
  })

  it('所选模型看不了图（DeepSeek V4 Pro）：look 只回一句换模型，⛔ 不附图、不借别家', async () => {
    preparedOnce(
      { adapterType: 'deepseek', modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO },
      [HARRY_PNG, GOYLE_PNG],
    )
    served.set(HARRY_PNG, 'png')
    const mock = script(toolTurn(lookBoth), textTurn('这个模型看不了图。'))
    const events = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: lookSnapshot(),
          mentionedAssets: [
            {
              id: 'gen-1',
              url: HARRY_PNG,
              label: '哈利 · 黑袍',
              nodeId: HARRY,
            },
          ],
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    // 图会下（读文件里的配方），但⛔ 一张都不附给模型。
    expect(plan).not.toHaveBeenCalled()
    expect(attachedPictures(mock.doStreamCalls[0]!)).toEqual([])
    const next = mock.doStreamCalls[1]!
    expect(attachedPictures(next)).toEqual([])
    expect(promptText(next)).toContain(
      'cannot see pictures, and no other provider is used in its place',
    )
    expect(events.some((event) => event.type === 'step')).toBe(false)
  })

  it.each([
    ['看得见图（GPT）', OPENAI],
    [
      '看不了图（DeepSeek V4 Pro）',
      {
        adapterType: 'deepseek',
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      },
    ],
  ])(
    '⭐ 被指着的自家作品：配方冻进板子（%s），按地址只查这个用户的库',
    async (_, route) => {
      preparedOnce(route as typeof OPENAI, [HARRY_PNG, GOYLE_PNG])
      served.set(HARRY_PNG, 'png')
      queryRaw.mockResolvedValue([
        {
          url: HARRY_PNG,
          thumbnailUrl: null,
          prompt: 'harry, black robe',
          negativePrompt: 'lowres',
          model: 'gemini-3-image',
          width: 832,
          height: 1216,
          seed: '7',
          advancedParams: null,
        },
      ])
      const mock = script(textTurn('配方在这。'))
      await collect(
        runAssistantV3(
          'clerk-1',
          request({
            snapshot: lookSnapshot(),
            mentionedAssets: [
              {
                id: 'gen-1',
                url: HARRY_PNG,
                label: '哈利 · 黑袍',
                nodeId: HARRY,
              },
            ],
          } as Partial<AssistantOperatorRequest>),
        ),
      )
      const text = promptText(mock.doStreamCalls[0]!)
      expect(text).toContain(
        'RECIPES THAT CAME WITH THE PICTURES THE CREATOR POINTED AT',
      )
      expect(text).toContain(
        "「哈利 · 黑袍」 — made here, the creator's own work:\\nharry, black robe\\nNegative prompt: lowres\\nSeed: 7, Size: 832x1216, Model: gemini-3-image",
      )
      const sql = queryRaw.mock.calls[0] as unknown as [
        TemplateStringsArray,
        ...unknown[],
      ]
      expect(sql.slice(1)).toContain('user-1')
    },
  )

  it('接力：本轮记录里只存图的地址与称呼；模型还没开口，下一跳照样附上', async () => {
    preparedOnce(OPENAI, [HARRY_PNG, GOYLE_PNG])
    preparedOnce(OPENAI, [HARRY_PNG])
    served.set(HARRY_PNG, 'png')
    const mock = script(
      toolTurn(
        {
          id: 'call_look',
          name: 'look',
          input: { cards: ['img-249e8b'], question: '是谁？' },
        },
        disconnectGoyle,
      ),
      textTurn('断开了；左边是哈利。'),
    )
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: S04B },
      observation: 'queued',
      apply: () => {},
    }))
    const first = await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: lookSnapshot(),
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const transcript = (
      first.find((event) => event.type === 'transcript') as {
        transcript: AssistantV3Transcript
      }
    ).transcript
    expect(
      transcript.find(
        (entry) => entry.type === 'result' && entry.tool === 'look',
      ),
    ).toMatchObject({
      images: [{ url: HARRY_PNG, label: 'img-249e8b 哈利 · 黑袍' }],
    })
    // ⛔ 字节不进记录（记录要发给前端接力）。
    expect(JSON.stringify(transcript)).not.toContain(
      Buffer.from(`png:${HARRY_PNG}`).toString('base64'),
    )

    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: lookSnapshot(false),
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
    expect(attachedPictures(mock.doStreamCalls[1]!)).toEqual([HARRY_PNG])
  })

  it('反问：多选原样透传；图片句柄换成这一轮手上的图，⛔ 不收模型写的地址；带 why', async () => {
    script(
      toolTurn({
        id: 'call_ask',
        name: 'ask',
        input: {
          questions: [
            {
              header: '出场',
              question: '这一镜谁出场？',
              multiSelect: true,
              allowOther: false,
              options: [
                {
                  label: '冲出门那张',
                  description: '你刚 @ 的那张',
                  recommended: true,
                  image: '冲出门',
                },
                {
                  label: '外链',
                  description: '模型自己写的地址',
                  recommended: false,
                  image: 'https://evil.test/x.png',
                },
                {
                  label: '没图',
                  description: '纯文字',
                  recommended: false,
                  image: null,
                },
              ],
            },
          ],
          why: '两张构图差很多',
        },
      }),
    )
    const events = await collect(
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
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    const ask = events.find((event) => event.type === 'ask')
    expect(ask).toMatchObject({
      type: 'ask',
      why: '两张构图差很多',
      questions: [
        {
          multiSelect: true,
          allowOther: false,
          options: [
            { label: '冲出门那张', assetUrl: 'https://cdn.test/result.png' },
            { label: '外链' },
            { label: '没图' },
          ],
        },
      ],
    })
    if (ask?.type !== 'ask') throw new Error('no ask event')
    expect(ask.questions[0]?.options[1]).not.toHaveProperty('assetUrl')
    expect(ask.questions[0]?.options[2]).not.toHaveProperty('assetUrl')
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

  /**
   * ⛔ 选定的模型那一家没绑 key：整轮不跑（五张脸都一样，判在共用的 `prepareOperatorTurn`），
   * 错误带厂商与型号，客户端就地弹那一家的配置框。⛔ 不交回旧内核、⛔ 不换一家接着跑。
   */
  it('选定的模型缺 key：整轮不跑、不碰任何一家的模型、不交回旧内核', async () => {
    vi.mocked(prepareOperatorTurn).mockRejectedValueOnce(
      new AssistantModelKeyMissingError(
        AI_ADAPTER_TYPES.ANTHROPIC,
        LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
      ),
    )
    const mock = script(textTurn('不该说出来的话'))

    const failure = await collect(runAssistantV3('clerk-1', request())).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(AssistantModelKeyMissingError)
    expect(failure).toMatchObject({
      errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
      adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    })
    expect(mock.doStreamCalls).toHaveLength(0)
    expect(resolveModel).not.toHaveBeenCalled()
    expect(legacy).not.toHaveBeenCalled()
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

/**
 * 每轮的过程记录（owner 2026-10-15「建表」）：每一跳收尾交一份草稿；号随本轮记录的板子那一条往返，
 * 接力同一个号、跳数加一。⛔ 隐身不记、⛔ 交回旧内核不记、⛔ 号不进模型看的东西。
 */
describe('v3 内核 · 每轮的过程记录', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  beforeEach(() => {
    plan.mockReset()
    legacy.mockReset()
    recordTurn.mockClear()
  })

  function draftOf(call = 0) {
    return recordTurn.mock.calls[call]?.[0] as {
      userId: string
      turnId: string
      hop: number
      outcome: string
      errorCode?: string
      request: AssistantOperatorRequest
      transcript: AssistantV3Transcript
      adapterType: string
      modelId: string
      apiKeyId: string | null
      systemPrompt: string
    }
  }

  function mutatePlan() {
    plan.mockImplementation(async (_run, _tool, args) => ({
      kind: 'mutate',
      payload: args,
      inverse: { op: 'batch', nodeRef: S04B },
      observation: 'queued',
      apply: () => {},
    }))
  }

  it('只回话：收尾交一份 —— 第一跳、新号、选的那一家与型号、系统提示、done', async () => {
    script(textTurn('好。'))
    const asked = request()
    await collect(runAssistantV3('clerk-1', asked))
    expect(recordTurn).toHaveBeenCalledTimes(1)
    const draft = draftOf()
    expect(draft).toMatchObject({
      userId: 'user-1',
      hop: 1,
      outcome: 'done',
      adapterType: 'openai',
      modelId: 'gpt-6-luna',
      apiKeyId: null,
      systemPrompt: 'SYSTEM',
      request: asked,
    })
    expect(draft.turnId).toMatch(UUID)
    expect(draft.errorCode).toBeUndefined()
    expect(draft.transcript[0]).toMatchObject({
      type: 'board',
      turn: { id: draft.turnId, hop: 1 },
    })
  })

  it('接力：同一个号、第二跳；第一跳记成 relay，号 ⛔ 不进模型看的东西', async () => {
    const mock = script(toolTurn(disconnectGoyle), textTurn('好了。'))
    mutatePlan()
    const first = await collect(runAssistantV3('clerk-1', request()))
    const transcript = (
      first.find((event) => event.type === 'transcript') as {
        transcript: AssistantV3Transcript
      }
    ).transcript
    expect(transcript[0]).toMatchObject({ turn: { hop: 1 } })
    expect(draftOf(0)).toMatchObject({ hop: 1, outcome: 'relay' })

    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: { prompt: '', canvas: canvas(false), availableModels: [] },
          v3: { transcript },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(recordTurn).toHaveBeenCalledTimes(2)
    expect(draftOf(1)).toMatchObject({
      turnId: draftOf(0).turnId,
      hop: 2,
      outcome: 'done',
    })
    expect(draftOf(1).transcript[0]).toMatchObject({
      turn: { id: draftOf(0).turnId, hop: 2 },
    })
    for (const call of mock.doStreamCalls)
      expect(promptText(call)).not.toContain(draftOf(0).turnId)
  })

  it('接力的板子丢了号（老客户端）：另起一个号，跳数照样 > 1', async () => {
    script(textTurn('好了。'))
    const board = {
      type: 'board',
      text: 'BOARD',
      images: [],
    } as unknown as AssistantV3Transcript[number]
    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          v3: { transcript: [board] },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(draftOf()).toMatchObject({ hop: 2, outcome: 'done' })
    expect(draftOf().turnId).toMatch(UUID)
  })

  it('两次空回复记成 empty；审核拦下记成 content_filter', async () => {
    const empty: LanguageModelV3StreamPart[] = [
      {
        type: 'finish',
        finishReason: { unified: 'other', raw: undefined },
        usage,
      },
    ]
    script(empty, empty)
    await collect(runAssistantV3('clerk-1', request()))
    expect(draftOf(0)).toMatchObject({ outcome: 'empty' })

    script([
      {
        type: 'finish',
        finishReason: { unified: 'content-filter', raw: 'PROHIBITED_CONTENT' },
        usage,
      },
    ])
    await collect(runAssistantV3('clerk-1', request()))
    expect(draftOf(1)).toMatchObject({ outcome: 'content_filter' })
  })

  it('出确认卡停住：awaiting_confirm', async () => {
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
    await collect(runAssistantV3('clerk-1', request()))
    expect(draftOf()).toMatchObject({ outcome: 'awaiting_confirm', hop: 1 })
  })

  it('跑到一半抛错：照样记一笔，带错误码，错照样往外抛', async () => {
    const mock = new MockLanguageModelV3({
      doStream: async () => {
        throw new Error('boom')
      },
    })
    model.current = mock
    const failure = await collect(runAssistantV3('clerk-1', request())).catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(recordTurn).toHaveBeenCalledTimes(1)
    expect(draftOf()).toMatchObject({ outcome: 'error' })
    expect(draftOf().errorCode).toEqual(expect.any(String))
  })

  it('隐身：⛔ 不记', async () => {
    script(textTurn('好。'))
    await collect(
      runAssistantV3(
        'clerk-1',
        request({ incognito: true } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect(recordTurn).not.toHaveBeenCalled()
  })

  it('交回旧内核 / 开跑前就失败：⛔ 不记', async () => {
    legacy.mockImplementation(async function* () {
      yield { type: 'done' }
    })
    await collect(
      runAssistantV3(
        'clerk-1',
        request({
          snapshot: { prompt: '', availableModels: [] },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    vi.mocked(prepareOperatorTurn).mockRejectedValueOnce(
      new AssistantModelKeyMissingError(
        AI_ADAPTER_TYPES.ANTHROPIC,
        LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5,
      ),
    )
    await collect(runAssistantV3('clerk-1', request())).catch(() => undefined)
    expect(recordTurn).not.toHaveBeenCalled()
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

  function preparedWith(prompt: string, modelId: string) {
    const run = {
      stepSeq: 0,
      signal: undefined,
      inspectedCanvasReferences: null,
      skipReferenceReview: false,
      state: { referenceUrls: [], prompt, negativePrompt: 'lowres' },
    }
    vi.mocked(prepareOperatorTurn).mockImplementationOnce(
      async (_clerkId, request) =>
        ({
          request,
          user: { id: 'user-1', displayName: null, username: null },
          persona: { language: 'ui' },
          rules: [],
          route: { adapterType: 'openai', providerConfig: {}, apiKey: 'k' },
          modelId,
          run,
        }) as never,
    )
    return run
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

  it('LoRA 台：search_library 也开 web_images / web_videos（lora 那一种照旧）', async () => {
    preparedWith('typhoeus, 1girl', 'gpt-6-luna')
    plan.mockResolvedValue({
      kind: 'rejected',
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
      detail: 'ok',
    })
    script(
      toolTurn(
        {
          id: 'call_videos',
          name: 'search_library',
          input: { query: 'typhoeus dance', kind: 'web_videos', subject: null },
        },
        {
          id: 'call_images',
          name: 'search_library',
          input: { query: 'snow scene', kind: 'web_images', subject: null },
        },
      ),
      textTurn('找到了。'),
    )
    await collect(runAssistantV3('clerk-1', loraRequest('找点参考')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'search_web_videos',
      { query: 'typhoeus dance' },
      'user-1',
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'search_web_images',
      { query: 'snow scene' },
      'user-1',
    )
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

  it('写词不另看参考图（skipReferenceReview）；look sample 只指给板子上那张，⛔ 不重附', async () => {
    const run = preparedWith('typhoeus, 1girl', 'gpt-6-luna')
    served.set(SAMPLE, 'png')
    const mock = script(
      toolTurn({
        id: 'call_look',
        name: 'look',
        input: { images: ['sample'], question: '画风像吗' },
      }),
      textTurn('像。'),
    )
    await collect(runAssistantV3('clerk-1', loraRequest('和示例画风像吗')))
    expect(run.skipReferenceReview).toBe(true)
    expect(plan).not.toHaveBeenCalled()
    const next = mock.doStreamCalls[1]!
    expect(promptText(next)).toContain(
      "Already in front of you in the creator's message: 「sample」 (picture 1 of IMAGES THE CREATOR POINTED AT)",
    )
    // 只有板子那一张：⛔ 不再附第二遍。
    expect(attachedPictures(next)).toEqual([SAMPLE])
  })

  /**
   * 「自动」时 `prepareOperatorTurn` 交来的就是「自动」挑的那一档（`resolveAssistantRoute`，与 chip
   * 上写的同一个 —— owner 2026-10-15「全跟助手」），⛔ 不再有「没有型号」那一态。
   */
  it('助手模型选「自动」也走 v3（型号就是「自动」挑的那一档），⛔ 不退回旧内核', async () => {
    preparedWith(
      'typhoeus, 1girl',
      pickAutoAssistantRouteModel([AI_ADAPTER_TYPES.OPENAI])!.modelId,
    )
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

  it('图片台：search_library kind web_videos 走联网找视频，只给查询词', async () => {
    const video = {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Changli PV',
      platform: 'youtube',
      channel: 'Wuthering Waves',
      domain: 'youtube.com',
      durationSeconds: 209,
    }
    plan.mockResolvedValue({
      kind: 'read',
      payload: { query: 'changli trailer', limit: 8, bilibili: false },
      run: async () => ({
        result: { totalFound: 1, videos: [video] },
        observation:
          'Web video search "changli trailer" → 1 video(s):\n  #1 · Changli PV · Wuthering Waves · YouTube · 3:29',
      }),
    })
    const mock = script(
      toolTurn({
        id: 'call_videos',
        name: 'search_library',
        input: { query: 'changli trailer', kind: 'web_videos', subject: null },
      }),
      textTurn('找到了。'),
    )
    const events = await collect(
      runAssistantV3('clerk-1', imageRequest('找一下长离的 PV')),
    )
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'search_web_videos',
      { query: 'changli trailer' },
      'user-1',
    )
    // 整张卡片随步下发（面板画那一排），过了步骤帧的 schema。
    const done = events.find(
      (event) => event.type === 'step' && event.step.status === 'done',
    )
    expect(done).toMatchObject({
      step: {
        tool: 'search_web_videos',
        title: '联网找视频 changli trailer',
        result: { totalFound: 1, videos: [video] },
      },
    })
    // 模型读到的是那一行，⛔ 不是地址。
    const next = promptText(mock.doStreamCalls[1]!)
    expect(next).toContain('#1 · Changli PV · Wuthering Waves · YouTube · 3:29')
    // 工具描述里写着这一种：模型知道什么时候用它。
    expect(JSON.stringify(mock.doStreamCalls[0]!.tools)).toContain('web_videos')
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
      input: {
        goal: '艾弥丝的英文名',
        entities: ['艾弥丝'],
        onlySources,
        depth: null,
        x: null,
      },
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

  it('search_web 的深入档与 X 收窄照传：账号去掉 @，认不得的账号与日期丢掉', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'search_web',
        input: {
          goal: '这周发的新图',
          entities: [],
          onlySources: null,
          depth: 'deep',
          x: {
            handles: ['@artist_a', 'not a handle!'],
            fromDate: '2026-10-07',
            toDate: 'next week',
          },
        },
      }),
      textTurn('查到了。'),
    )
    await collect(
      runAssistantV3(
        'clerk-1',
        imageRequest('@artist_a 这周在 X 上发了什么图'),
      ),
    )
    expect(plan).toHaveBeenLastCalledWith(
      expect.anything(),
      'research',
      {
        goal: '这周发的新图',
        depth: 'deep',
        x: { handles: ['artist_a'], fromDate: '2026-10-07' },
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

  it('角色页：search_library kind web_videos 走联网找视频（web_images 那一跳不受影响）', async () => {
    plan.mockResolvedValue({
      kind: 'rejected',
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
      detail: 'ok',
    })
    script(
      toolTurn({
        id: 'call_videos',
        name: 'search_library',
        input: { query: '罗恩 采访', kind: 'web_videos', subject: null },
      }),
      textTurn('找到了。'),
    )
    await collect(runAssistantV3('clerk-1', cardsRequest('找几个罗恩的视频')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'search_web_videos',
      { query: '罗恩 采访' },
      'user-1',
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

  it('read 一个网址就读那一页；look card 指给板子上那几张，⛔ 不另起 check_character_look', async () => {
    served.set('https://cdn.test/ron.png', 'png')
    const mock = script(
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
    expect(plan).toHaveBeenCalledTimes(1)
    const next = promptText(mock.doStreamCalls[1]!)
    expect(next).toContain(
      "Already in front of you in the creator's message: 「card-1」 (picture 1 of IMAGES THE CREATOR POINTED AT)",
    )
    expect(next).toContain('only who they are counts')
  })

  /**
   * ⭐ 联网找图的候选交给**主模型自己看**（owner 2026-10-15「一种看法」）：缩略图当一次 look
   * 附给紧跟着的那一步，⛔ 不另起看缩略图的子调用、⛔ 不借别家的 key。
   */
  describe('联网找图：候选交给主模型自己看', () => {
    const CARD_PNG = 'https://cdn.test/ron.png'
    const searchRon = {
      id: 'call_search',
      name: 'search_library',
      input: { query: '罗恩', kind: 'web_images', subject: '哈利波特 罗恩' },
    }
    const readWiki = {
      id: 'call_read',
      name: 'read',
      input: { items: ['https://harrypotter.fandom.com/wiki/Ronald_Weasley'] },
    }

    function candidate(index: number, extra: Record<string, unknown> = {}) {
      return {
        n: index,
        imageUrl: `https://img.test/full-${index}.jpg`,
        thumbnailUrl: `https://thumb.test/${index}.png`,
        pageUrl: `https://site.test/${index}`,
        domain: 'site.test',
        usableAsInput: true,
        sourceVerdict: 'allowed',
        ...extra,
      }
    }

    function preparedCards(route: { adapterType: string; modelId: string }) {
      const cardsRun = {
        stepSeq: 0,
        signal: undefined,
        inspectedCanvasReferences: null,
        state: { referenceUrls: [], prompt: '' },
      }
      vi.mocked(prepareOperatorTurn).mockImplementationOnce(
        async (_clerkId, request) =>
          ({
            request,
            user: { id: 'user-1', displayName: null, username: null },
            persona: { language: 'ui' },
            rules: [],
            route: {
              adapterType: route.adapterType,
              providerConfig: {},
              apiKey: `${route.adapterType}-key`,
            },
            modelId: route.modelId,
            run: cardsRun,
          }) as never,
      )
      return cardsRun
    }

    /** 旧执行器那一跳：搜图交回这几张候选；读网页随便回一句。 */
    function searchReturns(images: ReturnType<typeof candidate>[]) {
      plan.mockImplementation(async (_run: unknown, tool: string) =>
        tool === 'search_web_images'
          ? {
              kind: 'read',
              payload: { query: '罗恩', limit: 8 },
              run: async () => ({
                result: { totalFound: images.length, images },
                observation: `find_images("罗恩") → ${images.length} PREVIEW candidate(s) shown to the creator.`,
              }),
            }
          : {
              kind: 'rejected',
              reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
              detail: 'ok',
            },
      )
    }

    it('⭐ 能看图：缩略图只附给紧跟着的那一步；挂不上的排在后面看小预览；一张下不来只点名那一张', async () => {
      const cardsRun = preparedCards({
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        modelId: 'gpt-6-luna',
      })
      served.set(CARD_PNG, 'png')
      served.set('https://thumb.test/1.png', 'png')
      served.set('https://img.test/full-3.jpg', 'jpeg')
      served.set('https://thumb.test/2.png', 'png')
      searchReturns([
        candidate(1),
        // 站方不许当输入（pixiv 一类）：挂不上卡，排在后面只看小预览。
        candidate(2, { usableAsInput: false, sourceVerdict: 'blocked' }),
        // 挂不上、也没有小预览：⛔ 不看。
        candidate(5, {
          usableAsInput: false,
          sourceVerdict: 'blocked',
          thumbnailUrl: undefined,
        }),
        // 没缩略图就看原图。
        candidate(3, { thumbnailUrl: undefined }),
        // 缩略图下不来：只点名这一张。
        candidate(4),
      ])
      const mock = script(
        toolTurn(searchRon),
        toolTurn(readWiki),
        textTurn('#1 和 #3 是罗恩。'),
      )

      const events = await collect(
        runAssistantV3('clerk-1', cardsRequest('上网找几张罗恩的图')),
      )

      expect(plan).toHaveBeenCalledWith(
        expect.objectContaining({ mainModelLooks: true }),
        'search_web_images',
        { query: '罗恩', subject: '哈利波特 罗恩', preferOfficial: true },
        'user-1',
      )
      expect(cardsRun).toMatchObject({ mainModelLooks: true })
      expect(fetchAsBuffer).not.toHaveBeenCalledWith(
        'https://img.test/full-2.jpg',
        expect.anything(),
      )
      expect(fetchAsBuffer).not.toHaveBeenCalledWith(
        'https://img.test/full-5.jpg',
        expect.anything(),
      )
      const [before, next, after] = mock.doStreamCalls
      // 板子上那张卡图一直在；候选只在紧跟着的那一步。
      expect(attachedPictures(before!)).toEqual([CARD_PNG])
      expect(attachedPictures(next!)).toEqual([
        CARD_PNG,
        'https://thumb.test/1.png',
        'https://img.test/full-3.jpg',
        'https://thumb.test/2.png',
      ])
      expect(attachedPictures(after!)).toEqual([CARD_PNG])
      const nextText = promptText(next!)
      expect(nextText).toContain('PREVIEW candidate(s)')
      expect(nextText).toContain('1 = 「#1」')
      expect(nextText).toContain('2 = 「#3」')
      expect(nextText).toContain('3 = 「#2」')
      expect(nextText).toContain(
        "「#2」 is only the search engine's small preview",
      )
      expect(nextText).toContain(
        '#2 can only be opened on their own pages: you may judge them and name them, but never propose them.',
      )
      expect(nextText).not.toContain('「#5」')
      expect(nextText).toContain('Could not load 「#4」')
      expect(nextText).toContain('Which of these web pictures show 罗恩?')
      expect(nextText).toContain('compare them with their own pictures')
      expect(nextText).not.toContain('Nobody looked')
      expect(promptText(after!)).toContain('for your next step only')
      // 过程行：搜一行、看一行（看的是哪几张）。
      const titles = events.flatMap((event) =>
        event.type === 'step' && event.step.status === 'done'
          ? [event.step.title]
          : [],
      )
      expect(titles).toContain('联网找图 罗恩')
      expect(titles).toEqual([
        '联网找图 罗恩',
        '查看「候选 #1」；查看「候选 #3」 等 2 项',
      ])
      expectSelectedProviderOnly(providerUsesOf(resolveModel, 'main model'), {
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        apiKey: 'openai-key',
      })
    })

    it('一次最多看 maxLookCards 张：多出来的照实点名，⛔ 不悄悄丢', async () => {
      preparedCards({
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        modelId: 'gpt-6-luna',
      })
      const images = Array.from({ length: 8 }, (_, index) =>
        candidate(index + 1),
      )
      for (const image of images) served.set(image.thumbnailUrl, 'png')
      searchReturns(images)
      const mock = script(toolTurn(searchRon), textTurn('看了前六张。'))

      await collect(runAssistantV3('clerk-1', cardsRequest('上网找罗恩的图')))

      const next = mock.doStreamCalls[1]!
      expect(attachedPictures(next)).toEqual(
        images.slice(0, 6).map((image) => image.thumbnailUrl),
      )
      expect(promptText(next)).toContain(
        'Only the first 6 pictures were looked at; 「#7」, 「#8」 were not',
      )
    })

    /** 搜索期第三片：交给角色卡按号（`#2`），服务端换回原图地址；写地址的那一项拒掉。 */
    it('propose_images 按号交：find "#2" 换回那张原图；写成地址的拒掉并说清楚', async () => {
      preparedCards({
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        modelId: 'gpt-6-luna',
      })
      searchReturns([candidate(1), candidate(2)])
      const propose = (find: string) => ({
        id: `call_propose_${find.length}`,
        name: 'edit',
        input: {
          ops: [
            {
              op: 'propose_images',
              character: 'char-b27ce8',
              say: '这两张是罗恩。',
              images: [{ asset: null, find, reason: '正面全身' }],
            },
          ],
        },
      })
      const mock = script(
        toolTurn(searchRon),
        toolTurn(propose('https://img.test/full-2.jpg')),
        toolTurn(propose('#2')),
        textTurn('交给你挑了。'),
      )

      await collect(runAssistantV3('clerk-1', cardsRequest('上网找罗恩的图')))

      expect(promptText(mock.doStreamCalls[2]!)).toContain(
        'is not a web find number: write the number from the search results',
      )
      expect(plan).toHaveBeenCalledWith(
        expect.anything(),
        'propose_character_images',
        {
          characterId: RON,
          images: [
            { imageUrl: 'https://img.test/full-2.jpg', reason: '正面全身' },
          ],
        },
        'user-1',
      )
    })

    it('所选模型看不了图（DeepSeek V4 Pro）：照实说没人看过、只凭标题，⛔ 不下图、不借别家', async () => {
      preparedCards({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      })
      served.set(CARD_PNG, 'png')
      served.set('https://thumb.test/1.png', 'png')
      searchReturns([candidate(1), candidate(2)])
      const mock = script(toolTurn(searchRon), textTurn('只凭标题挑了一张。'))

      const events = await collect(
        runAssistantV3('clerk-1', cardsRequest('上网找几张罗恩的图')),
      )

      expect(fetchAsBuffer).not.toHaveBeenCalled()
      const next = mock.doStreamCalls[1]!
      expect(attachedPictures(next)).toEqual([])
      expect(promptText(next)).toContain(
        'Nobody looked at these candidates: the assistant model the creator picked cannot see pictures, and no other provider is used in its place',
      )
      expect(promptText(next)).toContain('picked them by title only')
      // 只有搜图那一行，⛔ 没有「查看」那一行。
      expect(
        events.flatMap((event) =>
          event.type === 'step' && event.step.status === 'done'
            ? [event.step.tool]
            : [],
        ),
      ).toEqual(['search_web_images'])
      expectSelectedProviderOnly(providerUsesOf(resolveModel, 'main model'), {
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        apiKey: 'deepseek-key',
      })
    })
  })
})

describe('v3 内核 · 视频台', () => {
  const run = {
    stepSeq: 0,
    signal: undefined,
    inspectedCanvasReferences: null,
    state: { referenceUrls: [], prompt: '' },
  }

  function videoRequest(message: string): AssistantOperatorRequest {
    return {
      workspaceKey: 'video',
      domain: 'video',
      messages: [{ role: 'user', content: message }],
      snapshot: {
        prompt: '她转身冲出包厢门',
        model: {
          id: 'key:seedance-2.5',
          label: 'Seedance 2.5',
          catalogId: 'seedance-2.5',
        },
        availableModels: [{ id: 'key:seedance-2.5', label: 'Seedance 2.5' }],
        videoSpecs: {
          durationSeconds: 5,
          aspectRatio: '16:9',
          resolution: '720p',
          durationOptions: [5, 10],
          aspectRatioOptions: ['16:9', '9:16'],
          resolutionOptions: ['720p', '1080p'],
          aspectRatioLock: '16:9',
        },
        frameReferences: {
          slots: 2,
          first: { url: 'https://cdn.test/f.png', label: '包厢' },
        },
        audioReferences: { items: [], limit: 2, requiresVisual: true },
        sound: { value: null, effective: true },
      },
      mentionedAssets: [
        { id: 'asset-door', url: 'https://cdn.test/door.png', label: '门口' },
      ],
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
    plan.mockResolvedValue({
      kind: 'rejected',
      reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
      detail: 'already so',
    })
  })

  it('视频台：search_library kind web_videos 走联网找视频', async () => {
    script(
      toolTurn({
        id: 'call_videos',
        name: 'search_library',
        input: { query: 'dance reference', kind: 'web_videos', subject: null },
      }),
      textTurn('找到了。'),
    )
    await collect(runAssistantV3('clerk-1', videoRequest('找个舞蹈参考')))
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'search_web_videos',
      { query: 'dance reference' },
      'user-1',
    )
  })

  it('板子印出时长 / 首帧锁的画幅 / 首尾帧 / 声音参考 / 原声开关', async () => {
    const mock = script(textTurn('好。'))
    await collect(runAssistantV3('clerk-1', videoRequest('台上设了什么')))
    const prompt = promptText(mock.doStreamCalls[0]!)
    expect(prompt).toContain('VIDEO WORKBENCH')
    expect(prompt).toContain('length 5s (options: 5, 10)')
    expect(prompt).toContain('the first frame pins the aspect ratio to 16:9')
    expect(prompt).toContain('first set \\"包厢\\" · last empty')
    expect(prompt).toContain(
      'this channel needs a picture mounted with any voice',
    )
    expect(prompt).toContain(
      'Soundtrack: untouched (this model makes sound by default)',
    )
    expect(legacy).not.toHaveBeenCalled()
  })

  it('改时长、挂尾帧、卸首帧、挂声音、关原声：交给旧执行器的那几步', async () => {
    script(
      toolTurn({
        id: 'call_1',
        name: 'edit',
        input: {
          ops: [
            {
              op: 'set_specs',
              duration: 10,
              aspectRatio: null,
              resolution: null,
            },
            { op: 'mount_reference', asset: '门口', slot: 'last' },
            { op: 'unmount_reference', ref: 'first' },
            { op: 'mount_audio', asset: 'asset-voice', owner: '女德拉科' },
            { op: 'set_sound', enabled: false },
          ],
        },
      }),
      textTurn('改好了。'),
    )
    await collect(
      runAssistantV3('clerk-1', videoRequest('改成十秒，门口当尾帧')),
    )
    const calls = plan.mock.calls.map((call) => [call[1], call[2]])
    expect(calls).toEqual([
      ['set_video_specs', { durationSeconds: 10 }],
      ['mount_reference', { assetId: 'asset-door', slot: 'last' }],
      ['unmount_reference', { slot: 'first' }],
      [
        'mount_audio_reference',
        { assetId: 'asset-voice', ownerName: '女德拉科' },
      ],
      ['set_sound', { enabled: false }],
    ])
  })

  /**
   * 这一轮的模型路由，⭐ 并且过一遍**真的**媒体闸（`assertAssistantMediaRoute`，旧内核
   * `prepareOperatorTurn` 里那道「媒体直传只认 Gemini」）：客户端照旧把 📎 的片子放在
   * `mediaAttachments` 里发上来，v3 必须先摘掉它，别家才进得来。
   */
  function routeOnce(adapterType: AI_ADAPTER_TYPES, modelId: string) {
    vi.mocked(prepareOperatorTurn).mockImplementationOnce(
      async (_clerkId, request) => {
        assertAssistantMediaRoute(request.mediaAttachments ?? [], adapterType)
        return {
          request,
          user: { id: 'user-1', displayName: null, username: null },
          persona: { language: 'ui' },
          rules: [],
          route: { adapterType, providerConfig: {}, apiKey: 'k' },
          modelId,
          run,
        } as never
      },
    )
  }

  const CLIP = 'https://cdn.test/clip.mp4'

  /** 创作者 📎 了一段片子、又 @ 了一张图，问动作连不连贯。 */
  function clipRequest(): AssistantOperatorRequest {
    const base = videoRequest('这段片子动作连贯吗')
    return {
      ...base,
      mentionedAssets: [
        ...(base.mentionedAssets ?? []),
        { id: 'asset-pose', url: 'https://cdn.test/pose.png', label: '姿势' },
      ],
      mediaAttachments: [{ kind: 'video', url: CLIP, label: '冲出门' }],
      videoClips: [capturedClip(CLIP, '冲出门', 5)],
    } as unknown as AssistantOperatorRequest
  }

  for (const [adapterType, modelId] of [
    [AI_ADAPTER_TYPES.OPENAI, 'gpt-6-luna'],
    [AI_ADAPTER_TYPES.ANTHROPIC, 'claude-opus-5'],
    [AI_ADAPTER_TYPES.XAI, 'grok-5'],
  ] as const)
    it(`⭐ ${adapterType}：被指着的片子过得了真媒体闸，帧整轮在眼前、逐帧标好；look 它只指过去，⛔ 不走看片评审`, async () => {
      served.set('https://cdn.test/pose.png', 'png')
      routeOnce(adapterType, modelId)
      const mock = script(
        toolTurn({
          id: 'call_look',
          name: 'look',
          input: { images: ['冲出门', '姿势'], question: '动作连贯吗' },
        }),
        textTurn('中段停住了。'),
      )
      const events = await collect(runAssistantV3('clerk-1', clipRequest()))
      expect(events.some((event) => event.type === 'error')).toBe(false)
      // 摘掉的是视频附件：旧内核那道闸看到的已经没有它了。
      expect(
        vi.mocked(prepareOperatorTurn).mock.lastCall?.[1].mediaAttachments,
      ).toEqual([])
      expect(legacy).not.toHaveBeenCalled()

      const first = mock.doStreamCalls[0]!
      const prompt = promptText(first)
      expect(prompt).toContain(
        'CLIPS THE CREATOR POINTED AT (in order): 1 = clip 「冲出门」 (4 frames sampled across 5 s)',
      )
      expect(prompt).toContain('clip 「冲出门」 · frame 1/4 at 0.6 s')
      expect(prompt).toContain('clip 「冲出门」 · frame 4/4 at 4.4 s')
      expect(
        attachedPictures(first).filter((url) => url.startsWith(CLIP)),
      ).toEqual([0, 1, 2, 3].map((index) => `${CLIP}#${index}`))
      // 帧档⛔ 不下片子本体。
      expect(attachedClips(first)).toEqual([])
      expect(fetchAsBuffer).not.toHaveBeenCalledWith(CLIP, expect.anything())

      const next = promptText(mock.doStreamCalls[1]!)
      expect(next).toContain(
        "Already in front of you in the creator's message: 「冲出门」 (clip 1 of CLIPS THE CREATOR POINTED AT).",
      )
      expect(next).toContain(
        "Already in front of you in the creator's message: 「姿势」",
      )
      // 帧整轮都在：第二次调用的第一条消息里照样有。
      expect(
        attachedPictures(mock.doStreamCalls[1]!).filter((url) =>
          url.startsWith(CLIP),
        ),
      ).toHaveLength(4)
    })

  it('⛔ 没摘的话这道闸就把别家整轮拒掉（这条用例守着上面那条摘法）', () => {
    expect(() =>
      assertAssistantMediaRoute([{ kind: 'video' }], AI_ADAPTER_TYPES.OPENAI),
    ).toThrow('A Gemini key analyzes video directly')
    expect(() =>
      assertAssistantMediaRoute([{ kind: 'video' }], AI_ADAPTER_TYPES.GEMINI),
    ).not.toThrow()
  })

  it('⭐ Gemini：被指着的片子在内联上限内交片子本体，⛔ 不用帧', async () => {
    clipsServed.set(CLIP, 2_000_000)
    routeOnce(AI_ADAPTER_TYPES.GEMINI, 'gemini-3-pro')
    const mock = script(textTurn('中段停住了。'))
    await collect(runAssistantV3('clerk-1', clipRequest()))
    const first = mock.doStreamCalls[0]!
    expect(promptText(first)).toContain(
      'CLIPS THE CREATOR POINTED AT (in order): 1 = clip 「冲出门」 (the clip itself)',
    )
    expect(attachedClips(first)).toEqual([CLIP])
    expect(
      attachedPictures(first).filter((url) => url.startsWith(CLIP)),
    ).toEqual([])
  })

  it('Gemini：片子超过内联上限就改用帧', async () => {
    clipsServed.set(CLIP, 21 * 1024 * 1024)
    routeOnce(AI_ADAPTER_TYPES.GEMINI, 'gemini-3-pro')
    const mock = script(textTurn('好。'))
    await collect(runAssistantV3('clerk-1', clipRequest()))
    const first = mock.doStreamCalls[0]!
    expect(attachedClips(first)).toEqual([])
    expect(
      attachedPictures(first).filter((url) => url.startsWith(CLIP)),
    ).toHaveLength(4)
  })

  it('视频台挂着、没被抽帧的参考视频（video-N）：别家只回一句请创作者 @ 它', async () => {
    routeOnce(AI_ADAPTER_TYPES.OPENAI, 'gpt-6-luna')
    const base = videoRequest('参考视频里的人动作快吗')
    const mock = script(
      toolTurn({
        id: 'call_look',
        name: 'look',
        input: { images: ['video-1'], question: '动作快吗' },
      }),
      textTurn('请 @ 一下那段片子。'),
    )
    await collect(
      runAssistantV3('clerk-1', {
        ...base,
        snapshot: {
          ...base.snapshot,
          videoReferences: { items: [{ url: CLIP }], limit: 3 },
        },
      } as AssistantOperatorRequest),
    )
    expect(fetchAsBuffer).not.toHaveBeenCalledWith(CLIP, expect.anything())
    expect(promptText(mock.doStreamCalls[1]!)).toContain(
      '「video-1」 is a clip you were not shown: you only watch clips the creator points at. Ask them to @ the clip in their message.',
    )
  })

  /* ── 挂着 ≠ 每轮都看（owner 2026-10-15）：视频台上只是挂着的参考视频，look 它才摆 ── */

  const MOUNTED = 'https://cdn.test/mounted.mp4'

  /** 视频台上挂着一段参考视频（video-1），浏览器照常把它的帧随请求带来（标 `mounted`）。 */
  function mountedRequest(message: string): AssistantOperatorRequest {
    const base = videoRequest(message)
    return {
      ...base,
      snapshot: {
        ...base.snapshot,
        videoReferences: { items: [{ url: MOUNTED, label: '转身' }], limit: 3 },
      },
      videoClips: [{ ...capturedClip(MOUNTED, 'video-1', 5), mounted: true }],
    } as unknown as AssistantOperatorRequest
  }

  for (const [adapterType, modelId] of [
    [AI_ADAPTER_TYPES.OPENAI, 'gpt-6-luna'],
    [AI_ADAPTER_TYPES.GEMINI, 'gemini-3-pro'],
  ] as const)
    it(`⭐ ${adapterType}：挂着的参考视频没人看就一个 token 也不花 —— 板子上只有名字，⛔ 不摆帧、不下片子`, async () => {
      clipsServed.set(MOUNTED, 2_000_000)
      routeOnce(adapterType, modelId)
      const mock = script(textTurn('好。'))
      await collect(runAssistantV3('clerk-1', mountedRequest('写得再紧一点')))
      expect(mock.doStreamCalls).toHaveLength(1)
      const first = mock.doStreamCalls[0]!
      const prompt = promptText(first)
      expect(prompt).toContain('Reference videos: 1 of 3 — video-1')
      expect(prompt).not.toContain('CLIPS THE CREATOR POINTED AT (in order)')
      expect(prompt).not.toContain('clip 「video-1」')
      expect(
        attachedPictures(first).filter((url) => url.startsWith(MOUNTED)),
      ).toEqual([])
      expect(attachedClips(first)).toEqual([])
      expect(fetchAsBuffer).not.toHaveBeenCalledWith(MOUNTED, expect.anything())
    })

  it('⭐ 别家 look 挂着的 video-1：带来的帧只摆给下一步，再下一步就没了（不用 @）', async () => {
    served.set('https://cdn.test/door.png', 'png')
    routeOnce(AI_ADAPTER_TYPES.OPENAI, 'gpt-6-luna')
    const mock = script(
      toolTurn({
        id: 'call_look',
        name: 'look',
        input: { images: ['video-1'], question: '她转身快吗' },
      }),
      toolTurn({
        id: 'call_door',
        name: 'look',
        input: { images: ['门口'], question: '门口在哪' },
      }),
      textTurn('转身偏慢。'),
    )
    await collect(
      runAssistantV3('clerk-1', mountedRequest('参考视频里她转身快吗')),
    )
    const [before, next, after] = mock.doStreamCalls
    const framesOf = (call: LanguageModelV3CallOptions) =>
      attachedPictures(call).filter((url) => url.startsWith(MOUNTED))
    expect(framesOf(before!)).toEqual([])
    expect(framesOf(next!)).toEqual(
      [0, 1, 2, 3].map((index) => `${MOUNTED}#${index}`),
    )
    expect(promptText(next!)).toContain(
      'Frames sampled from 「video-1」 (4 frames sampled across 5 s) come with this result, for your next step only.',
    )
    expect(promptText(next!)).toContain('clip 「video-1」 · frame 1/4 at 0.6 s')
    expect(framesOf(after!)).toEqual([])
    expect(fetchAsBuffer).not.toHaveBeenCalledWith(MOUNTED, expect.anything())
  })

  it('Gemini look 挂着的 video-1：下片子本体，只附给下一步', async () => {
    clipsServed.set(MOUNTED, 2_000_000)
    routeOnce(AI_ADAPTER_TYPES.GEMINI, 'gemini-3-pro')
    const mock = script(
      toolTurn({
        id: 'call_look',
        name: 'look',
        input: { images: ['video-1'], question: '她转身快吗' },
      }),
      textTurn('转身偏慢。'),
    )
    await collect(
      runAssistantV3('clerk-1', mountedRequest('参考视频里她转身快吗')),
    )
    const [before, next] = mock.doStreamCalls
    expect(attachedClips(before!)).toEqual([])
    expect(attachedClips(next!)).toEqual([MOUNTED])
  })

  it('清晰度是花钱的那一格：创作者没提就不改，提了照改', async () => {
    const specs = {
      id: 'call_1',
      name: 'edit',
      input: {
        ops: [
          {
            op: 'set_specs',
            duration: 5,
            aspectRatio: null,
            resolution: '1080p',
          },
        ],
      },
    }
    script(toolTurn(specs), textTurn('好。'))
    await collect(runAssistantV3('clerk-1', videoRequest('写这个镜头，5 秒')))
    expect(plan).toHaveBeenLastCalledWith(
      expect.anything(),
      'set_video_specs',
      { durationSeconds: 5 },
      'user-1',
    )
    script(toolTurn(specs), textTurn('好。'))
    await collect(runAssistantV3('clerk-1', videoRequest('清晰度改成 1080p')))
    expect(plan).toHaveBeenLastCalledWith(
      expect.anything(),
      'set_video_specs',
      { durationSeconds: 5, resolution: '1080p' },
      'user-1',
    )
  })
})

/**
 * ⭐ 搜索期第三片（附录 I §二 6 / 7、§3.3）：找到的图与视频一条连号 `#n`，模型只拿编号那一行、
 *   按号办事（服务端换回那一张）；上一轮的那几条带进这一轮；查证的整段摘录只给紧跟着的那一步。
 */
describe('v3 内核 · 找到的东西编号 #n 与查证短版（搜索期第三片）', () => {
  function freshRun() {
    return {
      stepSeq: 0,
      signal: undefined,
      inspectedCanvasReferences: null,
      skipReferenceReview: false,
      state: { referenceUrls: [], prompt: '' },
      webImageIndex: new Map<string, unknown>(),
      webFindSeq: 1,
      evidenceCiteSeq: 1,
      researchSnippets: new Map<string, { title: string; snippet: string }>(),
    }
  }
  let run = freshRun()

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
        ],
        specs: {
          quality: null,
          preview: null,
          background: null,
          aspectRatio: '1:1',
          resolution: '1K',
          aspectRatioOptions: ['1:1'],
          resolutionOptions: ['1K'],
        },
        count: { value: 1, options: [1] },
        references: { items: [], limit: 4 },
      },
      ...overrides,
    } as unknown as AssistantOperatorRequest
  }

  const FOUND = [
    {
      n: 1,
      imageUrl: 'https://img.test/full-1.jpg',
      thumbnailUrl: 'https://thumb.test/1.png',
      pageUrl: 'https://site.test/1',
      domain: 'site.test',
      title: 'Ron official art',
      width: 1200,
      height: 1800,
      usableAsInput: true,
      sourceVerdict: 'unknownLicense',
    },
    {
      n: 2,
      imageUrl: 'https://img.test/full-2.jpg',
      pageUrl: 'https://site.test/2',
      domain: 'site.test',
      usableAsInput: true,
      sourceVerdict: 'unknownLicense',
    },
  ]

  /** 旧执行器那一跳：找图交回 `FOUND`；查证交回整段 + 短版；别的一律「台上本来就是这样」。 */
  function oldTools() {
    plan.mockImplementation(async (_run: unknown, tool: string) => {
      if (tool === 'search_web_images')
        return {
          kind: 'read',
          payload: { query: 'ron', limit: 8 },
          run: async () => ({
            result: { totalFound: FOUND.length, images: FOUND },
            observation:
              'find_images("ron") → 2 PREVIEW picture(s), shown to the creator as numbered cards under your reply:\n  #1 · Ron official art · site.test · 1200×1800 · usable as reference\n  #2 · site.test · usable as reference',
          }),
        }
      if (tool === 'research')
        return {
          kind: 'read',
          payload: {
            goal: '罗恩的魔杖',
            entities: ['罗恩'],
            sources: [],
            round: 1,
            depth: 'quick',
            readPages: 1,
          },
          run: async () => ({
            result: {
              totalFound: 2,
              evidence: [
                {
                  cite: 1,
                  title: 'Ronald Weasley',
                  url: 'https://harrypotter.fandom.com/wiki/Ronald_Weasley',
                  publisher: 'Harry Potter Wiki',
                  snippet: '柳木，十四英寸。',
                  kind: 'text',
                  confidence: 'high',
                  credibility: 'reference',
                  corroboration: 2,
                  scope: 'character',
                },
                {
                  cite: 2,
                  title: 'Tag counts',
                  publisher: 'Danbooru',
                  snippet: 'ron_weasley 1200',
                  kind: 'tags',
                  confidence: 'medium',
                  credibility: 'communityDigest',
                  corroboration: 1,
                  scope: 'character',
                },
              ],
            },
            observation: `verify("罗恩的魔杖") → 2 source(s):\n[1] Ronald Weasley — EXCERPT-FULL ${'柳木，十四英寸。'.repeat(40)}`,
            compact:
              'verify("罗恩的魔杖") → 2 source(s), shown in full on the step right after the search; one line each now:\n  [1] Ronald Weasley · harrypotter.fandom.com · COMPACT-GIST',
          }),
        }
      return {
        kind: 'rejected',
        reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
        detail: 'ok',
      }
    })
  }

  beforeEach(() => {
    plan.mockReset()
    legacy.mockReset()
    run = freshRun()
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
    oldTools()
  })

  const searchRon = {
    id: 'call_search',
    name: 'search_library',
    input: { query: 'ron', kind: 'web_images', subject: null },
  }

  it('⭐ 按号办事：import_url "#2" 由服务端换回那张原图；认不出的号、视频的号回一句说得清的话', async () => {
    const mock = script(
      toolTurn(searchRon),
      toolTurn({
        id: 'call_import',
        name: 'edit',
        input: { ops: [{ op: 'import_url', url: '#2' }] },
      }),
      toolTurn({
        id: 'call_mount',
        name: 'edit',
        input: { ops: [{ op: 'mount_reference', asset: '＃9' }] },
      }),
      textTurn('#2 已经挂上了。'),
    )

    await collect(
      runAssistantV3('clerk-1', imageRequest('找几张罗恩，挂第二张')),
    )

    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'import_user_url',
      { url: 'https://img.test/full-2.jpg' },
      'user-1',
    )
    // ⛔ 模型那边一个地址都没有：搜图那一步只有编号行。
    const afterSearch = promptText(mock.doStreamCalls[1]!)
    expect(afterSearch).toContain('#2 · site.test · usable as reference')
    expect(afterSearch).not.toContain('https://img.test/full-2.jpg')
    const last = promptText(mock.doStreamCalls[3]!)
    expect(last).toContain(
      '#9 is not one of the finds of this turn or last turn (they run #1–#2)',
    )
    // 认不出的号 ⛔ 交给旧执行器去猜。
    expect(plan).not.toHaveBeenCalledWith(
      expect.anything(),
      'mount_reference',
      expect.anything(),
      'user-1',
    )
  })

  /** 2026-10-16 owner：pixiv 那几张 Denia 一张都没看过 —— look 认 `#n`，只能看的看小预览。 */
  it('⭐ look "#n"：原图下不来看小预览；只能看的（pixiv）看小预览；没预览的照实说', async () => {
    const found = [
      ...FOUND,
      {
        n: 3,
        imageUrl: 'https://i.pximg.net/img-original/3.png',
        thumbnailUrl: 'https://thumb.test/3.png',
        pageUrl: 'https://www.pixiv.net/artworks/3',
        domain: 'www.pixiv.net',
        usableAsInput: false,
        sourceVerdict: 'hotlinkProtected',
      },
      {
        n: 4,
        imageUrl: 'https://i.pximg.net/img-original/4.png',
        pageUrl: 'https://www.pixiv.net/artworks/4',
        domain: 'www.pixiv.net',
        usableAsInput: false,
        sourceVerdict: 'hotlinkProtected',
      },
    ]
    plan.mockImplementation(async (_run: unknown, tool: string) =>
      tool === 'search_web_images'
        ? {
            kind: 'read',
            payload: { query: 'ron', limit: 8 },
            run: async () => ({
              result: { totalFound: found.length, images: found },
              observation: 'find_images("ron") → 4 PREVIEW picture(s)',
            }),
          }
        : {
            kind: 'rejected',
            reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
            detail: 'ok',
          },
    )
    // #1 原图下不来、小预览下得来；#2 原图下得来；#3 只看小预览。
    served.set('https://thumb.test/1.png', 'png')
    served.set('https://img.test/full-2.jpg', 'jpeg')
    served.set('https://thumb.test/3.png', 'png')
    const mock = script(
      toolTurn(searchRon),
      toolTurn({
        id: 'call_look',
        name: 'look',
        input: { images: ['#1', '#2', '#3', '#4'], question: '哪张是罗恩？' },
      }),
      textTurn('#2 最像。'),
    )

    await collect(runAssistantV3('clerk-1', imageRequest('找几张罗恩看看')))

    expect(fetchAsBuffer).not.toHaveBeenCalledWith(
      'https://i.pximg.net/img-original/3.png',
      expect.anything(),
    )
    const afterLook = mock.doStreamCalls[2]!
    expect(attachedPictures(afterLook)).toEqual([
      'https://thumb.test/1.png',
      'https://img.test/full-2.jpg',
      'https://thumb.test/3.png',
    ])
    const text = promptText(afterLook)
    expect(text).toContain('1 = 「#1」')
    expect(text).toContain('2 = 「#2」')
    expect(text).toContain('3 = 「#3」')
    expect(text).toContain(
      "「#1」, 「#3」 are only the search engine's small preview",
    )
    expect(text).toContain(
      'Could not see #4: its site does not let us fetch the picture and the search gave no preview of it.',
    )
  })

  it('⭐ 上一轮找到的带进这一轮：编号那一行进开轮那条消息（⛔ 不带地址），"#3" 照样认，新号从最大号往后数', async () => {
    const priorFinds = [
      {
        kind: 'image' as const,
        n: 3,
        imageUrl: 'https://img.test/full-3.jpg',
        pageUrl: 'https://site.test/3',
        domain: 'site.test',
        title: 'Ron back view',
        width: 800,
        height: 1200,
      },
      {
        kind: 'video' as const,
        n: 4,
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Ron fan edit',
        platform: 'youtube' as const,
        channel: 'Someone',
        durationSeconds: 75,
      },
    ]
    const mock = script(
      toolTurn({
        id: 'call_import',
        name: 'edit',
        input: { ops: [{ op: 'import_url', url: '#3' }] },
      }),
      toolTurn({
        id: 'call_video',
        name: 'edit',
        input: { ops: [{ op: 'mount_reference', asset: '#4' }] },
      }),
      textTurn('第三张挂上了。'),
    )

    const events = await collect(
      runAssistantV3('clerk-1', imageRequest('用 #3', { priorFinds })),
    )

    const first = promptText(mock.doStreamCalls[0]!)
    expect(first).toContain(
      "FOUND ON THE WEB LAST TURN (still on the creator's screen under the earlier reply; same numbers):",
    )
    expect(first).toContain(
      '#3 · Ron back view · site.test · 800×1200 · usable as reference',
    )
    expect(first).toContain('#4 · Ron fan edit · Someone · YouTube · 1:15')
    expect(first).not.toContain('https://')
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'import_user_url',
      { url: 'https://img.test/full-3.jpg' },
      'user-1',
    )
    // 准入名单接上了（`import_user_url` 只认 `run.webImageIndex` 里的图），连号从 #5 起。
    expect(run.webImageIndex.has('https://img.test/full-3.jpg')).toBe(true)
    expect(run.webFindSeq).toBe(5)
    const third = promptText(mock.doStreamCalls[2]!)
    expect(third).toContain('#4 is a video (')
    expect(third).toContain('videos are links only')
    // 过程记录里板子带着这一份（回放转题时据此记一条 gap）。
    expect(JSON.stringify(events)).not.toContain('full-3.jpg')
    const recorded = JSON.stringify(recordTurn.mock.calls.at(-1))
    expect(recorded).toContain('"finds"')
  })

  it('接力那一跳不再读请求里上一轮的：板子已经冻着它们，连号接着板子往下', async () => {
    script(textTurn('好。'))
    const transcript: AssistantV3Transcript = [
      {
        type: 'board',
        text: 'IMAGE WORKBENCH',
        images: [],
        finds: [
          {
            kind: 'image',
            n: 5,
            imageUrl: 'https://img.test/full-5.jpg',
            domain: 'site.test',
          },
        ],
      },
    ]
    await collect(
      runAssistantV3(
        'clerk-1',
        imageRequest('继续', {
          priorFinds: [
            {
              kind: 'image',
              n: 1,
              imageUrl: 'https://img.test/full-1.jpg',
              domain: 'site.test',
            },
          ],
          v3: { transcript },
        } as Partial<AssistantOperatorRequest>),
      ),
    )
    expect([...run.webImageIndex.keys()]).toEqual([
      'https://img.test/full-5.jpg',
    ])
    expect(run.webFindSeq).toBe(6)
  })

  it('⭐ 查证：紧跟着的那一步读整段摘录，再往后只剩一行一条；read "[1]" 由服务端换回那一页再读', async () => {
    const mock = script(
      toolTurn({
        id: 'call_research',
        name: 'search_web',
        input: {
          goal: '罗恩的魔杖',
          entities: ['罗恩'],
          onlySources: null,
          depth: null,
          x: null,
        },
      }),
      toolTurn({
        id: 'call_read',
        name: 'read',
        input: { items: ['[1]', '[2]'] },
      }),
      textTurn('柳木，十四英寸 [1]。'),
    )

    await collect(runAssistantV3('clerk-1', imageRequest('罗恩的魔杖是什么木')))

    const right = promptText(mock.doStreamCalls[1]!)
    expect(right).toContain('EXCERPT-FULL')
    expect(right).not.toContain('COMPACT-GIST')
    const later = promptText(mock.doStreamCalls[2]!)
    expect(later).toContain('COMPACT-GIST')
    expect(later).not.toContain('EXCERPT-FULL')
    expect(plan).toHaveBeenCalledWith(
      expect.anything(),
      'read_url',
      { url: 'https://harrypotter.fandom.com/wiki/Ronald_Weasley' },
      'user-1',
    )
    // 没有地址的那一条（标签统计）读不了：照实说，⛔ 不猜地址。
    expect(later).toContain('There is no source [2] with a page to read')
  })
})
