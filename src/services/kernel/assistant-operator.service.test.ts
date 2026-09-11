import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/lib/errors'

import { CINEMATIC_SHOT_GRAMMAR } from '@/constants/cinematic-grammar'
import {
  SEEDANCE_20_CONTROL_RULES,
  SEEDANCE_25_CONTROL_RULES,
} from '@/constants/seedance-prompt-plan'

vi.mock('server-only', () => ({}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockLlmTextCompletion = vi.fn()
const mockResolveLlmTextRoute = vi.fn()
/**
 * 工具环那一轮走的是 `llmTextStream`（2026-09-06 的逐字流），**桩到同一颗
 * `mockLlmTextCompletion` 上**：这一层要验的是「模型这一轮说了什么会怎么样」，
 * 不是分块怎么切。现存的几十条 `mockLlmTextCompletion.mockResolvedValueOnce(...)`
 * 因此一条都不用改。
 *
 * ⚠ 想验分块行为的用例自己覆盖 `mockLlmTextStreamChunks` —— 它按块吐，
 * 增量帧的条数由它决定。
 */
const mockLlmTextStreamChunks = vi.fn<(raw: string) => Iterable<string> | null>(
  () => null,
)
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  llmTextStream: async function* (...args: unknown[]) {
    const raw = (await mockLlmTextCompletion(...args)) as string
    const chunks = mockLlmTextStreamChunks(raw)
    if (chunks) {
      yield* chunks
      return
    }
    yield raw
  },
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
  isLlmTextContextLimitError: () => false,
}))

const mockGetPublicGenerationPage = vi.fn()
/**
 * 审核态两条（切片 X）。⚠ 桩掉是因为它们真的会查库 —— 这一层要验的是
 * 「读到 blocked 之后会发生什么」，不是那条 SQL 本身（那条锁在
 * `generation.service.test.ts` 里）。
 */
const mockReadGenerationReviewStates = vi.fn(
  async (..._args: unknown[]) => new Map<string, string>(),
)
const mockSetGenerationReviewState = vi.fn()
vi.mock('@/services/generation.service', () => ({
  getPublicGenerationPage: (...args: unknown[]) =>
    mockGetPublicGenerationPage(...args),
  readGenerationReviewStates: (...args: unknown[]) =>
    mockReadGenerationReviewStates(...args),
  setGenerationReviewState: (...args: unknown[]) =>
    mockSetGenerationReviewState(...args),
}))

const mockListAssistantAssetFolders = vi.fn()
const mockInspectAssistantAssetFolder = vi.fn()
vi.mock('@/services/kernel/assistant-asset-folder-vision.service', () => ({
  listAssistantAssetFolders: (...args: unknown[]) =>
    mockListAssistantAssetFolders(...args),
  inspectAssistantAssetFolder: (...args: unknown[]) =>
    mockInspectAssistantAssetFolder(...args),
}))

/**
 * 联网搜图（P3-B）。⚠ **全程 mock，一个真 Serper credit 都不花** ——
 * 免费池只有 2500 次，让单元测试去打真接口是把额度当柴烧。
 */
const mockWebImageSearch = vi.fn()
const mockIsWebImageSearchConfigured = vi.fn()
/** 联网**查文字**（切片 3b）—— 同一条论据、同一份 mock 家族，一个 credit 都不花。 */
const mockWebSearch = vi.fn()
const mockIsWebSearchConfigured = vi.fn()
/**
 * 多语言变体搜图与读正文（2026-09-06）—— 同一条论据、同一份 mock 家族。
 * ⚠ `extractFocusedExcerpt` **走真实现**：它是纯函数，桩掉它等于把「按 focus
 * 截段」这件事从这一层的验收里删掉，而那正是这条工具的全部价值。
 */
const mockWebImageSearchMulti = vi.fn()
const mockReadUrl = vi.fn()
vi.mock('@/services/web-research.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/web-research.service')
  >('@/services/web-research.service')
  return {
    extractFocusedExcerpt: actual.extractFocusedExcerpt,
    webImageSearch: (...args: unknown[]) => mockWebImageSearch(...args),
    webImageSearchMulti: (...args: unknown[]) =>
      mockWebImageSearchMulti(...args),
    isWebImageSearchConfigured: () => mockIsWebImageSearchConfigured(),
    webSearch: (...args: unknown[]) => mockWebSearch(...args),
    isWebSearchConfigured: () => mockIsWebSearchConfigured(),
    readUrl: (...args: unknown[]) => mockReadUrl(...args),
  }
})

/**
 * 检索扇出（2026-09-06）。⚠ **全程 mock，一次都不打萌百 / danbooru / Serper** ——
 * 与联网搜图那条同一条论据：让单元测试去打真上游是把别人的服务器当柴烧，
 * 而这一层要验的是「几轮、怎么讲给模型听」，不是上游返回什么。
 */
const mockRunAssistantResearch = vi.fn()
vi.mock('@/services/research/research-fanout.service', () => ({
  runAssistantResearch: (...args: unknown[]) =>
    mockRunAssistantResearch(...args),
}))

/**
 * 看图那一跳的**借路**（P3-C）。桩掉是因为它真的会去查库找 key ——
 * 而这一层要验的是「什么时候借、借不到怎么办」，不是 key 表本身。
 */
const mockFindVisionCapableRoute = vi.fn()
vi.mock('@/services/vision/vision-route.service', () => ({
  findVisionCapableRoute: (...args: unknown[]) =>
    mockFindVisionCapableRoute(...args),
}))

/**
 * 抽帧落库（第二期）。⚠ **全程 mock，一个字节都不写 R2** —— 这一层要验的是
 * 「三帧怎么被读、怎么被汇总」，不是 R2 客户端。⛔ 也别在这里放真实现：那会让
 * 单测去打对象存储。
 */
const mockPersistVideoFrameSet = vi.fn()
vi.mock('@/services/video-frames/video-frame-set.service', () => ({
  persistVideoFrameSet: (...args: unknown[]) =>
    mockPersistVideoFrameSet(...args),
}))

/**
 * LoRA 检索（P4-C）。⚠ **全程 mock，一次都不打 Civitai / HF** —— 与联网搜图那条
 * 同一条论据：让单元测试去打真上游是把别人的额度当柴烧，而且这一层要验的是
 * 「候选怎么投影、装不上的怎么说」，不是上游返回什么。
 */
const mockSearchLoraCandidates = vi.fn()
vi.mock('@/services/lora/lora-candidates.service', () => ({
  searchLoraCandidates: (...args: unknown[]) =>
    mockSearchLoraCandidates(...args),
}))

/**
 * persona 与项目规则（§8.5 / §10）。⚠ **必须桩掉**：`runAssistantOperator` 开跑前
 * 就会各读一次库，不桩的话这份测试的每一条用例都会撞真 Prisma 客户端。
 * 默认返回「代码默认值 + 零条规则」= 今天绝大多数用户的真实形状。
 */
const mockGetAssistantPersonaByUserId = vi.fn()
vi.mock('@/services/assistant-persona.service', async () => {
  const { ASSISTANT_PERSONA_DEFAULTS } =
    await import('@/constants/assistant-persona')
  const { sanitizePrompt } = await import('@/services/kernel/prompt-guard')
  return {
    getAssistantPersonaByUserId: (...args: unknown[]) =>
      mockGetAssistantPersonaByUserId(...args),
    // 清洗那一跳是真的跑 —— 它决定风格段里那句话长什么样。
    sanitizeToneCustom: (persona: {
      tone: string
      toneCustom: string | null
    }) =>
      persona.tone === 'custom' && persona.toneCustom
        ? sanitizePrompt(persona.toneCustom).trim()
        : null,
    ASSISTANT_PERSONA_DEFAULTS,
  }
})

const mockListProjectRules = vi.fn()
const mockAddProjectRule = vi.fn()
vi.mock('@/services/project-rule.service', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/project-rule.service')
  >('@/services/project-rule.service')
  return {
    ProjectRuleLimitError: actual.ProjectRuleLimitError,
    listProjectRules: (...args: unknown[]) => mockListProjectRules(...args),
    addProjectRule: (...args: unknown[]) => mockAddProjectRule(...args),
  }
})

/** 上下文卡（第三期 K1）—— 与规则那一份同形，一行库都不碰。 */
const mockListContextCards = vi.fn(
  async (..._args: unknown[]) => [] as unknown[],
)
const mockGetContextCard = vi.fn(async (..._args: unknown[]) => null as unknown)
vi.mock('@/services/context-cards.service', () => ({
  listContextCards: (...args: unknown[]) => mockListContextCards(...args),
  getContextCard: (...args: unknown[]) => mockGetContextCard(...args),
}))

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS,
  ASSISTANT_OPERATOR_ENTRY_TOOLS,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_RESEARCH_LIMITS,
  isAssistantOperatorEntryTool,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_PLAN_MODE_IDS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_VERBOSITY_IDS,
} from '@/constants/assistant-persona'
import { TAG_BASED_GENERATION_PROMPT_RULE } from '@/constants/model-strengths'
import { ASSISTANT_PLAN_VISUALS } from '@/constants/assistant-plan-visuals'
import { AI_MODELS } from '@/constants/models'
import { getAppOrigin } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { logger } from '@/lib/logger'
import { runAssistantOperator } from '@/services/kernel/assistant-operator.service'
import {
  AssistantOperatorEventSchema,
  type AssistantOperatorEvent,
  type AssistantOperatorRequest,
} from '@/types/assistant-operator'

const SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'seedream-4', label: 'Seedream 4' },
  availableModels: [
    { id: 'seedream-4', label: 'Seedream 4' },
    { id: 'flux-pro', label: 'FLUX Pro' },
  ],
  specs: {
    aspectRatio: '1:1',
    resolution: 'auto',
    aspectRatioOptions: ['1:1', '16:9'],
    resolutionOptions: ['auto', '2K'],
  },
  count: { value: 1, options: [1, 2, 4] },
  references: { items: [], limit: 4 },
}

function buildRequest(
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    messages: [{ role: 'user', content: '帮我把这张海报配好' }],
    domain: 'image',
    snapshot: SNAPSHOT,
    ...overrides,
  }
}

/**
 * 用例里写的是**旧工具名**（`{ name: 'set_prompt', args: {...} }`），这里替它包成
 * v2 的入口形状（`{ name: 'apply', args: { action: 'set_prompt', ... } }`）。
 *
 * ⭐ 包在这一层而不是把 158 处 fixture 逐条改写：这些用例断言的是**每条工具自己
 * 的行为**（值域、`inverse`、拒绝理由），入口只是模型写法的一层壳 —— 把壳抄进
 * 每一条 fixture 只会让下一次协议微调再抄一遍。入口本身的行为（派发 / 枚举 /
 * 旧名被拒）有它自己那一组用例，⛔ 那几条不走这个包装。
 * ⚠ 已经写成入口形状的（`name` 是五个动词之一）原样放行。
 */
function wrapEntryToolCall(turn: unknown): unknown {
  if (!turn || typeof turn !== 'object') return turn
  const record = turn as Record<string, unknown>
  const tool = record.tool
  if (!tool || typeof tool !== 'object') return turn
  const call = tool as Record<string, unknown>
  const name = call.name
  if (typeof name !== 'string') return turn
  const args = (call.args as Record<string, unknown> | undefined) ?? {}
  if (
    (ASSISTANT_OPERATOR_ENTRY_TOOLS as readonly string[]).includes(name) &&
    'action' in args
  ) {
    return turn
  }
  if (!(ASSISTANT_OPERATOR_TOOLS as readonly string[]).includes(name)) {
    return turn
  }
  const legacyTool = name as (typeof ASSISTANT_OPERATOR_TOOLS)[number]
  return {
    ...record,
    tool: {
      ...call,
      name: ASSISTANT_OPERATOR_TOOL_VERBS[legacyTool],
      args: { action: legacyTool, ...args },
    },
  }
}

/** 模型按顺序吐出来的几轮回复。 */
function queueTurns(...turns: unknown[]): void {
  mockLlmTextCompletion.mockReset()
  for (const raw of turns) {
    const turn = wrapEntryToolCall(raw)
    mockLlmTextCompletion.mockResolvedValueOnce(
      typeof turn === 'string' ? turn : JSON.stringify(turn),
    )
  }
  // 队列吐完之后一律收尾，免得循环撞到 undefined。
  mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ finished: true }))
}

async function collect(
  events: AsyncIterable<AssistantOperatorEvent>,
): Promise<AssistantOperatorEvent[]> {
  const out: AssistantOperatorEvent[] = []
  for await (const event of events) {
    // 每一个事件都必须过自己的契约 —— service 说了不算，schema 说了算。
    expect(AssistantOperatorEventSchema.safeParse(event).success).toBe(true)
    out.push(event)
  }
  return out
}

/** 事件类型序列 —— 断言验的是**步骤协议**的形状（plan → step… → done）。 */
function typesOf(events: AssistantOperatorEvent[]) {
  return events.map((event) => event.type)
}

function stepsOf(events: AssistantOperatorEvent[]) {
  return events
    .filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.step)
    .map((event) => (event as { step: Record<string, unknown> }).step)
}

function lastUserPrompt(): string {
  const call = mockLlmTextCompletion.mock.calls.at(-1)?.[0] as {
    userPrompt: string
  }
  return call.userPrompt
}

beforeEach(() => {
  vi.clearAllMocks()
  // ⚠ `clearAllMocks` 只清调用记录，**不清实现，也不清没被消费掉的
  //    `mockResolvedValueOnce` 队列**。打断类用例常常在队列吐完之前就返回，
  //    剩下的那条会漏进下一个用例并压过它自己的 `mockImplementation`
  //    （本文件真踩过一次，表现是「abort 了却收到 done」）。
  mockLlmTextCompletion.mockReset()
  // 分块策略默认「整段一块」—— 想验逐字的用例自己 `mockImplementation` 覆盖。
  mockLlmTextStreamChunks.mockReset()
  mockLlmTextStreamChunks.mockReturnValue(null)
  mockEnsureUser.mockResolvedValue({ id: 'user-db-1' })
  // 默认「一张都没标过」—— 缺席 = pending，存量行就是这个样子。
  mockReadGenerationReviewStates.mockReset()
  mockReadGenerationReviewStates.mockResolvedValue(new Map<string, string>())
  mockSetGenerationReviewState.mockReset()
  mockResolveLlmTextRoute.mockResolvedValue({
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
    apiKey: 'test-key',
  })
  mockGetPublicGenerationPage.mockResolvedValue({
    generations: [],
    total: 0,
    hasMore: false,
    nextCursor: null,
  })
  mockGetAssistantPersonaByUserId.mockResolvedValue({
    ...ASSISTANT_PERSONA_DEFAULTS,
    avatarUrl: null,
  })
  mockListProjectRules.mockResolvedValue([])
  mockListAssistantAssetFolders.mockResolvedValue([])
  mockInspectAssistantAssetFolder.mockResolvedValue({
    folder: {
      folderId: 'hero-folder',
      name: 'Hero',
      path: 'Characters / Hero',
      imageCount: 30,
    },
    totalImages: 30,
    inspectedImages: 2,
    truncated: true,
    batchCount: 1,
    findings: [
      {
        assetId: 'asset-1',
        url: 'https://cdn.example.test/asset-1.png',
        thumbnailUrl: 'https://cdn.example.test/asset-1-thumb.webp',
        createdAt: '2026-08-31T00:00:00.000Z',
        observation: 'front-facing character portrait',
        relevance: 'high',
        reason: 'clear face and costume',
        tags: ['portrait'],
      },
      {
        assetId: 'asset-2',
        url: 'https://cdn.example.test/asset-2.png',
        createdAt: '2026-08-30T00:00:00.000Z',
        observation: 'full-body character sheet',
        relevance: 'medium',
        reason: 'useful silhouette reference',
        tags: ['full-body'],
      },
    ],
    batchSummaries: ['two visible character references'],
    uncertainties: [],
    visionAdapter: 'gemini',
    borrowedVisionRoute: false,
  })
  mockIsWebImageSearchConfigured.mockReturnValue(true)
  mockWebImageSearch.mockResolvedValue([])
  /**
   * ⚠ 默认让**多变体那条委托回单条那条**：不给 `subject` 时服务端发的就是一条
   * 查询，两者的行为逐字相同（真实现里 `webImageSearchMulti` 单条时也是直接
   * 调 `webImageSearch`）。这样切片 3b 那批用例继续用 `mockWebImageSearch`
   * 描述「上游返回什么」，⛔ 不必为一次内部重构改一遍。
   */
  mockWebImageSearchMulti.mockImplementation(
    (queries: string[], options: unknown) =>
      mockWebImageSearch(queries[0], options),
  )
  mockReadUrl.mockResolvedValue(null)
  mockRunAssistantResearch.mockResolvedValue({
    queries: [],
    sources: ['wiki', 'web', 'danbooru'],
    evidence: [],
    receipts: [],
  })
  mockIsWebSearchConfigured.mockReturnValue(true)
  mockWebSearch.mockResolvedValue([])
  mockFindVisionCapableRoute.mockResolvedValue(null)
  // ⚠ 默认「两个源都好好的但没命中」—— 与「源挂了」是两句不同的话，见下面那条用例。
  mockSearchLoraCandidates.mockResolvedValue({
    query: '',
    candidates: [],
    sources: [{ source: 'civitai', status: 'empty', count: 0, tookMs: 1 }],
  })
})

describe('工具环 · 逐事件顺序', () => {
  it('计划 → running → done → done，改动型 step 带着能撤回原值的 inverse', async () => {
    queueTurns(
      {
        plan: ['写提示词', '预填生成键'],
        // ⚠ `tool` 排在 `message` 前面 —— OUTPUT 契约的键序（2026-09-06）。
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'write the prompt',
          reason: 'the field is empty',
          args: { value: 'a girl under a red umbrella' },
        },
        message: '这就来',
      },
      { finished: true, message: '写好了，看看要不要改。' },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    /**
     * ⚠ 工具轮那句「这就来」**不出现在这里**（2026-09-07 降噪）：一轮只在收尾
     * 吐一次正文，中间步骤只走 step 事件 —— 🔬 owner 真机里同一个动作连出三条
     * 近义正文，就是每个工具步都吐了一颗气泡。
     */
    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.plan,
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.step,
      // 收尾那一轮的正文**整段一帧**（v2 §13.1）。
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])

    const [running, done] = stepsOf(events)
    expect(running.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    // 同一步共用一个 id —— 客户端按 id 覆盖而不是追加。
    expect(running.id).toBe(done.id)
    expect(done.payload).toEqual({
      value: 'a girl under a red umbrella',
      mode: 'replace',
    })
    expect(done.inverse).toEqual({ value: '' })
  })

  it('⭐ message 带可折叠的 detail；⛔ 没有正文时不发一颗空气泡', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'a girl under a red umbrella' },
        },
      },
      {
        finished: true,
        message: '提示词写好了，下一步挂参考图。',
        detail: '红伞是画面里唯一的暖色，所以其余部分压成冷调，反差才立得住。',
      },
    )
    const withDetail = (
      await collect(runAssistantOperator('clerk-1', buildRequest()))
    ).find((event) => event.type === ASSISTANT_OPERATOR_EVENTS.message) as
      | Extract<AssistantOperatorEvent, { type: 'message' }>
      | undefined
    expect(withDetail?.text).toBe('提示词写好了，下一步挂参考图。')
    expect(withDetail?.detail).toBe(
      '红伞是画面里唯一的暖色，所以其余部分压成冷调，反差才立得住。',
    )

    // ⛔ 只有 detail 没有正文 = 一颗点开才有东西的空气泡，整帧不发。
    queueTurns({ detail: '想了很多，但没有结论。' }, { finished: true })
    const detailOnly = (
      await collect(runAssistantOperator('clerk-1', buildRequest()))
    ).filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.message)
    expect(detailOnly).toEqual([])
  })

  it('⭐ 连改两次时，第二次的 inverse 撤回到第一次写完之后的值', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'first',
          args: { value: 'first draft' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'second',
          args: { value: 'second draft' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const doneSteps = stepsOf(events).filter(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(doneSteps[0].inverse).toEqual({ value: '' })
    expect(doneSteps[1].inverse).toEqual({ value: 'first draft' })
  })

  it('模型不给 tool 就直接收尾', async () => {
    queueTurns({ message: '你想要什么风格？' })
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(events.at(-1)?.type).toBe(ASSISTANT_OPERATOR_EVENTS.done)
    expect(stepsOf(events)).toHaveLength(0)
  })

  it('围栏包着的 JSON 照样读得出来', async () => {
    queueTurns('```json\n{"finished":true,"message":"好"}\n```')
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])
  })

  /**
   * ⭐ **正文只在定稿时发一帧**（v2 §3.1 / §13.1，拍板 13：逐字淡入改整段出现）。
   *
   * ⚠ 验的是**协议**：正文恰好一帧，⛔ 客户端不再累积半截正文 —— 那条累积路径
   * 正是「同一段回复出现两次」的来源。
   */
  it('⭐ 收尾轮正文恰好一帧 message —— ⛔ 没有第二个正文来源', async () => {
    queueTurns({ finished: true, message: '好的，已经改成夜景了。' })
    mockLlmTextStreamChunks.mockImplementation((raw) =>
      raw.match(/[\s\S]{1,6}/g),
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )

    // ⚠ `message_delta` 连事件联合都不在了（`types/assistant-operator.ts`），
    //   所以这里断的是「正文恰好一帧」——多一帧就是又有第二个来源了。
    expect(
      events
        .filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.message)
        .map((event) => event.text),
    ).toEqual(['好的，已经改成夜景了。'])
  })

  it('⛔ 工具轮那句旁白整帧不发 —— 那一步已经有 step 事件在说同一件事', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'write the prompt',
          args: { value: 'night city' },
        },
        message: '这就来',
      },
      { finished: true, message: '写好了。' },
    )
    mockLlmTextStreamChunks.mockImplementation((raw) =>
      raw.match(/[\s\S]{1,6}/g),
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )

    /**
     * ⭐ **一轮只吐一次正文**（P2 降噪 / v2 §13.1）：判据只剩「这一轮是不是收尾
     * 轮」，工具轮的那句旁白既没流出去过、也没有任何东西要定稿。
     */
    expect(
      events
        .filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.message)
        .map((event) => event.text),
    ).toEqual(['写好了。'])
  })

  it.each([
    ['ASSISTANT_NO_TEXT_RESPONSE', 'errors.assistant.noTextResponse'],
    ['ASSISTANT_OUTPUT_TRUNCATED', 'errors.assistant.outputTruncated'],
    ['PROVIDER_REFUSED', 'errors.provider.refused'],
    ['PROVIDER_TRANSIENT', 'errors.provider.temporarilyUnavailable'],
  ])('preserves %s without a second planning call', async (code, key) => {
    const failure = new ApiRequestError(code!, 502, key!, 'Provider failure')
    mockLlmTextCompletion.mockRejectedValueOnce(failure)
    await expect(
      collect(runAssistantOperator('clerk-1', buildRequest())),
    ).rejects.toBe(failure)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })

  it('does not execute a complete tool JSON when its stream subsequently fails', async () => {
    const failure = new ApiRequestError(
      'ASSISTANT_OUTPUT_TRUNCATED',
      502,
      'errors.assistant.outputTruncated',
      'Incomplete stream',
    )
    queueTurns({
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        title: 'set prompt',
        args: { value: 'night city' },
      },
      message: 'done',
    })
    mockLlmTextStreamChunks.mockImplementation((raw) => ({
      *[Symbol.iterator]() {
        yield raw
        throw failure
      },
    }))
    const events: AssistantOperatorEvent[] = []
    const consume = async () => {
      for await (const event of runAssistantOperator('clerk-1', buildRequest()))
        events.push(event)
    }
    await expect(consume()).rejects.toBe(failure)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(stepsOf(events)).toHaveLength(0)
  })

  it('连着两轮读不出 JSON 就大声失败，而不是把步数烧完', async () => {
    mockLlmTextCompletion.mockResolvedValue('抱歉，我说点别的。')
    await expect(
      collect(runAssistantOperator('clerk-1', buildRequest())),
    ).rejects.toThrow(/JSON/)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
  })

  it('反馈反问题缺失的字段，让合法 JSON 的结构错误能在下一轮修正', async () => {
    const question = {
      options: [
        { label: '3D 游戏画风', description: '引擎质感，接近官方立绘。' },
        { label: '电影 CG', description: '景深与噪点更重，像预告片。' },
      ],
    }
    mockLlmTextCompletion.mockImplementation(async ({ userPrompt }) =>
      JSON.stringify({
        plan: ['确定画风'],
        questions: [
          userPrompt.includes('questions.0.question')
            ? { ...question, question: '要哪种画风？' }
            : question,
        ],
        finished: true,
      }),
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ forcePlan: true })),
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: ASSISTANT_OPERATOR_EVENTS.ask,
        question: expect.objectContaining({ question: '要哪种画风？' }),
      }),
    )
    expect(stepsOf(events)).toHaveLength(0)
  })

  it('撞到步数上限时停下来并说出理由，不自动续跑（台账 AH：没有幂等键）', async () => {
    /**
     * ⚠ 每一步的参数都**必须不同**（P3-D 之后）：同参重复现在会被
     * `repeatedStep` 拦下并在第二次强制收尾 —— 那条路径由「重复步护栏」那一组
     * 单独钉。这里要验的是「一直有新活干也不会无限跑下去」。
     */
    let step = 0
    mockLlmTextCompletion.mockImplementation(() => {
      step += 1
      return Promise.resolve(
        JSON.stringify({
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
            title: 'look again',
            args: { query: `query-${step}` },
          },
        }),
      )
    })

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(events.at(-1)).toEqual({
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: ASSISTANT_OPERATOR_STOP_REASONS.maxSteps,
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(
      ASSISTANT_OPERATOR_LIMITS.maxSteps,
    )
  })
})

describe('read_state', () => {
  it('读的是请求里的快照，不查库；负面框缺席时明说没有这个控件', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'read the form',
          args: {},
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, negativePrompt: undefined },
        }),
      ),
    )

    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    const digest = (done?.result as { digest: string }).digest
    expect(digest).toContain('NO NEGATIVE PROMPT FIELD')
    expect(digest).toContain('Models you can switch to')
    expect(mockGetPublicGenerationPage).not.toHaveBeenCalled()
  })
})

describe('search_assets', () => {
  it('只查这个用户自己的库，类型收在可挂的两种里', async () => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [
        {
          id: 'gen-1',
          url: 'https://cdn.example.test/1.png',
          thumbnailUrl: 'https://cdn.example.test/1-thumb.png',
          outputType: 'IMAGE',
          prompt: 'red umbrella in the rain',
          model: 'seedream-4',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        // 没有 url 的那条（还在跑 / 失败了）不该端给模型
        {
          id: 'gen-2',
          url: null,
          outputType: 'IMAGE',
          prompt: 'half done',
          createdAt: new Date('2026-08-02T00:00:00.000Z'),
        },
      ],
      total: 7,
      hasMore: false,
      nextCursor: null,
    })

    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search the library',
          args: { query: 'umbrella', kind: 'image', limit: 6 },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(mockGetPublicGenerationPage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-db-1',
        search: 'umbrella',
        type: ['image'],
        limit: 6,
      }),
    )

    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    const result = done?.result as {
      totalFound: number
      assets: { assetId: string }[]
    }
    expect(result.totalFound).toBe(7)
    expect(result.assets.map((asset) => asset.assetId)).toEqual(['gen-1'])
  })

  /**
   * ⭐ 2026-08-30 真机撞到的那条：素材的提示词只要**超过上限**，截断出来的字符串
   * 就比上限多一个字（省略号没算进去），紧接着 `toStepEvent` 用 schema 校验时当场
   * 抛，整轮以一句笼统的「run failed midway」结束 —— 而日志停在 `running` 那一半。
   * 短提示词一路绿灯，越是真实的库越容易炸，所以必须钉住。
   */
  it('素材提示词超长时照样能出流（截断后仍在上限内）', async () => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [
        {
          id: 'gen-long',
          url: 'https://cdn.example.test/long.png',
          outputType: 'IMAGE',
          // 上限是 200，这里给 600 —— 截断的结果必须仍然 ≤ 200。
          prompt: 'a'.repeat(600),
          model: 'seedream-4',
          createdAt: new Date('2026-08-30T00:00:00.000Z'),
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })

    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search the library',
          args: { query: 'girl' },
        },
      },
      { finished: true },
    )

    // `collect` 逐个事件过 schema —— 修好之前这一行就是失败点。
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    const result = done?.result as { assets: { prompt: string }[] }
    expect(result.assets[0].prompt.length).toBeLessThanOrEqual(
      ASSISTANT_OPERATOR_LIMITS.maxPriorStepSummaryChars,
    )
    expect(result.assets[0].prompt.endsWith('…')).toBe(true)
  })

  it('不指定类型时两种都搜', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: 'anything' },
        },
      },
      { finished: true },
    )
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(mockGetPublicGenerationPage).toHaveBeenCalledWith(
      expect.objectContaining({ type: ['image', 'video'] }),
    )
  })

  it('空结果要说出来 —— 否则模型接着编一个 id 出来挂', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: '不存在的东西' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect((done?.result as { assets: unknown[] }).assets).toEqual([])
    expect(lastUserPrompt()).toContain('found NOTHING')
  })
})

describe('素材文件夹视觉检查', () => {
  it('先列真实文件夹，再按同一轮返回的 id 检查，并把覆盖率讲回给模型', async () => {
    mockListAssistantAssetFolders.mockResolvedValue([
      {
        folderId: 'hero-folder',
        name: 'Hero',
        path: 'Characters / Hero',
        imageCount: 30,
      },
    ])
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
          title: 'find the folder',
          args: { query: 'hero' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
          title: 'inspect the folder',
          args: {
            folderId: 'hero-folder',
            instruction: '挑出最适合做角色参考的图',
          },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(mockListAssistantAssetFolders).toHaveBeenCalledWith({
      userId: 'user-db-1',
      query: 'hero',
      limit: ASSISTANT_OPERATOR_LIMITS.maxFolderMatches,
    })
    expect(mockInspectAssistantAssetFolder).toHaveBeenCalledWith({
      userId: 'user-db-1',
      folderId: 'hero-folder',
      instruction: '挑出最适合做角色参考的图',
    })

    const inspected = stepsOf(events).find(
      (step) =>
        step.tool === ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder &&
        step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(inspected?.result).toMatchObject({
      totalImages: 30,
      inspectedImages: 2,
      truncated: true,
    })
    expect(lastUserPrompt()).toContain('ACTUALLY VIEWED 2/30')
    expect(lastUserPrompt()).toContain('28 image(s) were NOT viewed')
  })

  it('没列过就检查会按 unknownFolder 拒绝，视觉服务不会被调用', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
          title: 'inspect a made-up folder',
          args: { folderId: 'made-up-folder', instruction: '看看这里' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(stepsOf(events)[0]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownFolder },
    })
    expect(mockInspectAssistantAssetFolder).not.toHaveBeenCalled()
  })
})

describe('规划器的拒绝', () => {
  it('没有负面框时 set_negative 被拒（拍板 19 / 台账 BJ 同一条闸）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
          title: 'write negatives',
          args: { value: 'blurry' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, negativePrompt: undefined } }),
      ),
    )
    const step = stepsOf(events)[0]
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl,
    )
    // 拒绝理由要讲回给模型，让它改口而不是原样重试
    expect(lastUserPrompt()).toContain('REFUSED')
  })

  it('编出来的模型 id 被拒', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setModel,
          title: 'switch model',
          args: { modelId: 'Animagine XL' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownModel,
    )
  })

  it('没搜过就挂参考图 = unknownAsset（URL 永远不由模型写）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
          title: 'mount',
          args: { assetId: 'made-up-id' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset,
    )
  })

  it('搜过之后挂得上，URL 来自服务端的检索结果', async () => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [
        {
          id: 'gen-1',
          url: 'https://cdn.example.test/1.png',
          outputType: 'IMAGE',
          prompt: 'red umbrella',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })

    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: 'umbrella' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
          title: 'mount it',
          args: { assetId: 'gen-1' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const mounted = stepsOf(events).find(
      (step) =>
        step.tool === ASSISTANT_OPERATOR_TOOL_IDS.mountReference &&
        step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(mounted?.payload).toMatchObject({
      assetId: 'gen-1',
      url: 'https://cdn.example.test/1.png',
      kind: 'image',
    })
    // 没写 slot 就落默认档（第二期）—— 图片域永远是这一档。
    expect(mounted?.payload).toMatchObject({ slot: 'reference' })
    expect(mounted?.inverse).toEqual({ assetId: 'gen-1', slot: 'reference' })
  })

  it('sets GPT 2.5 quality and background independently from resolution and preserves undo values', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
          title: 'Set image quality',
          args: {
            aspectRatio: '16:9',
            resolution: '2K',
            quality: 'max',
            background: 'transparent',
            preview: true,
          },
        },
      },
      { finished: true },
    )
    const request = buildRequest()
    request.snapshot = {
      ...request.snapshot,
      model: { id: 'gpt-image-2.5-sunburst' },
    }
    const events = await collect(runAssistantOperator('clerk-1', request))
    const step = stepsOf(events).find((step) => step.status === 'done')
    expect(step?.payload).toMatchObject({
      resolution: '2K',
      quality: 'max',
      background: 'transparent',
      preview: true,
    })
    expect(step?.inverse).toMatchObject({
      quality: null,
      background: null,
      preview: null,
    })
  })

  it('rejects 2.5-only quality on GPT Image 2 without changing specs', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
          title: 'Invalid quality',
          args: { aspectRatio: '16:9', resolution: '2K', quality: 'max' },
        },
      },
      { finished: true },
    )
    const request = buildRequest()
    request.snapshot = { ...request.snapshot, model: { id: 'gpt-image-2' } }
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', request)),
    )
    expect(steps[0].status).toBe('error')
  })

  it('set_specs 的值不在选项里就拒；合法时两个字段一起下（台账 AE/BG/BS）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
          title: 'bad specs',
          args: { aspectRatio: '21:9', resolution: '2K' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
          title: 'good specs',
          args: { aspectRatio: '16:9', resolution: '2K' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const steps = stepsOf(events)
    expect((steps[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownValue,
    )
    const applied = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(applied?.payload).toEqual({ aspectRatio: '16:9', resolution: '2K' })
    expect(applied?.inverse).toEqual({ aspectRatio: '1:1', resolution: 'auto' })
  })

  /**
   * 2026-08-30 真机三连红：一句「比例 3:4」→ 三条「参数形状不对」+ 表单零改动。
   *
   * 链条是**没选模型 → 清晰度档位表为空 → schema 的两个必填字段无解**。这一组
   * 锁的就是「拒在 schema 之前、并且给一条模型学得会的理由」。
   */
  describe('⭐ 没选模型时的 set_specs（P2 三连红）', () => {
    const NO_MODEL_SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
      ...SNAPSHOT,
      model: null,
      specs: {
        aspectRatio: '1:1',
        resolution: null,
        // 真机形状：比例表是常量（永远有），清晰度表由已选模型算出来 → 空。
        aspectRatioOptions: ['1:1', '16:9'],
        resolutionOptions: [],
      },
    }

    it('拒绝理由是 noModelSelected，不是 malformedArgs', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
            title: 'set 3:4',
            args: { aspectRatio: '16:9', resolution: '2K' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ snapshot: NO_MODEL_SNAPSHOT }),
        ),
      )
      const step = stepsOf(events)[0]
      expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
      expect((step.error as { reason: string }).reason).toBe(
        ASSISTANT_OPERATOR_REJECT_REASON_IDS.noModelSelected,
      )
      // 理由要指出下一步是什么 —— malformedArgs 学不会，「先选模型」学得会。
      expect((step.error as { detail?: string }).detail).toContain('set_model')
    })

    it('⭐ 拒在 args schema 之前：模型给的参数本身不合法也照样是 noModelSelected', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
            title: 'set 3:4',
            // 真机上模型看到「options: (none)」后写出来的形状：清晰度没得填。
            args: { aspectRatio: '3:4', resolution: '' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ snapshot: NO_MODEL_SNAPSHOT }),
        ),
      )
      expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
        ASSISTANT_OPERATOR_REJECT_REASON_IDS.noModelSelected,
      )
    })

    it('状态块改口：不再列空选项邀请调用，而是明说先 set_model', async () => {
      queueTurns({ finished: true })
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ snapshot: NO_MODEL_SNAPSHOT }),
        ),
      )

      const prompt = lastUserPrompt()
      expect(prompt).toContain('set_model')
      // ⛔ 空档位那两行是三连红的燃料：印出来模型就当成「填一个吧」。
      expect(prompt).not.toContain('options: (none)')
      expect(prompt).not.toContain('- Resolution:')
    })

    it('档位表齐了就照常工作 —— 空表的闸不许误伤正常路径', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
            title: 'good specs',
            args: { aspectRatio: '16:9', resolution: '2K' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator('clerk-1', buildRequest()),
      )
      const applied = stepsOf(events).find(
        (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      )
      expect(applied?.payload).toEqual({
        aspectRatio: '16:9',
        resolution: '2K',
      })
      expect(applied?.inverse).toEqual({
        aspectRatio: '1:1',
        resolution: 'auto',
      })
    })

    it('这台工作台压根没有档位表时按 noSuchControl 拒（与「还差一步」分开）', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
            title: 'set specs',
            args: { aspectRatio: '16:9', resolution: '2K' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            snapshot: {
              ...SNAPSHOT,
              specs: {
                aspectRatio: null,
                resolution: null,
                aspectRatioOptions: [],
                resolutionOptions: [],
              },
            },
          }),
        ),
      )
      expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
        ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl,
      )
    })
  })

  it('张数只认档位表里的值', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
          title: 'three please',
          args: { count: 3 },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownValue,
    )
  })
})

describe('prime_generate · 钱闸', () => {
  it('提示词是空的就拒 —— 与人手点生成键时的拦法一致', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          title: 'arm it',
          args: {},
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.emptyPrompt,
    )
  })

  it('还没选模型也拒', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          title: 'arm it',
          args: {},
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, prompt: 'something', model: null },
        }),
      ),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.noModelSelected,
    )
  })

  it('⛔ 备好了也只是让键亮起来：一次外部调用都没有，逆操作是灭掉它', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
          title: 'arm it',
          args: {},
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, prompt: 'a poster' } }),
      ),
    )
    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toEqual({ primed: true })
    expect(done?.inverse).toEqual({ primed: false })
    expect(mockGetPublicGenerationPage).not.toHaveBeenCalled()
  })
})

describe('就地确认往返（拍板 3）', () => {
  const HAND_WRITTEN = { ...SNAPSHOT, prompt: '我自己写的一段提示词' }
  const OVERWRITE_TURN = {
    tool: {
      name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
      title: 'rewrite the prompt',
      args: { value: '助手写的新提示词' },
    },
  }

  it('字段里有用户手写内容时先问，且这条流就此结束（不落任何写入）', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ snapshot: HAND_WRITTEN })),
    )

    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.ask,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    const [ask, halt] = events
    // v2 §3.1：覆盖三选降级成一张问题卡，三个选项 id 就是回执要带回来的那三个值。
    expect(ask).toMatchObject({
      overwrite: {
        field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
        have: '我自己写的一段提示词',
        proposed: '助手写的新提示词',
      },
    })
    expect(
      (
        ask as Extract<AssistantOperatorEvent, { type: 'ask' }>
      ).question.options.map((option) => option.id),
    ).toEqual(Object.values(ASSISTANT_OPERATOR_CONFIRM_CHOICES))
    expect(halt).toMatchObject({
      reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
    })
    // 第一步就停了 —— 只问了模型一次
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })

  it('确认卡完整保留超过 200 字的当前文本和建议', async () => {
    const have = '手写提示词'.repeat(100)
    const proposed = '助手建议'.repeat(100)
    queueTurns({
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        title: 'rewrite',
        args: { value: proposed },
      },
    })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, prompt: have } }),
      ),
    )
    expect(
      events.find((event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask),
    ).toMatchObject({ overwrite: { have, proposed } })
  })

  it('带着「追加」重发就续跑，inverse 仍是改前原文', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: HAND_WRITTEN,
          confirmations: [
            {
              field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
              choice: ASSISTANT_OPERATOR_CONFIRM_CHOICES.append,
            },
          ],
        }),
      ),
    )

    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toEqual({
      value: '助手写的新提示词',
      mode: 'append',
    })
    expect(done?.inverse).toEqual({ value: '我自己写的一段提示词' })
  })

  it('带着「覆盖」重发就整段换掉', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: HAND_WRITTEN,
          confirmations: [
            {
              field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
              choice: ASSISTANT_OPERATOR_CONFIRM_CHOICES.overwrite,
            },
          ],
        }),
      ),
    )
    const done = stepsOf(events).find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toMatchObject({ mode: 'replace' })
  })

  it('选「保留」时那一步被拒，且线程里看得见为什么', async () => {
    queueTurns(OVERWRITE_TURN, { finished: true })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: HAND_WRITTEN,
          confirmations: [
            {
              field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
              choice: ASSISTANT_OPERATOR_CONFIRM_CHOICES.keep,
            },
          ],
        }),
      ),
    )
    expect((stepsOf(events)[0].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.userDeclined,
    )
  })

  it('助手覆盖自己刚写的草稿不再问第二次', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'draft',
          args: { value: '第一稿' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'revise',
          args: { value: '第二稿' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask),
    ).toBe(false)
    expect(stepsOf(events)).toHaveLength(4)
  })
})

describe('打断（拍板 13）', () => {
  it('开跑前就 abort：一次模型都不问，直接干净收尾', async () => {
    queueTurns({ finished: true })
    const controller = new AbortController()
    controller.abort()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest(), {
        signal: controller.signal,
      }),
    )
    expect(events).toEqual([
      {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      },
    ])
    expect(mockLlmTextCompletion).not.toHaveBeenCalled()
  })

  it('跑到一半 abort：不再开始下一步', async () => {
    const controller = new AbortController()
    mockLlmTextCompletion.mockImplementation(async () => {
      controller.abort()
      return JSON.stringify({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'read',
          args: {},
        },
      })
    })

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest(), {
        signal: controller.signal,
      }),
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      {
        type: ASSISTANT_OPERATOR_EVENTS.stopped,
        reason: ASSISTANT_OPERATOR_STOP_REASONS.aborted,
      },
    ])
  })

  it('消费方提前 break（客户端断开）时生成器照样收尾，不留在飞的一步', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'read',
          args: {},
        },
      }),
    )

    const seenTypes: string[] = []
    for await (const event of runAssistantOperator('clerk-1', buildRequest())) {
      seenTypes.push(event.type)
      break
    }
    const seen = seenTypes.length

    // break 之后 for-await 会调 iterator.return()，生成器停在那一步，
    // 不会把剩下的 maxSteps 轮跑完。
    expect(seen).toBe(1)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })
})

describe('前情 steps（没有服务端会话态）', () => {
  it('上一轮做过什么由客户端带回来，并出现在提示里', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          priorSteps: [
            {
              tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
              status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
              summary: 'wrote the umbrella prompt',
            },
          ],
        }),
      ),
    )
    expect(lastUserPrompt()).toContain('wrote the umbrella prompt')
  })
})

describe('联网搜图 · 预览优先（P3-B）', () => {
  const WEB_HITS = [
    {
      imageUrl: 'https://cdn.example.test/figure-a.jpg',
      thumbnailUrl: 'https://encrypted-tbn0.gstatic.test/a.jpg',
      pageUrl: 'https://example.test/post/a',
      domain: 'example.test',
      title: 'PVC figure studio shot',
      width: 1600,
      height: 1200,
    },
    {
      imageUrl: 'https://cdn.other.test/figure-b.png',
      pageUrl: 'https://other.test/b',
      domain: 'other.test',
    },
  ]

  function queueWebSearch(query = 'pvc figure studio shot') {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'search the web',
          args: { query },
        },
      },
      { finished: true },
    )
  }

  it('候选只是预览：step 是读类、没有 inverse、载荷里一个 assetId 都没有', async () => {
    mockWebImageSearch.mockResolvedValue(WEB_HITS)
    queueWebSearch()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const [running, done] = stepsOf(events)

    expect(running.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    // ⭐ 读类：没有 inverse（没有东西可撤 —— 它一个字节都没落）。
    expect(done.inverse).toBeUndefined()

    const result = done.result as {
      totalFound: number
      images: Record<string, unknown>[]
    }
    expect(result.totalFound).toBe(2)
    expect(result.images).toHaveLength(2)
    expect(result.images[0].imageUrl).toBe(WEB_HITS[0].imageUrl)
    expect(result.images[0].thumbnailUrl).toBe(WEB_HITS[0].thumbnailUrl)
    // ⛔ 联网候选**没有 assetId** —— 那正是它与库内素材的全部区别。
    for (const image of result.images) {
      expect(image).not.toHaveProperty('assetId')
    }
  })

  /**
   * ⚠ 2026-09-06 改了口径的**只有一句**：候选在用户明确说「挂上」之后可以走
   * `import_user_url`（准入名单是服务端记下的那几张，见 `planImportUserUrl`）。
   * 「默认由用户点选」「什么都还没落地」「⛔ 别把地址写进提示词」三条一个字没改。
   */
  it('⭐ 观察里必须写明「只是预览、默认由用户点选、地址不许写进提示词」', async () => {
    mockWebImageSearch.mockResolvedValue(WEB_HITS)
    queueWebSearch()

    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = lastUserPrompt()
    expect(prompt).toContain('PREVIEW')
    expect(prompt).toContain('nothing was saved yet')
    expect(prompt).toContain('the creator presses "use this"')
    expect(prompt).toContain('Never paste one of these URLs into a prompt')
  })

  it('⛔ 联网候选挂不上参考图：mount_reference 认的是本轮 search_assets 的 id', async () => {
    mockWebImageSearch.mockResolvedValue(WEB_HITS)
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'search the web',
          args: { query: 'pvc figure' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
          title: 'mount the web hit',
          // 模型能看到的只有域名/标题，这里假设它编了一个 id 出来。
          args: { assetId: 'https://cdn.example.test/figure-a.jpg' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const mounted = stepsOf(events).find(
      (step) => step.tool === ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
    )
    expect(mounted?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((mounted?.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset,
    )
  })

  it('平台没配 Serper key → 这一步被拒，且理由不是「没有这个控件」', async () => {
    mockIsWebImageSearchConfigured.mockReturnValue(false)
    queueWebSearch()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const [step] = stepsOf(events)
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.searchUnavailable,
    )
    // ⛔ 一次 Serper 调用都不许发出去（credits 是真钱）。
    expect(mockWebImageSearch).not.toHaveBeenCalled()
  })

  it('一张都没搜到时说出来，并明确禁止编 URL', async () => {
    mockWebImageSearch.mockResolvedValue([])
    queueWebSearch('something nobody has')

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const done = stepsOf(events)[1]
    expect((done.result as { totalFound: number }).totalFound).toBe(0)
    expect(lastUserPrompt()).toContain('Do not invent image URLs')
  })

  it('模型要 999 张时按协议上限收窄（一次调用就是一个 credit）', async () => {
    mockWebImageSearch.mockResolvedValue(WEB_HITS)
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'search the web',
          args: { query: 'pvc figure', limit: 999 },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const [step] = stepsOf(events)
    // ⚠ 999 过不了 args schema（`max(maxWebImageResults)`），所以这一步被拒 ——
    //    拒了也不发请求，正是我们要的：额度不会因为模型写了个大数被烧掉。
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.malformedArgs,
    )
    expect(mockWebImageSearch).not.toHaveBeenCalled()
  })

  it('上游多返了几条时按 limit 截断，落进 step 的条数不超协议上限', async () => {
    mockWebImageSearch.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        imageUrl: `https://cdn.example.test/${index}.jpg`,
        domain: 'example.test',
      })),
    )
    queueWebSearch()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const done = stepsOf(events)[1]
    expect(
      (done.result as { images: unknown[] }).images.length,
    ).toBeLessThanOrEqual(ASSISTANT_OPERATOR_LIMITS.maxWebImageResults)
  })
})

// ─── 看图闭环（P3-C，拍板 4 + 6）─────────────────────────────────

const RESULT: NonNullable<AssistantOperatorRequest['result']> = {
  url: 'https://cdn.example.com/result.png',
  thumbnailUrl: 'https://cdn.example.com/result-thumb.png',
  generationId: 'gen-42',
  modelLabel: 'Seedream 4',
  prompt: 'a girl under a red umbrella',
}

const CRITIQUE_JSON = {
  findings: [
    { severity: 'pass', text: '红伞是画面唯一的暖色' },
    { severity: 'fail', text: '雨丝糊成一片' },
  ],
  advice: '把雨的方向写进提示词',
}

/** 一轮完整的看图：规划器叫它看 → 视觉那一跳 → 规划器收尾。 */
function queueCritiqueRound(critique: unknown = CRITIQUE_JSON): void {
  queueTurns(
    {
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
        title: 'look at what came back',
        args: {},
      },
    },
    critique,
    { finished: true },
  )
}

/** 带着 `imageData` 的那次补全 —— 也就是真的「看」的那一下。 */
function visionCalls(): { imageData?: unknown; adapterType?: unknown }[] {
  return mockLlmTextCompletion.mock.calls
    .map((call) => call[0] as { imageData?: unknown; adapterType?: unknown })
    .filter((input) => input.imageData !== undefined)
}

describe('看图闭环 · critique_result', () => {
  it('带着 result 时看图成功：图是请求里那份 result 的，模型碰不到它', async () => {
    queueCritiqueRound()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ result: RESULT })),
    )
    const [running, done] = stepsOf(events)
    expect(running.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    // ⭐ 拍板 6：证据是契约里的字段，不是渲染层的自觉。
    expect(done.payload).toMatchObject({
      imageUrl: RESULT.url,
      thumbnailUrl: RESULT.thumbnailUrl,
      modelLabel: RESULT.modelLabel,
      goal: RESULT.prompt,
    })
    expect(done.result).toMatchObject({
      findings: CRITIQUE_JSON.findings,
      advice: CRITIQUE_JSON.advice,
      borrowedVisionRoute: false,
    })

    // 真的把图送出去看了 —— 而且送的是那一张。
    expect(visionCalls()).toHaveLength(1)
    expect(visionCalls()[0]?.imageData).toBe(RESULT.url)
  })

  /**
   * ⭐ **拍板 4 推翻（2026-09-06）的服务端一半**：`@` 指定的任意一张一律可看。
   * 三条来源各钉一条 —— ① `@` 的 id、② `@` 的地址、③ 归属票。
   * ⛔ 第四条不存在：名单外的目标一律 `unknownAsset`，模型不许自己写一条地址。
   */
  it('来源① —— targetIds 给的是 @ 那张图的 id，看的就是它', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: 'look at the one they pointed at',
          args: { targetIds: ['asset-7'] },
        },
      },
      CRITIQUE_JSON,
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          mentionedAssets: [
            {
              id: 'asset-7',
              url: 'https://cdn.example.com/mentioned.png',
              label: '结果②',
            },
          ],
        }),
      ),
    )
    const [, done] = stepsOf(events)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(done.payload).toMatchObject({
      imageUrl: 'https://cdn.example.com/mentioned.png',
    })
    expect(visionCalls()[0]?.imageData).toBe(
      'https://cdn.example.com/mentioned.png',
    )
  })

  it('来源② —— targetIds 给的是地址本身（模型从 [attached: …] 里读到的就是它）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: 'look',
          args: { targetIds: ['https://cdn.example.com/mentioned.png'] },
        },
      },
      CRITIQUE_JSON,
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          mentionedAssets: [
            { id: 'asset-7', url: 'https://cdn.example.com/mentioned.png' },
          ],
        }),
      ),
    )
    expect(stepsOf(events)[1]?.status).toBe(
      ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(visionCalls()[0]?.imageData).toBe(
      'https://cdn.example.com/mentioned.png',
    )
  })

  it('⛔ 名单外的目标一律拒（unknownAsset），且一次视觉往返都不发', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: 'look at something I made up',
          args: { targetIds: ['https://evil.example.com/whatever.png'] },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          mentionedAssets: [
            { id: 'asset-7', url: 'https://cdn.example.com/mentioned.png' },
          ],
        }),
      ),
    )
    const [step] = stepsOf(events)
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset,
    )
    expect(visionCalls()).toHaveLength(0)
  })

  /**
   * ⭐ 没票也没指名，而手上有两张以上候选 —— 那不是拒绝的时候，是**问一句**的
   * 时候（§3.3 第 5 行 / §7）。⛔ 别在这里挑一张「最可能的」：挑错了用户看到的是
   * 一份煞有介事、对着另一张图写的评价。
   */
  it('来源都缺、但候选 ≥2 → 吐 ask 并停流（⛔ 不猜一张）', async () => {
    queueCritiqueRound()

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: {
            ...SNAPSHOT,
            references: {
              items: [
                { url: 'https://cdn.example.com/ref-a.png', label: '参考 A' },
                { url: 'https://cdn.example.com/ref-b.png', label: '参考 B' },
              ],
              limit: 4,
            },
          },
        }),
      ),
    )
    const choice = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask,
    )
    expect(choice).toBeDefined()
    expect(
      (
        choice as Extract<AssistantOperatorEvent, { type: 'ask' }>
      ).question.options.map((option) => option.assetUrl),
    ).toEqual([
      'https://cdn.example.com/ref-a.png',
      'https://cdn.example.com/ref-b.png',
    ])
    expect(
      events.find((event) => event.type === ASSISTANT_OPERATOR_EVENTS.stopped),
    ).toMatchObject({ reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm })
    expect(visionCalls()).toHaveLength(0)
  })

  it('评价随后进了下一轮的语境，助手据此改表单', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: 'look',
          args: {},
        },
      },
      CRITIQUE_JSON,
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'fix the rain',
          args: { value: 'a girl under a red umbrella, slanted rain' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ result: RESULT })),
    )
    expect(lastUserPrompt()).toContain('雨丝糊成一片')
    const tools = stepsOf(events).map((step) => step.tool)
    expect(tools).toContain(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt)
  })

  /**
   * ⭐ **拍板 4 的服务端一半**：没有 `result` 就没有图可看。客户端只在归属追踪
   * 认定「这一枪是助手备的」时才带这个字段上来，所以用户自己发的那些生成在这里
   * 表现为「压根没有 result」—— 助手够不着，也就打扰不了。
   */
  it('没有 result 时被拒，且一次视觉往返都不发', async () => {
    queueCritiqueRound()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const [step] = stepsOf(events)
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.noResultToCritique,
    )
    expect(visionCalls()).toHaveLength(0)
  })

  it('没有 result 时状态块明说「看不到」，有 result 时明说「先看它」', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(lastUserPrompt()).toContain('No fresh result of yours is waiting')

    queueTurns({ finished: true })
    await collect(
      runAssistantOperator('clerk-1', buildRequest({ result: RESULT })),
    )
    expect(lastUserPrompt()).toContain('A FRESH RESULT')
  })

  it('用户选的路看不了图时借一条，并如实标 borrowed', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://example.test' },
      apiKey: 'deepseek-key',
    })
    mockFindVisionCapableRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
      apiKey: 'borrowed-key',
    })
    queueCritiqueRound()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ result: RESULT })),
    )
    const done = stepsOf(events)[1]
    expect(
      (done.result as { borrowedVisionRoute: boolean }).borrowedVisionRoute,
    ).toBe(true)
    // 图打到的是**借来的**那条路，不是用户那条看不见图的。
    expect(visionCalls()[0]?.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)
  })

  /** ⛔ 借不到就说不出话 —— 绝不降级成「凭提示词猜」。 */
  it('一条能看图的路都借不到时被拒，且不降级去猜', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://example.test' },
      apiKey: 'deepseek-key',
    })
    mockFindVisionCapableRoute.mockResolvedValue(null)
    queueCritiqueRound()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ result: RESULT })),
    )
    const [step] = stepsOf(events)
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.visionUnavailable,
    )
    expect(visionCalls()).toHaveLength(0)
  })

  /**
   * 视觉那一跳读不出结构时是**一条被拒的步**，不是抛错 ——
   * 抛错会让整轮以一句笼统的失败结束、日志停在半截。
   */
  it('视觉那一跳返回垃圾时退成一条可教的拒绝，流照常收尾', async () => {
    queueCritiqueRound('I looked at it and honestly it is fine')

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ result: RESULT })),
    )
    const [step] = stepsOf(events)
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.critiqueFailed,
    )
    expect(events.at(-1)?.type).toBe(ASSISTANT_OPERATOR_EVENTS.done)
  })

  it('看图这一步不带 inverse —— 它什么都没改，也就没有东西可撤', async () => {
    queueCritiqueRound()

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ result: RESULT })),
    )
    for (const step of stepsOf(events)) {
      expect(step.inverse).toBeUndefined()
    }
  })
})

/**
 * ⭐ P3-D · 卡死护栏（owner 2026-08-31 真机）。
 *
 * 复现的就是那一幕本身：用户递了三条链接，助手连跑三次**同参**的
 * 「查找已保存的参考图」，把步数烧光，最后回头支使用户自己去点图。
 */
describe('重复步护栏（P3-D）', () => {
  it('⭐ 三连搜：第二次同参检索当场被 repeatedStep 拒，⛔ 不再查一次库', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: '查找已保存的参考图',
          args: { query: 'cat poster' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: '查找已保存的参考图',
          // ⚠ 换了大小写与首尾空格 —— 规范化之后仍是同一次调用。
          args: { query: '  Cat Poster ' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    // 第一次真的跑了（running + done），第二次只剩一条被拒。
    expect(steps.map((step) => step.status)).toEqual([
      ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
      ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
    ])
    expect((steps[2] as { error: { reason: string } }).error.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep,
    )
    // ⭐ 库只被查了一次 —— 护栏跑在规划之前，重复那次一个查询都没发。
    expect(mockGetPublicGenerationPage).toHaveBeenCalledTimes(1)
  })

  it('连着第二次撞上就强制收尾：留一句话 + done，⛔ 不沉默', async () => {
    const searching = (title: string) => ({
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
        title,
        args: { query: 'cat poster' },
      },
    })
    queueTurns(
      searching('搜一次'),
      searching('再搜一次'),
      searching('还搜'),
      searching('不该跑到这一步'),
    )

    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ responseLanguage: 'chinese' }),
      ),
    )
    expect(typesOf(events)).toEqual([
      // running · done（第一次真跑）
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.step,
      // 第一次撞上 · 第二次撞上
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])
    const message = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.message,
    ) as { text: string }
    expect(message.text.length).toBeGreaterThan(0)
    // 第四轮压根没被问 —— 三次 LLM 往返之后就收尾了。
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(3)
  })

  it('⛔ 不堵**被拒**的那一步：条件可能已经变了，重试是对的行为', async () => {
    const noModel = {
      ...SNAPSHOT,
      model: null,
      specs: {
        aspectRatio: null,
        resolution: null,
        aspectRatioOptions: ['1:1', '16:9'],
        resolutionOptions: [],
      },
    }
    const setting = (title: string) => ({
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
        title,
        args: { aspectRatio: '16:9', resolution: '2K' },
      },
    })
    queueTurns(setting('设规格'), setting('再设一次'), { finished: true })

    const steps = stepsOf(
      await collect(
        runAssistantOperator('clerk-1', buildRequest({ snapshot: noModel })),
      ),
    )
    expect(steps).toHaveLength(2)
    // 两条都是老理由，⛔ 第二条不是 repeatedStep。
    for (const step of steps) {
      expect((step as { error: { reason: string } }).error.reason).toBe(
        ASSISTANT_OPERATOR_REJECT_REASON_IDS.noModelSelected,
      )
    }
  })
})

/** ⭐ P3-D · 计划降噪：一轮至多一条计划条，之后的折叠成一句话。 */
describe('计划条降噪（P3-D）', () => {
  it('第二个 plan 不再吐计划事件，而是折叠成一条 message', async () => {
    queueTurns(
      {
        plan: ['读表单', '写提示词'],
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: '读表单',
          args: {},
        },
      },
      { plan: ['改主意了', '先选模型'], finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(
      events.filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.plan),
    ).toHaveLength(1)
    const messages = events.filter(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.message,
    ) as { text: string }[]
    expect(messages.map((message) => message.text)).toEqual([
      '改主意了 · 先选模型',
    ])
  })

  it('这一轮本来就有话说时，重复的 plan 直接丢掉（⛔ 同一件事不说两遍）', async () => {
    queueTurns(
      {
        plan: ['读表单'],
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: '读表单',
          args: {},
        },
      },
      { plan: ['改主意了'], message: '换个路子：先选模型', finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(
      events.filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.plan),
    ).toHaveLength(1)
    const messages = events.filter(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.message,
    ) as { text: string }[]
    expect(messages.map((message) => message.text)).toEqual([
      '换个路子：先选模型',
    ])
  })
})

/**
 * ⭐ P3-D · 拍板 22：「你递的就是确认」。
 *
 * 🔬 owner 真机：用户粘了三条链接说「就这三张」，而当时没有任何工具能接 URL ——
 * 助手把「网页链接不能直接挂载」这条内部规则复述了四遍，最后让他自己去点图。
 */
describe('import_user_url（拍板 22）', () => {
  const GIVEN_URL =
    'https://upload.wikimedia.org/wikipedia/commons/a/a1/Example.jpg'

  function queueImport(url: string): void {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
          title: '收下你给的这张',
          args: { url },
        },
      },
      { finished: true },
    )
  }

  function saidByUser(text: string): Partial<AssistantOperatorRequest> {
    return { messages: [{ role: 'user', content: text }] }
  }

  it('⭐ 逐字出现在用户消息里 → 直接导入并挂上（改动型 step，带 inverse）', async () => {
    queueImport(GIVEN_URL)

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest(saidByUser(`找到了，就这张 ${GIVEN_URL}`)),
        ),
      ),
    )
    expect(steps).toHaveLength(2)
    const done = steps[1] as {
      status: string
      payload: { url: string; domain?: string }
      inverse: { url: string }
    }
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(done.payload.url).toBe(GIVEN_URL)
    // 域名由服务端现算，⛔ 不让模型写。
    expect(done.payload.domain).toBe('upload.wikimedia.org')
    // 撤销的本钱是**源地址**：落地地址此刻还不存在（取图那一跳在客户端）。
    expect(done.inverse.url).toBe(GIVEN_URL)
  })

  it('⛔ 结构闸：模型自己编的地址（用户从没说过）按 urlNotFromUser 拒', async () => {
    queueImport('https://evil.example.com/not-given.jpg')

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest(saidByUser(`就这张 ${GIVEN_URL}`)),
        ),
      ),
    )
    expect(steps).toHaveLength(1)
    expect((steps[0] as { error: { reason: string } }).error.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.urlNotFromUser,
    )
  })

  it('⛔ 同域名也不放行 —— 用户给的是一张图，不是一个站', async () => {
    queueImport('https://upload.wikimedia.org/wikipedia/commons/b/b2/Other.jpg')

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest(saidByUser(`就这张 ${GIVEN_URL}`)),
        ),
      ),
    )
    expect((steps[0] as { error: { reason: string } }).error.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.urlNotFromUser,
    )
  })

  it('助手自己说过的那条不算数 —— 只认 role:user 的消息', async () => {
    queueImport(GIVEN_URL)

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            messages: [
              { role: 'user', content: '帮我找张参考' },
              { role: 'assistant', content: `我找到了 ${GIVEN_URL}` },
            ],
          }),
        ),
      ),
    )
    expect((steps[0] as { error: { reason: string } }).error.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.urlNotFromUser,
    )
  })

  it('参考位满了按 referencesFull 拒（⛔ 不悄悄挤掉一张）', async () => {
    queueImport(GIVEN_URL)

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            ...saidByUser(`就这张 ${GIVEN_URL}`),
            snapshot: {
              ...SNAPSHOT,
              references: {
                items: [{ url: 'https://cdn.example.com/x.png' }],
                limit: 1,
              },
            },
          }),
        ),
      ),
    )
    expect((steps[0] as { error: { reason: string } }).error.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.referencesFull,
    )
  })

  it('⛔ 钱闸不松：这一步服务端一个字节都没碰（没查库、没搜网）', async () => {
    queueImport(GIVEN_URL)

    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest(saidByUser(`就这张 ${GIVEN_URL}`)),
      ),
    )
    expect(mockGetPublicGenerationPage).not.toHaveBeenCalled()
    expect(mockWebImageSearch).not.toHaveBeenCalled()
  })
})
// ── 视频域 + 跨域工具可用性（P4-A，拍板 8）────────────────────────────

const VIDEO_SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: {
    id: 'workspace:seedance-2.5-byteplus',
    label: 'Seedance 2.5 · BytePlus · 22 credits',
  },
  availableModels: [
    {
      id: 'workspace:seedance-2.5-byteplus',
      label: 'Seedance 2.5 · BytePlus · 22 credits',
    },
    {
      id: 'workspace:seedance-2.5',
      label: 'Seedance 2.5 · fal.ai · 48 credits',
    },
  ],
  videoSpecs: {
    durationSeconds: 5,
    aspectRatio: '16:9',
    resolution: null,
    durationOptions: [5, 10],
    aspectRatioOptions: ['16:9', '9:16'],
    resolutionOptions: ['720p', '1080p'],
  },
  references: { items: [], limit: 4 },
  audioReferences: { items: [], limit: 3, requiresVisual: true },
  sound: { value: null, effective: true },
}

function buildVideoRequest(
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    messages: [{ role: 'user', content: '帮我配一条雨夜短片' }],
    domain: 'video',
    snapshot: VIDEO_SNAPSHOT,
    ...overrides,
  }
}

function systemPrompt(): string {
  return (mockLlmTextCompletion.mock.calls[0]?.[0] as { systemPrompt: string })
    .systemPrompt
}

describe('域工具表', () => {
  it('视频域的清单里没有 set_count / set_specs，有那三条视频件 + 看片评审', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildVideoRequest()))

    const prompt = systemPrompt()
    // ⚠ v2 §2.2：裁的是**入口的 action 枚举**，不是工具条目 —— 提示里每条以
    //   `· <name> —` 出现在它那个动词底下。
    expect(prompt).toContain(`· ${ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs} —`)
    expect(prompt).toContain(
      `· ${ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference} —`,
    )
    expect(prompt).toContain(`· ${ASSISTANT_OPERATOR_TOOL_IDS.setSound} —`)
    // ⭐ 看片评审（第二期）：视频档**现在有** critique_result —— 它吃的仍然是静态图
    //    （客户端抽的 0/中/末 三帧），⛔ 不是把 mp4 喂给视觉线。
    expect(prompt).toContain(
      `· ${ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult} —`,
    )
    // ⭐ 列全集的代价是实打实的：看得见就会去试，而一轮只有 maxSteps 步。
    expect(prompt).not.toContain(`· ${ASSISTANT_OPERATOR_TOOL_IDS.setCount} —`)
    expect(prompt).not.toContain(`· ${ASSISTANT_OPERATOR_TOOL_IDS.setSpecs} —`)
  })

  it('图片域的清单里没有视频那三条', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain(`· ${ASSISTANT_OPERATOR_TOOL_IDS.setCount} —`)
    expect(prompt).not.toContain(
      `· ${ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs} —`,
    )
    expect(prompt).not.toContain(
      `· ${ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference} —`,
    )
    expect(prompt).not.toContain(`· ${ASSISTANT_OPERATOR_TOOL_IDS.setSound} —`)
  })

  it('域简报的收敛槽位进了系统提示（视频问的不是构图，是时长与什么在动）', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildVideoRequest()))
    expect(systemPrompt()).toContain('what actually moves')
  })

  it('⛔ 视频域调 set_count 被明确拒掉（noSuchControl，不是 malformedArgs）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setCount,
          title: 'two takes',
          args: { count: 2 },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })

  it('⛔ 图片域调视频件同样被拒 —— 两边都是闸，不是只裁提示词', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSound,
          title: 'mute it',
          args: { enabled: false },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(steps[0]).toMatchObject({
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setSound,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })

  /**
   * ⭐ 抽不出帧时**说实话**（第二期）。
   *
   * 这条曾经写的是「视频域即使带着 result 也不给看图」—— 那时的判据没错（借来的
   * 视觉线读不了 mp4），第二期换掉的不是判据而是路径：片子先在浏览器里抽成三张
   * 静态图。⛔ 而抽不出来的时候仍然**一步都不许猜**，只是拒绝理由从
   * 「这个域没这条工具」变成了「这一轮没有帧」——后者可教得多。
   */
  it('⛔ 视频域没有帧就不看：拒 videoFramesMissing，⛔ 不拿 mp4 地址去猜', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: 'look at it',
          args: {},
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            result: { url: 'https://cdn.example.test/clip.mp4' },
          }),
        ),
      ),
    )
    expect(steps[0]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: {
        reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.videoFramesMissing,
      },
    })
    // ⛔ 一次「看」都没发生过 —— 没有帧就没有 imageData。
    expect(visionCalls()).toHaveLength(0)
  })
})

/**
 * 看片评审（第二期 · 视频域）。
 *
 * ⭐ 这一组锁的是**三件事**，每一件都对应一次曾经很容易发生的静默失败：
 *  ① 喂给视觉线的是**三张转存后的帧**，⛔ 不是那条 mp4 地址；
 *  ② 三帧各自带着自己的位置名去看（start / mid / end），汇总那一跳不带图；
 *  ③ 帧集与被评的那段片子**同源**，客户端换一段就拒。
 */
describe('看片评审 · 视频域 critique_result', () => {
  const CLIP_URL = 'https://cdn.example.test/clip.mp4'
  const FRAME_URLS = [
    'https://cdn.example.test/frames/frame-01.webp',
    'https://cdn.example.test/frames/frame-02.webp',
    'https://cdn.example.test/frames/frame-03.webp',
  ]

  const VIDEO_CRITIQUE_JSON = {
    verdicts: [
      { severity: 'fail', text: '三帧几乎一模一样，画面没动起来' },
      { severity: 'pass', text: '角色的发色与服装从头到尾一致' },
    ],
    advice: '把动作写进提示词，或者补一张尾帧',
  }

  function submittedFrames(): NonNullable<
    AssistantOperatorRequest['videoFrames']
  > {
    return {
      sourceUrl: CLIP_URL,
      durationSeconds: 8,
      frames: [
        { index: 0, timestampSeconds: 0, dataUrl: 'data:image/webp;base64,AA' },
        { index: 1, timestampSeconds: 4, dataUrl: 'data:image/webp;base64,BB' },
        {
          index: 2,
          timestampSeconds: 7.92,
          dataUrl: 'data:image/webp;base64,CC',
        },
      ],
    }
  }

  beforeEach(() => {
    mockPersistVideoFrameSet.mockResolvedValue({
      sourceVideoUrl: CLIP_URL,
      durationSeconds: 8,
      planVersion: 1,
      strategy: 'endpoints-start-mid-end',
      frames: [
        {
          index: 0,
          timestampSeconds: 0,
          url: FRAME_URLS[0],
          width: 8,
          height: 8,
        },
        {
          index: 1,
          timestampSeconds: 4,
          url: FRAME_URLS[1],
          width: 8,
          height: 8,
        },
        {
          index: 2,
          timestampSeconds: 7.92,
          url: FRAME_URLS[2],
          width: 8,
          height: 8,
        },
      ],
    })
  })

  function queueVideoCritiqueRound(summary: unknown = VIDEO_CRITIQUE_JSON) {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: 'watch it',
          args: {},
        },
      },
      // 逐帧那三段（纯文本，⛔ 不是 JSON —— 它们是给汇总那一跳读的）
      '起手：少女站在雨里，红伞举过头顶。',
      '中段：姿势与起手几乎一致，只有雨丝位置变了。',
      '末帧：仍然是同一个站姿，没有走到任何新位置。',
      summary,
      { finished: true },
    )
  }

  it('抽 3 帧、逐帧看、再汇总 —— 喂进视觉线的是帧，⛔ 不是 mp4 地址', async () => {
    queueVideoCritiqueRound()

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            result: { url: CLIP_URL, modelLabel: 'Seedance 2.5' },
            videoFrames: submittedFrames(),
          }),
        ),
      ),
    )
    const done = steps.find(
      (step) =>
        step.tool === ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult &&
        step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )

    // 载荷这一侧给的是**视频**地址（卡片要拿它当封面），⛔ 不是 imageUrl。
    expect(done?.payload).toMatchObject({
      videoUrl: CLIP_URL,
      modelLabel: 'Seedance 2.5',
    })
    // 结果这一侧恒三帧，各带时间戳与位置名。
    expect(done?.result).toMatchObject({
      frames: [
        { t: 0, url: FRAME_URLS[0], label: 'start' },
        { t: 4, url: FRAME_URLS[1], label: 'mid' },
        { t: 7.92, url: FRAME_URLS[2], label: 'end' },
      ],
      verdicts: VIDEO_CRITIQUE_JSON.verdicts,
      advice: VIDEO_CRITIQUE_JSON.advice,
      borrowedVisionRoute: false,
    })

    // ⭐ 真的看了三下，而且看的是**帧**：mp4 地址一次都没进过 imageData。
    expect(visionCalls().map((call) => call.imageData)).toEqual(FRAME_URLS)
    expect(visionCalls().map((call) => call.imageData)).not.toContain(CLIP_URL)

    // 服务端复算的是 0/中/末 那份计划，⛔ 不是默认的「切 8 段取段中点」。
    expect(mockPersistVideoFrameSet).toHaveBeenCalledTimes(1)
    const persisted = mockPersistVideoFrameSet.mock.calls[0]?.[0] as {
      sourceVideoUrl: string
      plan: { strategy: string; entries: { timestampSeconds: number }[] }
    }
    expect(persisted.sourceVideoUrl).toBe(CLIP_URL)
    expect(persisted.plan.strategy).toBe('endpoints-start-mid-end')
    expect(
      persisted.plan.entries.map((entry) => entry.timestampSeconds),
    ).toEqual([0, 4, 7.92])
  })

  it('每一帧都被告知自己站在哪儿，汇总那一跳不带图', async () => {
    queueVideoCritiqueRound()
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildVideoRequest({
          result: { url: CLIP_URL },
          videoFrames: submittedFrames(),
        }),
      ),
    )

    const prompts = mockLlmTextCompletion.mock.calls.map(
      (call) => call[0] as { imageData?: unknown; userPrompt?: string },
    )
    const framePrompts = prompts.filter((call) => call.imageData !== undefined)
    expect(framePrompts[0]?.userPrompt).toContain('"start" FRAME')
    expect(framePrompts[1]?.userPrompt).toContain('"mid" FRAME')
    expect(framePrompts[2]?.userPrompt).toContain('"end" FRAME')

    // 汇总那一跳读的是三段描述，⛔ 不再送一次图（那一跳判的是帧之间的差异）。
    const summary = prompts.find((call) =>
      call.userPrompt?.includes('WHAT EACH FRAME SHOWS'),
    )
    expect(summary?.imageData).toBeUndefined()
    expect(summary?.userPrompt).toContain('[start @ 0s]')
    expect(summary?.userPrompt).toContain('[end @ 7.92s]')
  })

  it('⛔ 帧集与被评的片子不同源就拒 —— 客户端说是哪段不算数', async () => {
    // ⚠ 只排规划器那两轮：这一步在**看之前**就被拒了，逐帧那三段永远不会被消费，
    //   排进去只会漏给下一轮规划器（然后炸在 JSON 解析上）。
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: 'watch it',
          args: {},
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            result: { url: CLIP_URL },
            videoFrames: {
              ...submittedFrames(),
              sourceUrl: 'https://cdn.example.test/another.mp4',
            },
          }),
        ),
      ),
    )
    expect(steps[0]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset },
    })
    expect(mockPersistVideoFrameSet).not.toHaveBeenCalled()
  })

  it('三档严重度原样落进结果与观察行（异常 ≠ 否定）', async () => {
    queueVideoCritiqueRound({
      verdicts: [
        { severity: 'fail', text: '三帧几乎一模一样' },
        { severity: 'warn', text: '动起来了，但手在中段糊了一拍' },
        { severity: 'pass', text: '发色与服装一致' },
      ],
      advice: '补一张尾帧',
    })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildVideoRequest({
          result: { url: CLIP_URL },
          videoFrames: submittedFrames(),
        }),
      ),
    )
    const step = stepsOf(events).find(
      (candidate) =>
        candidate.tool === ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult &&
        candidate.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    ) as { result: { verdicts: { severity: string }[] } }
    expect(step.result.verdicts.map((verdict) => verdict.severity)).toEqual([
      'fail',
      'warn',
      'pass',
    ])
    // 观察行三个记号各不相同 —— ⛔ warn 不许写成 ✗，否则模型会把一次基本成功
    //   当成失败去重做。
    const observations = mockLlmTextCompletion.mock.calls
      .map((call) => (call[0] as { userPrompt?: string }).userPrompt ?? '')
      .join('\n')
    expect(observations).toContain('✗ 三帧几乎一模一样')
    expect(observations).toContain('⚠ 动起来了，但手在中段糊了一拍')
    expect(observations).toContain('✓ 发色与服装一致')
  })

  it('汇总读不出结构就按 critiqueFailed 拒 —— ⛔ 不假装看过', async () => {
    queueVideoCritiqueRound('不是 JSON，只是一段话')
    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            result: { url: CLIP_URL },
            videoFrames: submittedFrames(),
          }),
        ),
      ),
    )
    expect(steps[0]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.critiqueFailed },
    })
  })
})

/**
 * 具名帧槽 + 参考视频（第二期 · 视频域）。
 *
 * ⭐ 三条槽三条闸，判据一律来自**快照**（拍板 19）：模型 id 在这一层说了不算。
 */
describe('视频参考槽 · mount_reference slot', () => {
  const ASSET = {
    id: 'gen-1',
    url: 'https://cdn.example.test/1.png',
    outputType: 'IMAGE',
    prompt: 'a girl',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  }

  function queueMount(slot: string, args: Record<string, unknown> = {}) {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: 'girl' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
          title: 'mount',
          args: { assetId: 'gen-1', slot, ...args },
        },
      },
      { finished: true },
    )
  }

  /** ⚠ 取**终态**那一条：同一个 step id 先 running 后 done/error。 */
  function mountedStep(events: AssistantOperatorEvent[]) {
    return stepsOf(events)
      .filter(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.mountReference &&
          step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
      )
      .at(-1)
  }

  beforeEach(() => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [ASSET],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
  })

  it.each([['first'], ['last']] as const)(
    '首尾帧档：slot=%s 落进具名槽，载荷与 inverse 都带着它',
    async (slot) => {
      queueMount(slot)
      const step = mountedStep(
        await collect(
          runAssistantOperator(
            'clerk-1',
            buildVideoRequest({
              snapshot: {
                ...VIDEO_SNAPSHOT,
                frameReferences: { slots: 2 },
              },
            }),
          ),
        ),
      )
      expect(step?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
      expect(step?.payload).toMatchObject({ slot, url: ASSET.url })
      expect(step?.inverse).toEqual({ assetId: 'gen-1', slot })
    },
  )

  it('⛔ 只有首帧的模型上挂尾帧被拒（noSuchControl）—— 声明得比实现宽 = 静默丢掉', async () => {
    queueMount('last')
    const step = mountedStep(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: { ...VIDEO_SNAPSHOT, frameReferences: { slots: 1 } },
          }),
        ),
      ),
    )
    expect(step).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })

  it('⛔ 没有帧槽的档（多图参考 / 图片域）上挂首帧被拒', async () => {
    queueMount('first')
    const step = mountedStep(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    expect(step).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })

  it('参考视频：有槽就挂得上，槽满了按 referencesFull 拒', async () => {
    queueMount('video')
    const ok = mountedStep(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: {
              ...VIDEO_SNAPSHOT,
              videoReferences: { items: [], limit: 2 },
            },
          }),
        ),
      ),
    )
    expect(ok?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(ok?.payload).toMatchObject({ slot: 'video' })

    queueMount('video')
    const full = mountedStep(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: {
              ...VIDEO_SNAPSHOT,
              videoReferences: {
                items: [{ url: 'https://cdn.example.test/a.mp4' }],
                limit: 1,
              },
            },
          }),
        ),
      ),
    )
    expect(full).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.referencesFull },
    })
  })

  it('⛔ 宿主没有参考视频控件时挂视频被拒（工作台今天就是这一档）', async () => {
    queueMount('video')
    const step = mountedStep(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    expect(step).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })

  /**
   * ⭐ 挂首帧时**只提醒、不自动改**比例（拍板 19：比例是用户看得见的旋钮）。
   */
  it('挂首帧时在观察里提示去改比例，⛔ 服务端不替他改', async () => {
    queueMount('first')
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildVideoRequest({
          snapshot: {
            ...VIDEO_SNAPSHOT,
            videoSpecs: {
              ...VIDEO_SNAPSHOT.videoSpecs!,
              aspectRatioLock: 'adaptive',
            },
            frameReferences: { slots: 2 },
          },
        }),
      ),
    )
    expect(mountedStep(events)?.status).toBe(
      ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    // 观察里说清楚下一步，而**没有**任何一条 set_video_specs 被服务端替他跑掉。
    expect(lastUserPrompt()).toContain('set_video_specs')
    expect(lastUserPrompt()).toContain('adaptive')
    expect(
      stepsOf(events).some(
        (step) => step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
      ),
    ).toBe(false)
  })
})

/**
 * Seedance 2.5 首帧锁自适应（第二期，owner 2026-09-06）。
 * 出处：火山「视频生成教程」使用限制段 —— 有图的场景 `ratio` 只收 `adaptive`。
 */
describe('首帧锁 · aspectLockedByFirstFrame', () => {
  function lockedSnapshot(firstUrl: string | null) {
    return {
      ...VIDEO_SNAPSHOT,
      videoSpecs: {
        ...VIDEO_SNAPSHOT.videoSpecs!,
        aspectRatioLock: 'adaptive',
      },
      frameReferences: {
        slots: 2 as const,
        ...(firstUrl ? { first: { url: firstUrl } } : {}),
      },
    }
  }

  function queueRatio(aspectRatio: string) {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
          title: 'ratio',
          args: { aspectRatio },
        },
      },
      { finished: true },
    )
  }

  it('挂了首帧就只收 adaptive —— 其他值按 aspectLockedByFirstFrame 拒', async () => {
    queueRatio('9:16')
    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: lockedSnapshot('https://cdn.example.test/first.png'),
          }),
        ),
      ),
    )
    expect(steps[0]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: {
        reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.aspectLockedByFirstFrame,
      },
    })
  })

  it('⭐ adaptive 本来不在档位表里，锁上时照样放行（否则撞的是一句读不懂的 unknownValue）', async () => {
    queueRatio('adaptive')
    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: lockedSnapshot('https://cdn.example.test/first.png'),
          }),
        ),
      ),
    )
    const done = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toMatchObject({ aspectRatio: 'adaptive' })
  })

  it('⛔ 没挂首帧就不锁 —— 纯文生视频照旧能选具体比例', async () => {
    queueRatio('9:16')
    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({ snapshot: lockedSnapshot(null) }),
        ),
      ),
    )
    const done = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done?.payload).toMatchObject({ aspectRatio: '9:16' })
  })

  it('状态块在锁上时把档位表整张换掉，⛔ 不是补一句「但是」', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildVideoRequest({
          snapshot: lockedSnapshot('https://cdn.example.test/first.png'),
        }),
      ),
    )
    const state = lastUserPrompt()
    expect(state).toContain('PINNED to "adaptive"')
    expect(state).not.toContain('options: 16:9, 9:16')
  })
})

describe('set_video_specs', () => {
  it('三格一起下：给一格，另两格照当前值补齐，inverse 也带齐三格', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
          title: 'ten seconds',
          args: { durationSeconds: 10 },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    const done = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done).toMatchObject({
      payload: { durationSeconds: 10, aspectRatio: '16:9', resolution: null },
      inverse: { durationSeconds: 5, aspectRatio: '16:9', resolution: null },
    })
  })

  it('值不在档位表里就拒，并把可选值说出来', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
          title: 'thirty seconds',
          args: { durationSeconds: 30 },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    expect(steps[0]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownValue },
    })
    expect((steps[0] as { error: { detail: string } }).error.detail).toContain(
      '5, 10',
    )
  })

  it('一格都没给就拒 —— 一次空调用白烧一步', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
          title: 'specs',
          args: {},
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.emptyValue },
    })
  })

  it('⭐ 没选模型时按 noModelSelected 拒并指向 set_model（既有 precondition 模式）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
          title: 'ten seconds',
          args: { durationSeconds: 10 },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: {
              ...VIDEO_SNAPSHOT,
              model: null,
              videoSpecs: {
                durationSeconds: null,
                aspectRatio: null,
                resolution: null,
                durationOptions: [],
                aspectRatioOptions: [],
                resolutionOptions: [],
              },
            },
          }),
        ),
      ),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noModelSelected },
    })
  })

  it('⭐ 只有一张档位表非空照样能设（Kling 没有分辨率档 —— 照搬图片那条会让它无解）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
          title: 'portrait',
          args: { aspectRatio: '9:16' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: {
              ...VIDEO_SNAPSHOT,
              videoSpecs: {
                durationSeconds: null,
                aspectRatio: '16:9',
                resolution: null,
                durationOptions: [],
                aspectRatioOptions: ['16:9', '9:16'],
                resolutionOptions: [],
              },
            },
          }),
        ),
      ),
    )
    const done = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done).toMatchObject({
      payload: { aspectRatio: '9:16', durationSeconds: null, resolution: null },
    })
  })
})

describe('视频域的音频参考与出声开关', () => {
  it('search_assets 不写 kind 时不搜音频；写了 audio 才搜', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'look for takes',
          args: { query: 'rainy night' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'look for voices',
          args: { query: 'lan', kind: 'audio' },
        },
      },
      { finished: true },
    )

    await collect(runAssistantOperator('clerk-1', buildVideoRequest()))
    expect(mockGetPublicGenerationPage.mock.calls[0][0].type).toEqual([
      'image',
      'video',
    ])
    expect(mockGetPublicGenerationPage.mock.calls[1][0].type).toEqual(['audio'])
  })

  it('挂音频要先检索到它；挂的若是图片则按 unknownAsset 拒（两个槽别混）', async () => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [
        {
          id: 'gen-img',
          url: 'https://cdn.example.test/a.png',
          outputType: 'IMAGE',
          prompt: 'rain',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search',
          args: { query: 'rain' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
          title: 'mount voice',
          args: { assetId: 'gen-img' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    expect(steps.at(-1)).toMatchObject({
      tool: ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset },
    })
  })

  it('挂音频成功时带上归属，并把「这条线路还差一张图」说出来（台账 A ②）', async () => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [
        {
          id: 'gen-audio',
          url: 'https://cdn.example.test/line.mp3',
          outputType: 'AUDIO',
          prompt: 'I am not leaving',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
          title: 'search voices',
          args: { query: 'lan', kind: 'audio' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
          title: 'mount voice',
          args: { assetId: 'gen-audio', ownerName: 'Lan' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    expect(steps.at(-1)).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      payload: {
        assetId: 'gen-audio',
        url: 'https://cdn.example.test/line.mp3',
        ownerName: 'Lan',
      },
      inverse: { assetId: 'gen-audio' },
    })
    expect(lastUserPrompt()).toContain('refuses audio-only input')
  })

  it('⭐ set_sound 的 inverse 记的是三态原值（null = 用户没设过）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSound,
          title: 'silent',
          args: { enabled: false },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildVideoRequest())),
    )
    const done = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done).toMatchObject({
      payload: { enabled: false },
      inverse: { enabled: null },
    })
  })

  it('线路没有出声开关时按 noSuchControl 拒', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setSound,
          title: 'silent',
          args: { enabled: false },
        },
      },
      { finished: true },
    )

    // ⚠ 「整节缺席」才是这条用例的内容：字段在但为 null 是另一档（用户没设过）。
    const withoutSound = { ...VIDEO_SNAPSHOT }
    delete withoutSound.sound
    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({ snapshot: withoutSound }),
        ),
      ),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })
})
// ─── LoRA 装配台（P4-C）─────────────────────────────────────────────

/**
 * 一条**可挂**的候选。`importable:true` + 有 `importPayload` 是这一档的全部条件
 * （门槛写在检索层的数据上，⛔ 不在工具环里重算）。
 */
function loraCandidate(over: Record<string, unknown> = {}) {
  return {
    candidateId: 'civitai:12345:67890',
    source: 'civitai',
    name: 'Watercolor Storybook',
    author: 'someone',
    license: {
      label: null,
      commercialUse: ['Image'],
      allowDerivatives: true,
      allowNoCredit: false,
      known: true,
    },
    baseModelFamily: 'illustrious',
    type: 'style',
    triggerWords: ['watercolor'],
    sampleImageUrls: ['https://cdn.example.com/lora-a.png'],
    fileSizeBytes: null,
    pageUrl: 'https://civitai.com/models/12345',
    downloads: 4200,
    metadataCompleteness: 'partial',
    importable: true,
    alreadyMounted: false,
    alreadyImported: false,
    importPayload: {
      name: 'Watercolor Storybook',
      triggerWord: 'watercolor',
      loraUrl: 'https://civitai.com/api/download/models/67890',
      type: 'style',
      baseModelFamily: 'illustrious',
      provider: 'civitai',
      modelVersionId: 67890,
      sourceSnapshot: {
        source: 'civitai',
        author: 'someone',
        license: {
          label: null,
          commercialUse: ['Image'],
          allowDerivatives: true,
          allowNoCredit: false,
          known: true,
        },
        pageUrl: 'https://civitai.com/models/12345',
        revision: null,
        retrievedAt: '2026-08-31T00:00:00.000Z',
        fileSizeBytes: null,
        metadataCompleteness: 'partial',
      },
    },
    ...over,
  }
}

const LORA_SNAPSHOT: AssistantOperatorRequest['snapshot'] = {
  prompt: '',
  negativePrompt: '',
  model: { id: 'illustrious-xl', label: 'Illustrious XL' },
  availableModels: [
    { id: 'illustrious-xl', label: 'Illustrious XL' },
    { id: 'anima-dit-base-v10-runner', label: 'Anima DiT' },
  ],
  references: { items: [], limit: 2 },
  loras: {
    items: [
      {
        id: 'lora-asset-1',
        name: 'Ink Lines',
        weight: 0.8,
        enabled: true,
        family: 'illustrious',
        compatible: true,
      },
    ],
    baseFamily: 'illustrious',
    minWeight: 0.1,
    maxWeight: 2,
  },
}

function buildLoraRequest(
  overrides: Partial<AssistantOperatorRequest> = {},
): AssistantOperatorRequest {
  return {
    messages: [{ role: 'user', content: '帮我找个水彩画风的 LoRA 配上' }],
    domain: 'lora',
    snapshot: LORA_SNAPSHOT,
    ...overrides,
  }
}

describe('LoRA 装配台域（P4-C）', () => {
  it('工具表里有那四条 LoRA 件，没有 set_specs / set_count / critique_result', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildLoraRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.searchLoras)
    expect(prompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.mountLora)
    expect(prompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.unmountLora)
    expect(prompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight)
    /**
     * ⭐ 装配台**有比例却没有清晰度**，而 `set_specs` 两个字段都是必填 ——
     * 摆一条这里永远无解的工具正是 2026-08-30「三连红而表单没动」的形状。
     */
    expect(prompt).not.toContain(`- ${ASSISTANT_OPERATOR_TOOL_IDS.setSpecs}:`)
    // 单次出图，界面上压根没有张数控件。
    expect(prompt).not.toContain(`- ${ASSISTANT_OPERATOR_TOOL_IDS.setCount}:`)
    expect(prompt).not.toContain(
      `- ${ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult}:`,
    )
  })

  it('状态块里印出挂载栈、底模家族，并明说「没有数量上限」', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readState,
          title: 'look',
          args: {},
        },
      },
      { finished: true },
    )
    await collect(runAssistantOperator('clerk-1', buildLoraRequest()))

    const digest = lastUserPrompt()
    expect(digest).toContain('lora-asset-1')
    expect(digest).toContain('Ink Lines')
    expect(digest).toContain('Base model family: illustrious')
    /**
     * ⭐ 这一句是**产品事实**：三个后端全不限挂载数。不说出来的话模型会按别处
     * 的常识发明一条上限，然后劝用户先摘一把 —— 一条没人写过的限制被凭空转述。
     */
    expect(digest).toContain('NO limit on how many LoRAs can be stacked')
  })

  it('图片域调 mount_lora 被域闸按 noSuchControl 拒（提示词不是闸）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount',
          args: { candidateId: 'civitai:1:2' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })

  it('search_loras 复用既有检索，候选带许可与底模兼容判据；不兼容那条如实标出', async () => {
    mockSearchLoraCandidates.mockResolvedValue({
      query: 'watercolor',
      candidates: [
        loraCandidate(),
        // ⭐ Anima 是 DiT：装不上 SDXL 系底模。⛔ 助手不许把它当成一条可用建议。
        loraCandidate({
          candidateId: 'civitai:999:888',
          name: 'Anima Only',
          baseModelFamily: 'anima',
        }),
        // ⭐ 导入不了的那条**照样返回**（策略 C：不阻断展示，如实说明）。
        loraCandidate({
          candidateId: 'hf:someone/x@main#a.safetensors',
          source: 'huggingface',
          name: 'Gated Repo',
          importable: false,
          notImportableReason: 'gated_repo',
          importPayload: null,
        }),
      ],
      sources: [
        { source: 'civitai', status: 'ok', count: 2, tookMs: 10 },
        { source: 'huggingface', status: 'ok', count: 1, tookMs: 12 },
      ],
    })

    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find a watercolor lora',
          args: { query: 'watercolor storybook' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )

    // ⭐ 底模家族是**软偏好**传下去的（检索层自己说的：硬过滤会掐掉「你该换底模」）。
    expect(mockSearchLoraCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-db-1',
        query: 'watercolor storybook',
        baseModelFamily: 'illustrious',
        mountedNames: ['Ink Lines'],
      }),
    )

    const done = steps[1] as unknown as {
      result: {
        candidates: { candidateId: string; compatible: boolean }[]
        sources: unknown[]
      }
    }
    expect(done.result.candidates).toHaveLength(3)
    expect(done.result.candidates[0]?.compatible).toBe(true)
    // anima ≠ sdxl 桶 —— 与界面上那条橙色警示行同一个谓词。
    expect(done.result.candidates[1]?.compatible).toBe(false)
    expect(done.result.candidates[2]).toMatchObject({
      importable: false,
      notImportableReason: 'gated_repo',
    })
    // 每个源一条回执 —— 「空不是挂」。
    expect(done.result.sources).toHaveLength(2)
    // ⛔ 导入载荷不跟着候选流到客户端（它只住在 mount_lora 的载荷上）。
    expect(JSON.stringify(done.result.candidates)).not.toContain(
      'importPayload',
    )
  })

  it('两个源都挂了时，观察里说的是「搜索出问题」而不是「没有这把 LoRA」', async () => {
    mockSearchLoraCandidates.mockResolvedValue({
      query: 'x',
      candidates: [],
      sources: [
        { source: 'civitai', status: 'failed', count: 0, tookMs: 1 },
        { source: 'huggingface', status: 'failed', count: 0, tookMs: 1 },
      ],
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find',
          args: { query: 'x' },
        },
      },
      { finished: true },
    )
    await collect(runAssistantOperator('clerk-1', buildLoraRequest()))
    expect(lastUserPrompt()).toContain('actually FAILED')
  })

  it('mount_lora 只认本轮搜到的 candidateId，编的按 unknownLora 拒', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount',
          args: { candidateId: 'civitai:made:up' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownLora },
    })
  })

  it('挂一把：载荷带 importPayload 与触发词，inverse 只有 candidateId', async () => {
    mockSearchLoraCandidates.mockResolvedValue({
      query: 'watercolor',
      candidates: [loraCandidate()],
      sources: [{ source: 'civitai', status: 'ok', count: 1, tookMs: 3 }],
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find',
          args: { query: 'watercolor' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount it',
          args: { candidateId: 'civitai:12345:67890', weight: 0.7 },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    const mounted = steps[3] as unknown as {
      payload: Record<string, unknown>
      inverse: Record<string, unknown>
    }
    expect(mounted.payload).toMatchObject({
      candidateId: 'civitai:12345:67890',
      name: 'Watercolor Storybook',
      weight: 0.7,
      triggerWords: ['watercolor'],
      compatible: true,
    })
    expect(mounted.payload.importPayload).toBeTruthy()
    // ⭐ 库记录 id 在服务端还不存在（导入那一跳在客户端）—— 撤销只能按候选反查。
    expect(mounted.inverse).toEqual({ candidateId: 'civitai:12345:67890' })
  })

  it('导入不了的那把按 loraNotImportable 拒，⛔ 不静默跳过', async () => {
    mockSearchLoraCandidates.mockResolvedValue({
      query: 'x',
      candidates: [
        loraCandidate({
          candidateId: 'hf:gated',
          importable: false,
          notImportableReason: 'gated_repo',
          importPayload: null,
        }),
      ],
      sources: [{ source: 'huggingface', status: 'ok', count: 1, tookMs: 3 }],
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find',
          args: { query: 'x' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount it',
          args: { candidateId: 'hf:gated' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    expect(steps[2]).toMatchObject({
      error: {
        reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.loraNotImportable,
      },
    })
  })

  it('⛔ 不设数量上限：挂载栈已经很满时照样挂得上', async () => {
    const packed: AssistantOperatorRequest['snapshot'] = {
      ...LORA_SNAPSHOT,
      loras: {
        baseFamily: 'illustrious',
        minWeight: 0.1,
        maxWeight: 2,
        items: Array.from({ length: 8 }, (_unused, index) => ({
          id: `lora-${index}`,
          name: `Stacked ${index}`,
          weight: 1,
          enabled: true,
          family: 'illustrious',
          compatible: true,
        })),
      },
    }
    mockSearchLoraCandidates.mockResolvedValue({
      query: 'x',
      candidates: [loraCandidate()],
      sources: [{ source: 'civitai', status: 'ok', count: 1, tookMs: 3 }],
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find',
          args: { query: 'x' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount it',
          args: { candidateId: 'civitai:12345:67890' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(
        runAssistantOperator('clerk-1', buildLoraRequest({ snapshot: packed })),
      ),
    )
    expect(steps[3]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    })
  })

  it('装不上的那把**照样挂得上**，但观察里必须说出来（界面上用户也挂得上）', async () => {
    mockSearchLoraCandidates.mockResolvedValue({
      query: 'x',
      candidates: [
        loraCandidate({ candidateId: 'civitai:a:b', baseModelFamily: 'anima' }),
      ],
      sources: [{ source: 'civitai', status: 'ok', count: 1, tookMs: 3 }],
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find',
          args: { query: 'x' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount it',
          args: { candidateId: 'civitai:a:b' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    expect(steps[3]).toMatchObject({
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      payload: { compatible: false },
    })
    expect(lastUserPrompt()).toContain('will not load on the base')
  })

  it('调权重：越界按 unknownValue 拒，⛔ 不做就近夹取', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
          title: 'crank it',
          args: { loraId: 'lora-asset-1', weight: 5 },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownValue },
    })
  })

  it('调权重 / 摘除的 inverse 都落回改前那个数', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
          title: 'tune',
          args: { loraId: 'lora-asset-1', weight: 1.2 },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
          title: 'drop it',
          args: { loraId: 'lora-asset-1' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    expect(steps[1]).toMatchObject({
      payload: { loraId: 'lora-asset-1', weight: 1.2 },
      inverse: { loraId: 'lora-asset-1', weight: 0.8 },
    })
    /**
     * ⭐ 第二步的 inverse 是**第一步之后**的值（1.2），不是这一轮开始时的 0.8 ——
     * 工作副本可变就是为了这个（同 `set_prompt` 连改两次那条）。
     */
    expect(steps[3]).toMatchObject({
      inverse: { loraId: 'lora-asset-1', weight: 1.2 },
    })
  })

  it('摘一把没挂着的按 loraNotMounted 拒（候选 id ≠ 挂载项 id）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
          title: 'drop',
          args: { loraId: 'civitai:12345:67890' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.loraNotMounted },
    })
  })

  it('同一把候选换个权重再挂一次仍算重复（换参数绕不过去）', async () => {
    mockSearchLoraCandidates.mockResolvedValue({
      query: 'x',
      candidates: [loraCandidate()],
      sources: [{ source: 'civitai', status: 'ok', count: 1, tookMs: 3 }],
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find',
          args: { query: 'x' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount',
          args: { candidateId: 'civitai:12345:67890', weight: 0.8 },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
          title: 'mount again',
          args: { candidateId: 'civitai:12345:67890', weight: 0.9 },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildLoraRequest())),
    )
    expect(steps[4]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.repeatedStep },
    })
  })

  it('没有挂载栈的快照上，那几条 LoRA 工具按 noSuchControl 拒', async () => {
    const withoutStack = { ...LORA_SNAPSHOT }
    delete withoutStack.loras
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
          title: 'find',
          args: { query: 'x' },
        },
      },
      { finished: true },
    )
    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildLoraRequest({ snapshot: withoutStack }),
        ),
      ),
    )
    expect(steps[0]).toMatchObject({
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
  })
})

/**
 * ⭐ 生成器方言（提示词准确性 P0）。
 *
 * 操作员按的是 `set_prompt` 这颗按钮，而按钮后面那台机器吃什么方言，以前它不知道 ——
 * 于是给 NovelAI 写电影感散文，表单填得漂亮，出图是废的。这一组锁住「快照选了哪台
 * 机器，系统提示里就有那台机器的方言」。
 */
describe('目标模型的提示词方言进系统提示', () => {
  function buildModelRequest(modelId: string): AssistantOperatorRequest {
    return buildRequest({
      snapshot: {
        ...SNAPSHOT,
        model: { id: modelId, label: modelId },
        availableModels: [{ id: modelId, label: modelId }],
      },
    })
  }

  it('NovelAI 上带 NovelAI 的 :: 数值强调，而不是 A1111 的括号权重', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildModelRequest(AI_MODELS.NOVELAI_V45_FULL),
      ),
    )

    const prompt = systemPrompt()
    expect(prompt).toContain('1.3::tag ::')
    expect(prompt).toContain('{tag}')
    // tag 方言硬规矩与旧助手同一个常量，不是抄的第二份字符串。
    expect(prompt).toContain(TAG_BASED_GENERATION_PROMPT_RULE)
  })

  it('gpt-image 上不挂 tag 规矩（自然语言模型别被赶去写 danbooru）', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildModelRequest(AI_MODELS.OPENAI_GPT_IMAGE_2),
      ),
    )

    const prompt = systemPrompt()
    expect(prompt).not.toContain(TAG_BASED_GENERATION_PROMPT_RULE)
    expect(prompt).not.toContain('danbooru')
    // 但方言段本身还是要在：它带的是这台机器的自然语言写法。
    expect(prompt).toContain('WHAT THE PROMPT MUST LOOK LIKE ON THIS MODEL')
    expect(prompt).toContain(AI_MODELS.OPENAI_GPT_IMAGE_2)
  })

  it('Pony 上带上必带的 score_ 前缀（漏了它画面直接垮）', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildModelRequest(AI_MODELS.PONY_DIFFUSION_V6),
      ),
    )
    expect(systemPrompt()).toContain('score_9, score_8_up, score_7_up')
  })

  /**
   * ⭐ 视频那半张名册（`model-strengths.media`）也得进方言段 —— 它跟图片那张
   * 表是分开的两个文件，只查其中一张的下场是视频模型全部退回 adapter 兜底。
   */
  it('Kling 上带多镜头的 Shot 1 写法与 negative 上限', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildModelRequest(AI_MODELS.KLING_V3_PRO),
      ),
    )

    const prompt = systemPrompt()
    expect(prompt).toContain('Shot 1')
    expect(prompt).toContain('2500')
  })

  /**
   * ⭐ Seedance 的控制规则以前只活在独立路由里（`/api/studio/seedance-prompt-plan`），
   * 工具环写提示词时够不着 —— 同一台机器两条入口两套规则。这一组锁住：选了
   * Seedance，系统提示里就有那一代的控制规则、素材分工契约、硬否定串和镜头语法。
   */
  it('Seedance 2.5 上带 2.5 的控制规则 + 硬否定串 + 镜头语法', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator('clerk-1', buildModelRequest(AI_MODELS.SEEDANCE_25)),
    )

    const prompt = systemPrompt()
    expect(prompt).toContain(SEEDANCE_25_CONTROL_RULES)
    expect(prompt).toContain(
      'SEEDANCE 2.5 CONTROL RULES — finalPrompt structure and stability.',
    )
    // 素材分工契约与硬否定串：owner 的真实流程里反复手写的那两条。
    expect(prompt).toContain('REFERENCE ASSET CONTRACT')
    expect(prompt).toContain('空气波纹')
    expect(prompt).toContain('冻结姿势')
    expect(prompt).toContain('整图缩放冒充运镜')
    expect(prompt).toContain('字幕')
    // 镜头语法与 ScriptDoc 同源，不是这里现编的第二份。
    expect(prompt).toContain(CINEMATIC_SHOT_GRAMMAR)
    // 2.0 那份不能同时在场，否则模型两套分段方言二选一。
    expect(prompt).not.toContain(SEEDANCE_20_CONTROL_RULES)
  })

  it('Seedance 2.0 上带的是 2.0 那份（镜头号，不是时间戳）', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildModelRequest(AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS),
      ),
    )

    const prompt = systemPrompt()
    expect(prompt).toContain(SEEDANCE_20_CONTROL_RULES)
    expect(prompt).toContain('镜头1 / 镜头2 / 镜头3 / 镜头4')
    expect(prompt).toContain('空气波纹')
    expect(prompt).not.toContain(SEEDANCE_25_CONTROL_RULES)
  })

  it('不是 Seedance 的模型不挂 Seedance 控制规则', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator('clerk-1', buildModelRequest(AI_MODELS.VEO_31)),
    )

    const prompt = systemPrompt()
    expect(prompt).toContain('nouns')
    expect(prompt).not.toContain('SEEDANCE 2.5 CONTROL RULES')
    expect(prompt).not.toContain('SEEDANCE 2.0 CONTROL RULES')
  })

  it('快照没选模型时不印方言段（别对着一台还没定的机器讲方言）', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, model: null } }),
      ),
    )
    expect(systemPrompt()).not.toContain(
      'WHAT THE PROMPT MUST LOOK LIKE ON THIS MODEL',
    )
  })
})

// ─── persona 风格段（§8.5）与项目规则段（§10）────────────────────

describe('persona 风格段', () => {
  it('⭐ 默认 persona = 简短直接 · 简洁：风格段是「结论一句 + 下一步一句」', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain("You are PixelVault's workbench operator.")
    // terse 档（默认）
    expect(prompt).toContain('Be terse.')
    // concise 档（默认）——**两句各自的职责**，理由指到 detail 去。
    expect(prompt).toContain(
      'Two sentences: what you concluded, then what happens next.',
    )
    expect(prompt).toContain('Reasoning goes in "detail", never in "message".')
    // ⛔ 换掉的那两句一个字都不该再出现。
    expect(prompt).not.toContain('Answer in 2–4 sentences.')
    expect(prompt).not.toContain('Keep it professional and even')
    // auto 档什么都不写 —— 那就是今天的行为
    expect(prompt).not.toContain('Always open with a plan card')
    expect(prompt).not.toContain('Skip the plan unless')
  })

  it('名字非空时只换首句主语，⛔ 不覆盖域人设', async () => {
    mockGetAssistantPersonaByUserId.mockResolvedValue({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      name: 'Mika',
    })
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain("You are Mika, PixelVault's workbench operator.")
    // 域人设照旧在（图片档那句）
    expect(prompt).toContain('WHAT THIS DOMAIN TURNS ON')
  })

  it('长度三档各自映射成句数区间，⛔ 不给无边界形容词', async () => {
    for (const [verbosity, expected] of [
      [ASSISTANT_PERSONA_VERBOSITY_IDS.standard, 'Answer in 2–4 sentences.'],
      [
        ASSISTANT_PERSONA_VERBOSITY_IDS.detailed,
        'Answer in up to 6 sentences.',
      ],
    ] as const) {
      mockLlmTextCompletion.mockReset()
      mockGetAssistantPersonaByUserId.mockResolvedValue({
        ...ASSISTANT_PERSONA_DEFAULTS,
        avatarUrl: null,
        verbosity,
      })
      queueTurns({ finished: true })
      await collect(runAssistantOperator('clerk-1', buildRequest()))
      expect(systemPrompt()).toContain(expected)
    }
  })

  it('默认行为 always / direct 各印一句', async () => {
    mockGetAssistantPersonaByUserId.mockResolvedValue({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      planMode: ASSISTANT_PERSONA_PLAN_MODE_IDS.always,
    })
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(systemPrompt()).toContain('Always open with a plan card')
  })

  it('自定义语气原样单引号引入，且带那句前缀', async () => {
    mockGetAssistantPersonaByUserId.mockResolvedValue({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      tone: ASSISTANT_PERSONA_TONE_IDS.custom,
      toneCustom: 'Talk like a film editor',
    })
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    expect(systemPrompt()).toContain(
      "the creator described how they want you to sound: 'Talk like a film editor'",
    )
  })

  it('persona 的语言档覆盖请求里的那一档', async () => {
    mockGetAssistantPersonaByUserId.mockResolvedValue({
      ...ASSISTANT_PERSONA_DEFAULTS,
      avatarUrl: null,
      language: 'chinese',
    })
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ responseLanguage: 'english' }),
      ),
    )
    expect(systemPrompt()).toContain('Reply in Simplified Chinese.')
  })

  it('风格段插在 HOW YOU TALK 之后、TOOLS 之前', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    const style = 'Two sentences: what you concluded, then what happens next.'
    expect(prompt.indexOf('HOW YOU TALK')).toBeLessThan(prompt.indexOf(style))
    expect(prompt.indexOf(style)).toBeLessThan(prompt.indexOf('TOOLS:'))
  })
})

describe('项目规则（§10，拍板 23）', () => {
  const RULE = {
    id: 'rule-1',
    scope: null,
    text: 'Never put text inside the picture.',
    source: 'creator' as const,
    createdAt: '2026-09-01T10:00:00.000Z',
  }

  it('零条规则时不印规则段', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(systemPrompt()).not.toContain('STANDING RULES THIS CREATOR WROTE')
  })

  it('有规则时逐条印进系统提示，并要求引用时吐 id', async () => {
    mockListProjectRules.mockResolvedValue([RULE])
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain('STANDING RULES THIS CREATOR WROTE DOWN')
    expect(prompt).toContain('[rule-1]')
    expect(prompt).toContain(RULE.text)
    expect(prompt).toContain('recorded 2026-09-01')
    expect(prompt).toContain('"ruleHits"')
  })

  it('引用一条已知规则 → 吐一帧 rule_hit，原文来自库不是模型', async () => {
    mockListProjectRules.mockResolvedValue([RULE])
    queueTurns({
      ruleHits: ['rule-1'],
      message: 'Keeping the frame text-free.',
      finished: true,
    })

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const hits = events.filter(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.ruleHit,
    )
    expect(hits).toEqual([
      {
        type: ASSISTANT_OPERATOR_EVENTS.ruleHit,
        ruleId: 'rule-1',
        text: RULE.text,
        source: 'creator',
        createdAt: RULE.createdAt,
      },
    ])
  })

  it('编出来的规则 id 被剥掉，⛔ 不作废这一轮', async () => {
    mockListProjectRules.mockResolvedValue([RULE])
    queueTurns({ ruleHits: ['rule-nope'], message: 'ok', finished: true })

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(
      events.filter(
        (event) => event.type === ASSISTANT_OPERATOR_EVENTS.ruleHit,
      ),
    ).toEqual([])
    expect(events.at(-1)?.type).toBe(ASSISTANT_OPERATOR_EVENTS.done)
  })

  it('add_project_rule 落库并吐一条带 ruleId 的改动型 step', async () => {
    mockAddProjectRule.mockResolvedValue({
      id: 'rule-9',
      scope: 'image',
      text: 'Skin tones stay warm.',
      source: 'assistant',
      createdAt: '2026-09-06T10:00:00.000Z',
    })
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
          title: 'Note the rule',
          args: { text: 'Skin tones stay warm.', scope: 'image' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    const done = steps.find(
      (step) =>
        step.tool === ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule &&
        step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
    )
    expect(done).toBeDefined()
    expect(done?.payload).toMatchObject({
      ruleId: 'rule-9',
      source: 'assistant',
    })
    // 撤销的本钱：inverse 里放的是库记录 id
    expect(done?.inverse).toEqual({ ruleId: 'rule-9' })
    // ⛔ 来源由服务端写死，不从模型收
    expect(mockAddProjectRule).toHaveBeenCalledWith('user-db-1', {
      text: 'Skin tones stay warm.',
      scope: 'image',
      source: 'assistant',
    })
  })

  it('撞上限时按 ruleLimitReached 拒，⛔ 不静默丢弃', async () => {
    const { ProjectRuleLimitError } =
      await import('@/services/project-rule.service')
    mockAddProjectRule.mockRejectedValue(new ProjectRuleLimitError(50))
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
          args: { text: 'one more rule' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    const rejected = steps.find(
      (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
    )
    expect((rejected?.error as { reason: string } | undefined)?.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.ruleLimitReached,
    )
  })

  it('同一句规则记两遍在规划期就被拒（换标点也绕不过去）', async () => {
    mockListProjectRules.mockResolvedValue([RULE])
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
          args: { text: RULE.text },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(mockAddProjectRule).not.toHaveBeenCalled()
    expect(
      steps.some(
        (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      ),
    ).toBe(true)
  })
})

/**
 * 计划 → 多步确认 / 问题卡（v2 §3.1 / §3.3 / §3.4）。
 *
 * ⚠ 判**在服务端**（v1 那条客户端 `shouldShowPlanCard` 随计划请求帧一起删了）：
 * 有题就问一题，没题而步数够多就出多步确认卡，两条路都当场停流。
 */
describe('计划协议 · plan / ask / confirm', () => {
  it('⭐ 模型写了 confirmPlan：plan 之后紧跟 confirm(multistep) 并停流，⛔ 一步都不落', async () => {
    queueTurns(
      {
        plan: ['看一眼表单', '写提示词', '备好生成键'],
        // ⭐ v2 决策 4：出不出卡由模型说，⛔ 服务端不数步数。
        confirmPlan: true,
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'a girl under a red umbrella' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    // ⭐ 用户要在**任何一步落地之前**拍板：那一步落下去之后再问就是事后通知。
    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.plan,
      ASSISTANT_OPERATOR_EVENTS.confirm,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    expect(events[1]).toMatchObject({
      confirm: {
        kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep,
        steps: [
          { id: 'plan-1', label: '看一眼表单' },
          { id: 'plan-2', label: '写提示词' },
          { id: 'plan-3', label: '备好生成键' },
        ],
      },
    })
  })

  it('⛔ 三步计划但模型没写 confirmPlan —— 不拦，直接开跑（死阈值已删，决策 4）', async () => {
    queueTurns(
      {
        plan: ['看一眼表单', '写提示词', '换模型'],
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'a girl under a red umbrella' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.plan,
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])
  })

  it('反问题带 id 与图示；词表外的 visual 被剥掉而整轮照跑', async () => {
    queueTurns(
      {
        plan: ['定构图', '写提示词'],
        questions: [
          {
            header: '取景',
            question: '取多少身？',
            options: [
              {
                label: '半身',
                description: '腰以上，脸看得清。',
                visual: 'comp.halfBody',
              },
              // ⛔ 词表外的 id —— 剥掉那个图示，⛔ 不作废这一轮。
              {
                label: '全身',
                description: '连鞋一起，服装看得全。',
                visual: 'comp.wholeThing',
              },
            ],
          },
        ],
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'half body portrait' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    // ⚠ 计划帧照旧发（进度带要用），问题卡紧跟其后并停流。
    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.plan,
      ASSISTANT_OPERATOR_EVENTS.ask,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    expect(events[0]).toMatchObject({
      steps: [
        { id: 'plan-1', label: '定构图' },
        { id: 'plan-2', label: '写提示词' },
      ],
    })
    const { question } = events[1] as Extract<
      AssistantOperatorEvent,
      { type: 'ask' }
    >
    expect(question.id).toBe('question-1')
    expect(question.header).toBe('取景')
    expect(question.question).toBe('取多少身？')
    // ⚠ 两个开关都**显式**落地：⛔ 客户端不许靠选项个数猜。
    expect(question.multiSelect).toBe(false)
    // ⚠ `allowOther` 缺省 true —— 留一句「都不是」的出口是常态。
    expect(question.allowOther).toBe(true)
    expect(question.options[0]?.visual).toBe('comp.halfBody')
    expect(question.options[0]?.description).toBe('腰以上，脸看得清。')
    // 剥掉的那个：选项还在（文字选得动），只是没有图示。
    expect(question.options[1]?.visual).toBeUndefined()
  })

  it('⭐ 没有 description 的选项整条丢掉（只有名字的 chip 正是这轮要消灭的形状）', async () => {
    queueTurns(
      {
        plan: ['写提示词'],
        questions: [
          {
            header: '风格',
            question: '要哪种画风？',
            options: [
              { label: '3D 游戏渲染', description: '接近官方立绘的引擎质感。' },
              // ⛔ 没有说明 —— 用户看着它答不上来「它跟上一个差在哪」。
              { label: '风格化 3D' },
              { label: '厚涂', description: '笔触留得住，像插画。' },
            ],
          },
        ],
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const frame = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask,
    ) as Extract<AssistantOperatorEvent, { type: 'ask' }>
    expect(frame.question.options.map((option) => option.label)).toEqual([
      '3D 游戏渲染',
      '厚涂',
    ])
  })

  it('⭐ 推荐项排第一，且一题只留一个；multiSelect / allowOther 照模型写的落', async () => {
    queueTurns(
      {
        plan: ['写提示词'],
        questions: [
          {
            header: '风格',
            question: '要哪种画风？',
            multiSelect: true,
            allowOther: false,
            options: [
              { label: '厚涂', description: '笔触留得住，像插画。' },
              {
                label: '3D 游戏渲染',
                description: '接近官方立绘的引擎质感。',
                recommended: true,
              },
              // ⛔ 第二个「推荐」—— 剥掉标记，选项本身留着。
              {
                label: '赛璐璐',
                description: '平涂硬边，接近动画分镜。',
                recommended: true,
              },
            ],
          },
        ],
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const question = (
      events.find(
        (event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask,
      ) as Extract<AssistantOperatorEvent, { type: 'ask' }>
    ).question
    expect(question?.multiSelect).toBe(true)
    expect(question?.allowOther).toBe(false)
    expect(question?.options[0]?.label).toBe('3D 游戏渲染')
    expect(question?.options[0]?.recommended).toBe(true)
    expect(
      question?.options.filter((option) => option.recommended === true),
    ).toHaveLength(1)
  })

  it('只剩一个选项的反问题整道丢掉（一个选项的单选是通知不是问题）', async () => {
    queueTurns(
      {
        plan: ['写提示词'],
        questions: [
          {
            header: '下雨',
            question: '要不要加雨？',
            options: [{ label: '加', description: '地面留反光。' }],
          },
        ],
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    // ⚠ 一道题都不剩 = 这一轮没什么可问的：⛔ 不摆空的问题卡。
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask),
    ).toBe(false)
  })

  it('⭐ header 漏了就从问句头上截，⛔ 不留空', async () => {
    queueTurns(
      {
        plan: ['写提示词'],
        questions: [
          {
            question: '要不要把背景换成雨夜的街道？',
            options: [
              { label: '换', description: '霓虹反光，气氛更重。' },
              { label: '不换', description: '保留现在这张的干净背景。' },
            ],
          },
        ],
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const frame = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask,
    ) as Extract<AssistantOperatorEvent, { type: 'ask' }>
    expect(frame.question.header).toBe('要不要把背景换成雨夜的…')
    expect(frame.question.header.length).toBeLessThanOrEqual(12)
  })

  it('⭐ 「先问我」开着时，哪怕只有一步也出多步确认卡', async () => {
    queueTurns({ plan: ['写提示词'] }, { finished: true })
    const forced = await collect(
      runAssistantOperator('clerk-1', buildRequest({ forcePlan: true })),
    )
    expect(typesOf(forced)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.plan,
      ASSISTANT_OPERATOR_EVENTS.confirm,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
  })

  it('⭐ planApproved=false 时把答复并进上下文并要求重新规划一次', async () => {
    queueTurns({ plan: ['重新来一版'] }, { finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          planApproved: false,
          planAnswers: [
            { questionId: 'question-1', optionIds: ['option-1-2'] },
          ],
        }),
      ),
    )
    const prompt = lastUserPrompt()
    expect(prompt).toContain('WANTS A DIFFERENT PLAN')
    expect(prompt).toContain('question-1: option-1-2')
  })

  it('planApproved=true 时答复是既定事实，⛔ 不要求重新规划', async () => {
    queueTurns({ plan: ['照计划走'] }, { finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          planApproved: true,
          planAnswers: [
            {
              questionId: 'question-1',
              optionIds: ['option-1-1', 'option-1-3'],
              otherText: '再暗一点',
            },
          ],
        }),
      ),
    )
    const prompt = lastUserPrompt()
    expect(prompt).toContain('APPROVED YOUR PLAN')
    expect(prompt).not.toContain('WANTS A DIFFERENT PLAN')
    // ⭐ 多选题答了两项就喂回两项 —— ⛔ 不许只渲染第一个。
    expect(prompt).toContain('question-1: option-1-1, option-1-3')
    expect(prompt).toContain('other: "再暗一点"')
  })

  it('⭐ planApproved=true 那一轮⛔ 不再拦一次（plan 帧照旧）', async () => {
    queueTurns(
      {
        plan: ['照计划走', '写提示词'],
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'a girl under a red umbrella' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          planApproved: true,
          planAnswers: [
            { questionId: 'question-1', optionIds: ['option-1-1'] },
          ],
        }),
      ),
    )
    // ⛔ 白拦一次、白花一份 token 的那张卡没有了。
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirm),
    ).toBe(false)
    // ⚠ `plan` 帧照旧 —— 进度带要用。
    expect(typesOf(events)[0]).toBe(ASSISTANT_OPERATOR_EVENTS.plan)
    // ⚠ 用户选的答复照旧进上下文。
    expect(lastUserPrompt()).toContain('question-1: option-1-1')
  })

  /**
   * **断点续跑**（第三期）—— 三条判据：已完成的步进提示、产物按名字念、
   * ⛔ 不再拦一次。
   */
  it('⭐ resumeFrom 把已完成的步当既成事实喂回去，并要求接着跑', async () => {
    queueTurns({ plan: ['接着跑'] }, { finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          resumeFrom: {
            planId: 'plan-7',
            completedSteps: [
              { id: 'plan-7:0', label: '读取表单' },
              {
                id: 'plan-7:1',
                label: '写提示词',
                artifactIds: ['gen-42'],
              },
            ],
          },
        }),
      ),
    )
    const prompt = lastUserPrompt()
    expect(prompt).toContain('RESUMING AN APPROVED PLAN')
    expect(prompt).toContain('[1] 读取表单')
    expect(prompt).toContain('[2] 写提示词')
  })

  it('⭐ 产物按**名字**念（工作记忆水合），水合不到才退回 id', async () => {
    queueTurns({ plan: ['接着跑'] }, { finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          workingMemory: {
            rounds: [
              {
                runKey: 'run-1',
                at: '2026-09-08T09:00:00.000Z',
                artifacts: [
                  {
                    id: 'gen-42',
                    displayName: '图_012·银发少女',
                    kind: 'result',
                  },
                ],
              },
            ],
          },
          resumeFrom: {
            planId: 'plan-7',
            completedSteps: [
              {
                id: 'plan-7:1',
                label: '生成 4 张',
                artifactIds: ['gen-42', 'gen-unknown'],
              },
            ],
          },
        }),
      ),
    )
    const prompt = lastUserPrompt()
    expect(prompt).toContain('图_012·银发少女')
    // ⚠ 水合不到的那一条显示 id —— ⛔ 不是一行空白。
    expect(prompt).toContain('gen-unknown')
  })

  it('⭐ 续跑那一轮⛔ 不再拦一次（用户已经批过一次了）', async () => {
    queueTurns({ plan: ['接着跑', '再写一遍', '第三步'] }, { finished: true })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          resumeFrom: {
            planId: 'plan-7',
            completedSteps: [{ id: 'plan-7:0', label: '读取表单' }],
          },
        }),
      ),
    )
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirm),
    ).toBe(false)
  })

  it('没有 resumeFrom 的那一轮提示里一个字都不提续跑', async () => {
    queueTurns({ plan: ['普通一轮'] }, { finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest({})))
    expect(lastUserPrompt()).not.toContain('RESUMING AN APPROVED PLAN')
  })

  it('planApproved=false 那一支照旧拦一次（那就是要重新规划）', async () => {
    queueTurns(
      // ⚠ 判据是模型写的 `confirmPlan`（决策 4），⛔ 不再是步数。
      { plan: ['重新来一版', '再写一遍提示词', '第三步'], confirmPlan: true },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ planApproved: false })),
    )
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirm),
    ).toBe(true)
  })

  it('⭐ 已批准的那一轮模型又给 questions —— 丢掉并 warn，⛔ 不再拦一次用户', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    queueTurns(
      {
        plan: ['照计划走'],
        questions: [
          {
            header: '取景',
            question: '取多少身？',
            options: [
              { label: '半身', description: '腰以上，脸看得清。' },
              { label: '全身', description: '连鞋一起，服装看得全。' },
            ],
          },
        ],
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ planApproved: true })),
    )
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask),
    ).toBe(false)
    expect(warn).toHaveBeenCalledWith(
      'assistant operator asked new plan questions after approval',
      expect.objectContaining({ questionCount: 1 }),
    )
    warn.mockRestore()
  })

  it('⭐ 「先问我」开着时系统提示要求这一轮必须先出计划', async () => {
    queueTurns({ finished: true })
    await collect(
      runAssistantOperator('clerk-1', buildRequest({ forcePlan: true })),
    )
    const forced = (
      mockLlmTextCompletion.mock.calls.at(-1)?.[0] as { systemPrompt: string }
    ).systemPrompt
    expect(forced).toContain('ask me first')

    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const normal = (
      mockLlmTextCompletion.mock.calls.at(-1)?.[0] as { systemPrompt: string }
    ).systemPrompt
    expect(normal).not.toContain('ask me first')
  })

  it('系统提示逐项列全 32 个图示 id（⛔ 不是一句「从词表里选」）', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const call = mockLlmTextCompletion.mock.calls.at(-1)?.[0] as {
      systemPrompt: string
    }
    for (const visual of ASSISTANT_PLAN_VISUALS) {
      expect(call.systemPrompt).toContain(visual.id)
    }
  })
})

describe('生成确认（v2 §3.3 第二种来源）', () => {
  /** ⚠ 用目录里真的有的模型 id：卡上那几行全部从快照现取，编一个 id 走不到底。 */
  const SPEND_MODEL_ID = AI_MODELS.FLUX_2_PRO
  const PRIMED_SNAPSHOT = {
    ...SNAPSHOT,
    prompt: '一只在雨里的猫',
    model: { id: SPEND_MODEL_ID, label: 'FLUX.2 Pro' },
    availableModels: [{ id: SPEND_MODEL_ID, label: 'FLUX.2 Pro' }],
  }

  /**
   * ⭐ **一律先出确认卡**（决策 8）：v1 那条「本会话此类不再问」的免检通道随
   * 花费确认一起删了 —— 服务端因此没有任何一条「这一枪不用问」的路。
   */
  it('⭐ request_generation 一律出 confirm(generate)，流停在 awaiting_confirm', async () => {
    queueTurns({
      tool: { name: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration, args: {} },
    })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: PRIMED_SNAPSHOT }),
      ),
    )
    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.confirm,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    const confirm = events[0] as Extract<
      AssistantOperatorEvent,
      { type: 'confirm' }
    >
    expect(confirm.confirm.kind).toBe(
      ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
    )
    const request = (
      confirm.confirm as Extract<
        (typeof confirm)['confirm'],
        { kind: 'generate' }
      >
    ).request
    expect(request.model).toEqual({ id: SPEND_MODEL_ID, label: 'FLUX.2 Pro' })
    expect(request.count).toBe(1)
    expect(request.specs).toEqual({
      aspectRatio: '1:1',
      resolution: 'auto',
      durationSeconds: null,
    })
    // ⛔ 载荷里没有花费读数那一格（决策 8）。
    expect(request).not.toHaveProperty('estimate')
    expect(events[1]).toMatchObject({
      reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
    })
  })

  it('提示词还空着时按 emptyPrompt 拒 —— 与 prime_generate 逐字同闸', async () => {
    queueTurns(
      {
        tool: { name: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration, args: {} },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirm),
    ).toBe(false)
    const [rejected] = stepsOf(events)
    expect(rejected.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((rejected.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.emptyPrompt,
    )
  })

  it('⛔ 装配台上够不着这条工具（域工具表把它锁在图片 / 视频两个域）', async () => {
    queueTurns(
      {
        tool: { name: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration, args: {} },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ domain: 'lora', snapshot: PRIMED_SNAPSHOT }),
      ),
    )
    const [rejected] = stepsOf(events)
    expect((rejected.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl,
    )
  })

  it('覆盖手写走 ask 帧，且带着回执路由那一块（⛔ 不是确认卡）', async () => {
    queueTurns({
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
        args: { value: '换成一只狗' },
      },
    })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, prompt: '我自己写的那句' } }),
      ),
    )
    const ask = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask,
    ) as Extract<AssistantOperatorEvent, { type: 'ask' }>
    expect(ask.overwrite?.field).toBe(ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt)
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirm),
    ).toBe(false)
  })
})

/**
 * ⭐ 切片 3b · 候选卡三字段（owner 定）。
 *
 * 钉两件事：**判定在服务端算**（客户端只画结果），以及**不可用的候选照样返回** ——
 * 用户仍然要能点开原页去看，只是「选用」那颗按钮我们不替他按。
 */
describe('联网候选 · 来源三字段（切片 3b）', () => {
  function queueWebImageSearch(query = 'jiyan official art'): void {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'search the web',
          args: { query },
        },
      },
      { finished: true },
    )
  }

  it('三字段由服务端填：发布者与域名各归各位，未知许可仍然可用', async () => {
    mockWebImageSearch.mockResolvedValue([
      {
        imageUrl: 'https://cdn.example.test/a.jpg',
        pageUrl: 'https://blog.example.test/post/a',
        domain: 'blog.example.test',
        publisher: 'Example Blog',
      },
    ])
    queueWebImageSearch()

    const done = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )[1]
    const [image] = (done.result as { images: Record<string, unknown>[] })
      .images
    expect(image.domain).toBe('blog.example.test')
    // ⛔ 发布者不拿域名冒充：两者答的不是同一个问题。
    expect(image.publisher).toBe('Example Blog')
    // 未知 → 可用，但标出来（拒绝一切未知等于把这个功能关掉）。
    expect(image.usableAsInput).toBe(true)
    expect(image.sourceVerdict).toBe('unknownLicense')
  })

  it('⛔ 判定为 blocked 的候选照样返回，只是 usableAsInput=false 且观察里说明', async () => {
    mockWebImageSearch.mockResolvedValue([
      {
        imageUrl: 'https://i.pinimg.test/blocked.jpg',
        pageUrl: 'https://www.pinterest.com/pin/1',
        domain: 'www.pinterest.com',
        publisher: 'Pinterest',
      },
    ])
    queueWebImageSearch()

    const done = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )[1]
    const images = (done.result as { images: Record<string, unknown>[] }).images
    // ⛔ 不静默丢掉：用户仍要能点开原页。
    expect(images).toHaveLength(1)
    expect(images[0].usableAsInput).toBe(false)
    expect(images[0].sourceVerdict).toBe('blocked')
    // 模型也要读得到，否则它会在对白里承诺一张挂不上的图。
    expect(lastUserPrompt()).toContain('REFERENCE ONLY')
  })

  it('⛔ 用户递来的地址也过这道闸：blocked 的站按 sourceNotUsable 拒', async () => {
    const url = 'https://www.artstation.com/artwork/abc.jpg'
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
          title: '收下你给的这张',
          args: { url },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            messages: [{ role: 'user', content: `就这张 ${url}` }],
          }),
        ),
      ),
    )
    expect(steps).toHaveLength(1)
    expect((steps[0] as { error: { reason: string } }).error.reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.sourceNotUsable,
    )
  })
})

/**
 * ⭐ 切片 3b · 联网**查文字**（`search_web`）。
 *
 * 它存在的理由是准确性：模型对具体作品的设定记得半对半错，而提示词恰恰要写对
 * 这些。钉三件事：读类无 inverse、出处逐条落进观察、没配 key 时不发请求。
 */
describe('search_web · 联网查文字（切片 3b）', () => {
  const HITS = [
    {
      title: 'Jiyan — official character page',
      url: 'https://wiki.example.test/jiyan',
      snippet: 'General of the Midnight Rangers, teal hair, dragon motifs.',
    },
    {
      title: 'Patch notes 2.4',
      url: 'https://news.example.test/2-4',
      snippet: 'Adds the new outfit.',
    },
  ]

  function queueSearch(query = 'jiyan official design'): void {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
          title: 'look it up',
          args: { query },
        },
      },
      { finished: true },
    )
  }

  it('读类：没有 inverse，结果带标题 / 地址 / 摘要 / 出处', async () => {
    mockWebSearch.mockResolvedValue(HITS)
    queueSearch()

    const [running, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(running.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(done.inverse).toBeUndefined()

    const result = done.result as {
      totalFound: number
      results: Record<string, unknown>[]
    }
    expect(result.totalFound).toBe(2)
    expect(result.results[0].title).toBe(HITS[0].title)
    expect(result.results[0].snippet).toBe(HITS[0].snippet)
    // 出处**现算**：上游的 organic 结果没有站名字段，域名是唯一的真值。
    expect(result.results[0].publisher).toBe('wiki.example.test')
  })

  it('⭐ 观察里逐条带出处，并说明这只是摘要不是全文', async () => {
    mockWebSearch.mockResolvedValue(HITS)
    queueSearch()

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = lastUserPrompt()
    expect(prompt).toContain('wiki.example.test')
    expect(prompt).toContain('extracts, not full pages')
  })

  it('平台没配 key → 按 searchUnavailable 拒，⛔ 一次上游调用都不发', async () => {
    mockIsWebSearchConfigured.mockReturnValue(false)
    queueSearch()

    const [step] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.searchUnavailable,
    )
    expect(mockWebSearch).not.toHaveBeenCalled()
  })

  it('一条都没查到时说出来，并明确禁止拿编造去补空', async () => {
    mockWebSearch.mockResolvedValue([])
    queueSearch('something nobody wrote about')

    const done = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )[1]
    expect((done.result as { totalFound: number }).totalFound).toBe(0)
    expect(lastUserPrompt()).toContain('Do not invent facts')
  })
})

/**
 * **收尾必须是一个结论**（2026-09-07，owner 打回的那一条）。
 *
 * 🔬 真机：助手最后留下的整句是「正在检索……的角色立绘与外貌描述。」——
 * 没有结论，也没有说这个角色查不到。
 */
describe('收尾闸 · 半句话不算收尾', () => {
  it('⭐ 停在进行时 → 退回去再要一次结论，⛔ 半句话不落进线程', async () => {
    queueTurns(
      {
        finished: true,
        message: '正在检索《无限大》时夜的角色立绘与外貌描述。',
      },
      {
        finished: true,
        message:
          '官方还没有公开时夜的外貌设定，我在萌百、中文维基和 danbooru 都找过了。要不要先按已知气质写一版？',
      },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const messages = events
      .filter((event) => event.type === ASSISTANT_OPERATOR_EVENTS.message)
      .map((event) => event.text)

    // ⛔ 那半句一帧都没发出去（客户端那颗气泡由下一轮整体覆盖）。
    expect(messages).toEqual([
      '官方还没有公开时夜的外貌设定，我在萌百、中文维基和 danbooru 都找过了。要不要先按已知气质写一版？',
    ])
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    expect(lastUserPrompt()).toContain('YOUR CLOSING LINE WAS NOT AN ANSWER')
  })

  it('⚠ 只退一次 —— 模型第二次还是半句就照发，⛔ 不做开放循环', async () => {
    mockLlmTextCompletion.mockResolvedValue(
      JSON.stringify({ finished: true, message: '正在检索…' }),
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    expect(events.at(-1)?.type).toBe(ASSISTANT_OPERATOR_EVENTS.done)
  })

  it('⛔ 这一轮吐了问题卡时不判：卡本身就是收尾', async () => {
    queueTurns({
      plan: ['先定画风'],
      questions: [
        {
          header: '画风',
          question: '要哪种画风？',
          options: [
            { label: '3D 游戏画风', description: '接近官方立绘。' },
            { label: '电影 CG', description: '景深更重。' },
          ],
        },
      ],
      finished: true,
    })

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest({ forcePlan: true })),
    )
    // ⛔ 没有把这一轮退回去再要一次结论（那会是第二次 LLM 往返）。
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(events.at(-1)).toMatchObject({
      type: ASSISTANT_OPERATOR_EVENTS.stopped,
      reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
    })
  })
})

describe('research · 有目标的多轮检索（2026-09-06）', () => {
  const EVIDENCE = [
    {
      title: '萌娘百科 · 时夜',
      url: 'https://zh.moegirl.org.cn/shiye',
      publisher: 'zh.moegirl.org.cn',
      snippet: '黑色长发，金色瞳孔，改良中式长衫。',
      kind: 'text' as const,
      confidence: 'medium' as const,
      credibility: 'reference' as const,
      scope: 'character' as const,
    },
    {
      title: 'danbooru tags',
      publisher: 'danbooru',
      snippet: '共现: black_hair, yellow_eyes, chinese_clothes',
      kind: 'tags' as const,
      confidence: 'medium' as const,
      credibility: 'reference' as const,
      scope: 'character' as const,
    },
  ]

  function researchTurn(goal: string, entities: string[] = ['无限大', '时夜']) {
    return {
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.research,
        title: 'research the character',
        args: { goal, entities },
      },
    }
  }

  it('读类：没有 inverse；证据带出处 / 置信度 / 形状三字段', async () => {
    mockRunAssistantResearch.mockResolvedValue({
      queries: ['无限大 时夜 外貌'],
      sources: ['wiki', 'web', 'danbooru'],
      evidence: EVIDENCE,
      receipts: [{ sourceId: 'moegirl', status: 'ok', count: 1, tookMs: 12 }],
    })
    queueTurns(researchTurn('外貌与服饰'), { finished: true })

    const [running, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(running.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(done.inverse).toBeUndefined()

    const result = done.result as { totalFound: number; evidence: unknown[] }
    expect(result.totalFound).toBe(2)
    expect(result.evidence[0]).toMatchObject({
      publisher: 'zh.moegirl.org.cn',
      confidence: 'medium',
      kind: 'text',
    })
    // 载荷里的 sources 是**服务端真的打过**的那几组，轮次从 1 起。
    expect(done.payload).toMatchObject({
      sources: ['wiki', 'web', 'danbooru'],
      round: 1,
      entities: ['无限大', '时夜'],
    })
  })

  it('⭐ 观察里逐条带出处与置信度，并把标签档点名成可直接用的词', async () => {
    mockRunAssistantResearch.mockResolvedValue({
      queries: [],
      sources: ['wiki'],
      evidence: EVIDENCE,
      receipts: [{ sourceId: 'moegirl', status: 'ok', count: 1, tookMs: 5 }],
    })
    queueTurns(researchTurn('外貌与服饰'), { finished: true })

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = lastUserPrompt()
    expect(prompt).toContain('zh.moegirl.org.cn')
    // 每条带**出处 · 可信度档 · 是不是这个角色 · 形状**四样。
    expect(prompt).toContain('reference · character-level')
    expect(prompt).toContain('moegirl:ok')
    expect(prompt).toContain('prompt-ready vocabulary')
  })

  it('⭐ 第二轮**允许**（多轮就是这条工具的核心），第三轮按上限拒', async () => {
    mockRunAssistantResearch.mockResolvedValue({
      queries: [],
      sources: ['wiki'],
      evidence: EVIDENCE,
      receipts: [],
    })
    queueTurns(
      researchTurn('which site is official'),
      researchTurn('appearance and outfit'),
      researchTurn('one more time'),
      { finished: true },
    )

    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    ).filter(
      (step) => step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
    )

    expect(steps[0].status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(steps[1].status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect((steps[1].payload as { round: number }).round).toBe(2)
    expect(steps[2].status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((steps[2].error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.researchRoundsExhausted,
    )
    // ⚠ 上限是**轮次**不是「同一步」：三次的 goal 各不相同，重复步那道闸拦不住它。
    expect(mockRunAssistantResearch).toHaveBeenCalledTimes(2)
    expect(ASSISTANT_RESEARCH_LIMITS.maxRoundsPerTurn).toBeGreaterThanOrEqual(2)
  })

  it('⭐ 空结果时**不许放弃**：观察里明说再换个角度试一次', async () => {
    mockRunAssistantResearch.mockResolvedValue({
      queries: [],
      sources: ['wiki'],
      evidence: [],
      receipts: [{ sourceId: 'moegirl', status: 'empty', count: 0, tookMs: 5 }],
    })
    queueTurns(researchTurn('nobody wrote about this'), { finished: true })

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = lastUserPrompt()
    expect(prompt).toContain('Do NOT give up')
    expect(prompt).toContain('moegirl:empty')
  })

  it('⭐ 缺 Serper key **照跑**——免 key 的百科腿不该被一把钥匙锁上（A1 拆闸）', async () => {
    mockIsWebSearchConfigured.mockReturnValue(false)
    mockRunAssistantResearch.mockResolvedValue({
      queries: ['无限大 时夜'],
      sources: ['wiki'],
      evidence: EVIDENCE,
      receipts: [
        { sourceId: 'moegirl', status: 'ok', count: 1, tookMs: 5 },
        {
          sourceId: 'web_search',
          status: 'skipped',
          count: 0,
          tookMs: 0,
          error: 'missing SERPER_API_KEY',
        },
      ],
    })
    queueTurns(researchTurn('外貌'), { finished: true })

    const [, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(done.error).toBeUndefined()
    expect(mockRunAssistantResearch).toHaveBeenCalledTimes(1)
    // 缺 key 只让 web_search 这一个源标 skipped，百科腿照样出证据。
    expect(lastUserPrompt()).toContain('web_search:skipped')
    expect(lastUserPrompt()).toContain('moegirl:ok')
  })

  it('⭐ 全是作品级证据时，观察里点名「0 条是这个角色」并要求收尾说实话', async () => {
    /**
     * 🔬 owner 真机：10 条证据条条「相关」，条条只讲游戏本身 —— 模型看到「10 条」
     * 就以为查到了，然后把话停在「正在检索……」。
     */
    mockRunAssistantResearch.mockResolvedValue({
      queries: ['无限大 时夜'],
      sources: ['wiki', 'web'],
      evidence: [
        {
          title: '无限大(游戏) - 维基百科',
          url: 'https://zh.wikipedia.org/wiki/x',
          publisher: 'zh.wikipedia.org',
          snippet: '开放世界动作角色扮演游戏。',
          kind: 'text' as const,
          confidence: 'medium' as const,
          credibility: 'reference' as const,
          scope: 'work' as const,
        },
      ],
      receipts: [{ sourceId: 'moegirl', status: 'ok', count: 1, tookMs: 5 }],
    })
    queueTurns(researchTurn('外貌'), { finished: true, message: '查不到。' })

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = lastUserPrompt()
    expect(prompt).toContain('1 piece(s) of evidence')
    expect(prompt).toContain('0 of these are about the character itself')
    expect(prompt).toContain('SAY SO PLAINLY')
  })

  it('⚠ 上游全挂（零证据）时**不吃掉那一轮**——轮次照记，免得无限重试', async () => {
    mockRunAssistantResearch.mockResolvedValue({
      queries: [],
      sources: ['web'],
      evidence: [],
      receipts: [
        { sourceId: 'web_search', status: 'failed', count: 0, tookMs: 1 },
      ],
    })
    queueTurns(researchTurn('a'), researchTurn('b'), researchTurn('c'), {
      finished: true,
    })

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(mockRunAssistantResearch).toHaveBeenCalledTimes(2)
  })
})

describe('read_url · 读一页正文（2026-09-06）', () => {
  /**
   * ⚠ 这一页**故意写得超过截取上限**：短于上限时截段那一步会原样返回整页
   * （那是对的 —— 没必要为一页能全塞下的内容丢掉上下文），而这条用例要验的
   * 恰恰是「超了的时候丢掉哪一半」。
   */
  const PAGE = {
    url: 'https://zh.moegirl.org.cn/shiye',
    content: [
      '时夜是《无限大》中的可操作角色。',
      '外貌与服饰：黑色长发束成低马尾，金色瞳孔，改良中式长衫。',
      `战斗数据：武器为双刃，冷却 12 秒，技能循环以突进起手。${'队伍搭配建议见下表，配装与词条优先级同理。'.repeat(120)}`,
    ].join('\n\n'),
  }

  function readTurn(url: string, focus?: string) {
    return {
      tool: {
        name: ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
        title: 'read the page',
        args: { url, ...(focus ? { focus } : {}) },
      },
    }
  }

  it('⭐ 按 focus 在服务端截段：相关段落进来，无关段落被丢掉', async () => {
    mockReadUrl.mockResolvedValue(PAGE)
    queueTurns(readTurn(PAGE.url, '外貌与服饰'), { finished: true })

    const [, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    const result = done.result as { excerpt: string; url: string }
    expect(result.url).toBe(PAGE.url)
    expect(result.excerpt).toContain('金色瞳孔')
    expect(result.excerpt).not.toContain('冷却 12 秒')
    // 读类：没有 inverse。
    expect(done.inverse).toBeUndefined()
    expect(done.payload).toMatchObject({ focus: '外貌与服饰' })
  })

  it('没给 focus 时 payload 里是 null（⛔ 不是字段缺席）', async () => {
    mockReadUrl.mockResolvedValue(PAGE)
    queueTurns(readTurn(PAGE.url), { finished: true })

    const [, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect((done.payload as { focus: string | null }).focus).toBeNull()
  })

  it('截出来的正文进观察，并说明这只是一段不是全文', async () => {
    mockReadUrl.mockResolvedValue(PAGE)
    queueTurns(readTurn(PAGE.url, '外貌'), { finished: true })

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = lastUserPrompt()
    expect(prompt).toContain('金色瞳孔')
    expect(prompt).toContain('not the whole thing')
  })

  it('⛔ 读不出来 → urlUnreadable（一条可教的拒绝，不是整轮抛错）', async () => {
    mockReadUrl.mockResolvedValue(null)
    queueTurns(readTurn('https://blocked.example.test/x', '外貌'), {
      finished: true,
    })

    const [step] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect(step.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error)
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.urlUnreadable,
    )
  })

  it('⛔ 指向本站自己的地址一律拒，且一次抓取都不发', async () => {
    queueTurns(readTurn(`${getAppOrigin()}/studio/image`), { finished: true })

    const [step] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.urlNotReadable,
    )
    expect(mockReadUrl).not.toHaveBeenCalled()
  })
})

describe('search_web_images · 认准目标（2026-09-06）', () => {
  it('给了 subject + preferOfficial → 铺多语言变体，⛔ 不只发一条英文', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'find official art',
          args: {
            query: 'character art',
            subject: 'Ananta 时夜',
            preferOfficial: true,
          },
        },
      },
      { finished: true },
    )

    const [, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    const [queries] = mockWebImageSearchMulti.mock.calls[0] as [string[]]
    expect(queries.length).toBeGreaterThan(1)
    expect(queries.length).toBeLessThanOrEqual(
      ASSISTANT_RESEARCH_LIMITS.maxImageQueryVariants,
    )
    // 主体出现在每一条里；官方限定词按语言铺开。
    expect(queries.every((query) => query.includes('Ananta 时夜'))).toBe(true)
    expect(queries.some((query) => query.includes('立绘'))).toBe(true)
    expect(queries.some((query) => query.includes('公式'))).toBe(true)
    // 日志载荷里记的是**真的发出去的那几条**。
    expect(done.payload).toMatchObject({
      subject: 'Ananta 时夜',
      preferOfficial: true,
      queries,
    })
  })

  it('不给 subject 时仍是一条查询（⛔ 别白花 credit）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'find a texture',
          args: { query: 'wet asphalt texture' },
        },
      },
      { finished: true },
    )

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const [queries] = mockWebImageSearchMulti.mock.calls[0] as [string[]]
    expect(queries).toEqual(['wet asphalt texture'])
  })

  it('⭐ preferOfficial 时官方 / wiki 来源排前，转载站往后', async () => {
    mockWebImageSearchMulti.mockResolvedValue([
      { imageUrl: 'https://cdn.random.test/a.jpg', domain: 'random-blog.test' },
      {
        imageUrl: 'https://upload.wikimedia.org/b.jpg',
        domain: 'wikimedia.org',
      },
      { imageUrl: 'https://i.pinimg.com/c.jpg', domain: 'pinterest.com' },
      { imageUrl: 'https://static.fandom.test/d.jpg', domain: 'fandom.com' },
    ])
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'find official art',
          args: {
            query: 'character art',
            subject: 'Ananta 时夜',
            preferOfficial: true,
          },
        },
      },
      { finished: true },
    )

    const [, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    const images = (done.result as { images: { domain: string }[] }).images
    expect(images.map((image) => image.domain)).toEqual([
      // allowed 两档在前，同档内保持归并顺序；blocked 排最后但**不被剔除**。
      'wikimedia.org',
      'fandom.com',
      'random-blog.test',
      'pinterest.com',
    ])
  })

  it('⚠ 不给 preferOfficial 时**不重排** —— 找普通参考图时顶一个百科上来是帮倒忙', async () => {
    mockWebImageSearchMulti.mockResolvedValue([
      { imageUrl: 'https://cdn.random.test/a.jpg', domain: 'random-blog.test' },
      {
        imageUrl: 'https://upload.wikimedia.org/b.jpg',
        domain: 'wikimedia.org',
      },
    ])
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'find a texture',
          args: { query: 'wet asphalt texture' },
        },
      },
      { finished: true },
    )

    const [, done] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    const images = (done.result as { images: { domain: string }[] }).images
    expect(images.map((image) => image.domain)).toEqual([
      'random-blog.test',
      'wikimedia.org',
    ])
  })

  it('空结果时观察里说清楚「查了哪几条」并要求再试一次', async () => {
    mockWebImageSearchMulti.mockResolvedValue([])
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'find official art',
          args: { query: 'art', subject: 'Ananta 时夜', preferOfficial: true },
        },
      },
      { finished: true },
    )

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = lastUserPrompt()
    expect(prompt).toContain('One empty search is not an answer')
  })
})

describe('系统提示 · 找角色设定图的推荐链路（2026-09-06）', () => {
  it('⭐ 四步链路逐条写在提示里，顺序也写死了', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const call = mockLlmTextCompletion.mock.calls.at(-1)?.[0] as {
      systemPrompt: string
    }
    const prompt = call.systemPrompt
    expect(prompt).toContain('FINDING WHAT A CHARACTER ACTUALLY LOOKS LIKE')
    // 四步的关键动作各出现一次，且按 research → images → read_url → set_prompt 排。
    const order = [
      'research first',
      'search_web_images with "subject"',
      'read_url on the best page',
      'set_prompt with what you read',
    ].map((needle) => prompt.indexOf(needle))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('⭐ 「一次没搜到不算答案」写进硬规则，⛔ 不只是工具说明里的一句', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const call = mockLlmTextCompletion.mock.calls.at(-1)?.[0] as {
      systemPrompt: string
    }
    expect(call.systemPrompt).toContain('ONE EMPTY SEARCH IS NOT AN ANSWER')
    expect(call.systemPrompt).toContain('Never fill a gap with invention')
  })

  it('两条新工具都在图片档的工具表里（全域通用）', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const call = mockLlmTextCompletion.mock.calls.at(-1)?.[0] as {
      systemPrompt: string
    }
    expect(call.systemPrompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.research)
    expect(call.systemPrompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.readUrl)
  })
})

describe('import_user_url · 已展示的候选（2026-09-06）', () => {
  const CANDIDATES = [
    {
      title: 'official art',
      imageUrl: 'https://cdn.wikimedia.test/a.jpg',
      domain: 'wikimedia.org',
      link: 'https://commons.wikimedia.org/a',
    },
    {
      title: 'repost',
      imageUrl: 'https://i.pinimg.test/b.jpg',
      domain: 'pinterest.com',
      link: 'https://www.pinterest.com/pin/1',
    },
  ]

  it('⭐ 用户说「挂上」→ 助手可以对本轮展示过的候选直接 import_user_url', async () => {
    mockWebImageSearch.mockResolvedValue(CANDIDATES)
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'find official art',
          args: { query: 'shiye official art' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
          title: 'attach the official one',
          args: { url: 'https://cdn.wikimedia.test/a.jpg' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            messages: [{ role: 'user', content: '找官方设定图，然后都挂上' }],
          }),
        ),
      ),
    ).filter(
      (step) => step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
    )

    const imported = steps.find(
      (step) => step.tool === ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
    )
    expect(imported?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    // ⚠ 域名取的是**搜图时记下的站点域名**，⛔ 不是图床主机名。
    expect(imported?.payload).toMatchObject({ domain: 'wikimedia.org' })
    expect(imported?.inverse).toEqual({
      url: 'https://cdn.wikimedia.test/a.jpg',
    })
  })

  it('⛔ 候选里标了「仅参考」的那张照旧拒（站方声明不是用户能替它同意的）', async () => {
    mockWebImageSearch.mockResolvedValue(CANDIDATES)
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
          title: 'find art',
          args: { query: 'shiye art' },
        },
      },
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
          title: 'attach the repost',
          args: { url: 'https://i.pinimg.test/b.jpg' },
        },
      },
      { finished: true },
    )

    const steps = stepsOf(
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            messages: [{ role: 'user', content: '都挂上' }],
          }),
        ),
      ),
    )
    const rejected = steps.find(
      (step) =>
        step.tool === ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl &&
        step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
    )
    expect((rejected?.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.sourceNotUsable,
    )
  })

  it('⛔ 没搜到过、用户也没写过的地址照旧按 urlNotFromUser 拒（闸没松）', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
          title: 'attach something',
          args: { url: 'https://made-up.example.test/x.jpg' },
        },
      },
      { finished: true },
    )

    const [step] = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    expect((step.error as { reason: string }).reason).toBe(
      ASSISTANT_OPERATOR_REJECT_REASON_IDS.urlNotFromUser,
    )
  })
})

describe('上下文卡（第三期 K1）', () => {
  const CARD = {
    id: 'card-1',
    kind: 'character' as const,
    name: 'Sigrika',
    summary: 'Silver hair, gold eyes, control-room mech suit.',
    body: '## Appearance\nSilver hair down to the shoulder.',
    images: [
      {
        url: 'https://cdn.test/context-cards/u1/sheet.png',
        role: 'sheet' as const,
        sourceRef: 'official site',
      },
      {
        url: 'https://cdn.test/context-cards/u1/mood.png',
        role: 'reference' as const,
        sourceRef: null,
      },
    ],
    negative: 'air ripples, holographic overlay',
    pinnedScopes: ['image'],
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
  }

  it('一张常挂卡都没有时不印这一段', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(systemPrompt()).not.toContain('CONTEXT CARDS PINNED TO THIS')
  })

  /**
   * ⭐ 摘要 + 硬否定 + 图 URL 进提示，**正文不进** —— 正文四千字，而系统提示每一步
   * 都要重发。这条用例把那条判据钉死。
   */
  it('常挂卡按当前域拉，摘要 / 硬否定 / 图 URL 进提示，正文不进', async () => {
    mockListContextCards.mockResolvedValue([CARD])
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain('CONTEXT CARDS PINNED TO THIS WORKBENCH')
    expect(prompt).toContain('[card-1]')
    expect(prompt).toContain(CARD.summary)
    expect(prompt).toContain(`NEVER: ${CARD.negative}`)
    expect(prompt).toContain(
      '[sheet] https://cdn.test/context-cards/u1/sheet.png',
    )
    expect(prompt).toContain(
      '[reference] https://cdn.test/context-cards/u1/mood.png',
    )
    // ⛔ 正文不在这一段里 —— 它靠 read_context_card 拉。
    expect(prompt).not.toContain('Silver hair down to the shoulder')
    // 按**当前域**收敛，⛔ 不把用户全部的卡拼进提示。
    expect(mockListContextCards).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pinnedScope: 'image' }),
    )
  })

  it('两条只读工具都在工具表里', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = systemPrompt()
    // ⚠ v2 §2.4：翻卡进「查」组、读卡进「看」组，两条都以 `· <name> —` 出现在
    //   各自入口的 action 枚举表里。
    expect(prompt).toContain('· list_context_cards —')
    expect(prompt).toContain('· read_context_card —')
  })

  it('list_context_cards 出摘要，⛔ 不带正文', async () => {
    mockListContextCards.mockResolvedValue([CARD])
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.listContextCards,
          title: 'check the cards',
          args: {},
        },
      },
      { finished: true },
    )

    // ⚠ 读类工具吐两帧（running / done）——结果在**后一帧**上。
    const steps = stepsOf(
      await collect(runAssistantOperator('clerk-1', buildRequest())),
    )
    const step = steps.at(-1)!
    expect(step.tool).toBe(ASSISTANT_OPERATOR_TOOL_IDS.listContextCards)
    const result = step.result as { cards: { id: string }[] }
    expect(result.cards).toEqual([
      {
        id: 'card-1',
        kind: 'character',
        name: 'Sigrika',
        summary: CARD.summary,
        hasNegative: true,
        imageCount: 2,
        pinnedScopes: ['image'],
      },
    ])
  })

  it('read_context_card 出全文 + 硬否定 + 逐张带分工的图', async () => {
    mockGetContextCard.mockResolvedValue(CARD)
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
          title: 'read the card',
          args: { cardId: 'card-1' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const step = stepsOf(events).at(-1)!
    expect((step.result as { body: string }).body).toContain(
      'Silver hair down to the shoulder',
    )
    // 下一轮喂回给模型的那段观察里，图逐张带着它的分工。
    const observation = lastUserPrompt()
    expect(observation).toContain('[sheet]')
    expect(observation).toContain('[reference]')
  })

  it('编出来的卡 id 拿不到卡，观察里明说别再编', async () => {
    mockGetContextCard.mockResolvedValue(null)
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
          title: 'read the card',
          args: { cardId: 'card-made-up' },
        },
      },
      { finished: true },
    )

    await collect(runAssistantOperator('clerk-1', buildRequest()))
    expect(lastUserPrompt()).toContain('never invent one')
  })
})

/**
 * 切片 X 剩下的三件（reviewState / 跨轮记忆 / label）。
 *
 * ⚠ 成本计数那一族随 v2 决策 8 整条删掉：面板上不再有花费读数，那条计数帧也
 * 跟着从事件联合里没了。
 *
 * ⚠ 这一组验的都是**结构性**的东西：闸拦在哪、名单认不认、帧吐不吐 ——
 * ⛔ 不验模型说了什么（那是提示词的事，这一层管不着）。
 */
describe('切片 X · 审核态 / 跨轮记忆 / 起名', () => {
  const ASSET_ROW = {
    id: 'gen-1',
    url: 'https://cdn.example.test/1.png',
    outputType: 'IMAGE',
    prompt: 'a girl',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  }

  beforeEach(() => {
    mockGetPublicGenerationPage.mockResolvedValue({
      generations: [ASSET_ROW],
      total: 1,
      hasMore: false,
      nextCursor: null,
    })
  })

  function terminalStep(events: AssistantOperatorEvent[], tool: string) {
    return stepsOf(events)
      .filter(
        (step) =>
          step.tool === tool &&
          step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
      )
      .at(-1)
  }

  describe('审核态', () => {
    it('search_assets 的结果带 reviewState，blocked 的**照旧列出来**并在观察里说清楚', async () => {
      mockReadGenerationReviewStates.mockResolvedValue(
        new Map([['gen-1', 'blocked']]),
      )
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
            title: 'search',
            args: { query: 'girl' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator('clerk-1', buildRequest()),
      )
      const step = terminalStep(
        events,
        ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
      )
      const assets = (step?.result as { assets: { reviewState: string }[] })
        .assets
      // ⛔ 不静默过滤：用户问「刚才那张呢」，一句「被你否了」比空结果有用。
      expect(assets).toHaveLength(1)
      expect(assets[0]?.reviewState).toBe('blocked')
      expect(lastUserPrompt()).toContain('BLOCKED')
    })

    it('⛔ blocked 的素材挂不上首帧（blockedSource），而**普通参考位照挂**', async () => {
      mockReadGenerationReviewStates.mockResolvedValue(
        new Map([['gen-1', 'blocked']]),
      )
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
            title: 'search',
            args: { query: 'girl' },
          },
        },
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
            title: 'mount first',
            args: { assetId: 'gen-1', slot: 'first' },
          },
        },
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
            title: 'mount reference',
            args: { assetId: 'gen-1' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildVideoRequest({
            snapshot: { ...VIDEO_SNAPSHOT, frameReferences: { slots: 2 } },
          }),
        ),
      )
      const mounts = stepsOf(events).filter(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.mountReference &&
          step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
      )
      expect(mounts[0]).toMatchObject({
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
        error: {
          reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.blockedSource,
        },
      })
      // 同一张图挂普通参考位照旧通过 —— 这一条闸只管首/尾帧。
      expect(mounts[1]?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    })

    it('set_review_state 写库，inverse 里放的是**旧值**', async () => {
      mockSetGenerationReviewState.mockResolvedValue({
        id: 'gen-1',
        state: 'blocked',
        previous: 'approved',
      })
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
            title: 'mark failed',
            args: { assetId: 'gen-1', state: 'blocked', reason: '手指糊了' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator('clerk-1', buildRequest()),
      )
      const step = terminalStep(
        events,
        ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
      )
      expect(step?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
      expect(step?.payload).toMatchObject({
        assetId: 'gen-1',
        state: 'blocked',
        reason: '手指糊了',
      })
      expect(step?.inverse).toEqual({ assetId: 'gen-1', state: 'approved' })
      expect(mockSetGenerationReviewState).toHaveBeenCalledWith(
        'user-db-1',
        'gen-1',
        'blocked',
        '手指糊了',
      )
    })

    it('⛔ 不是这个用户的行 → unknownAsset（服务返回 null）', async () => {
      mockSetGenerationReviewState.mockResolvedValue(null)
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
            title: 'mark',
            args: { assetId: 'someone-elses', state: 'blocked' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator('clerk-1', buildRequest()),
      )
      expect(
        terminalStep(events, ASSISTANT_OPERATOR_TOOL_IDS.setReviewState),
      ).toMatchObject({
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
        error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset },
      })
    })
  })

  describe('跨轮工作记忆', () => {
    const MEMORY = {
      rounds: [
        {
          runKey: 'run-1',
          at: '2026-09-07T10:00:00.000Z',
          artifacts: [
            {
              id: 'gen-earlier',
              displayName: '图_042·雨夜街道',
              kind: 'result' as const,
              url: 'https://cdn.example.test/earlier.png',
            },
          ],
        },
      ],
    }

    it('上一轮那张**不必重搜**就挂得上（第三张准入名单）', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
            title: 'mount the earlier one',
            args: { assetId: 'gen-earlier' },
          },
        },
        { finished: true },
      )

      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ workingMemory: MEMORY }),
        ),
      )
      const step = terminalStep(
        events,
        ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
      )
      expect(step?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
      expect(step?.payload).toMatchObject({
        assetId: 'gen-earlier',
        url: 'https://cdn.example.test/earlier.png',
      })
      // ⛔ 名单归名单，实体闸照旧：它一次库都没少查。
      expect(mockGetPublicGenerationPage).not.toHaveBeenCalled()
    })

    it('记忆里的名字进系统提示，⛔ 但 id 与地址不进', async () => {
      queueTurns({ finished: true, message: '好的' })
      await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ workingMemory: MEMORY }),
        ),
      )
      const prompt = systemPrompt()
      expect(prompt).toContain('图_042·雨夜街道')
      expect(prompt).not.toContain('gen-earlier')
      expect(prompt).not.toContain('cdn.example.test/earlier.png')
    })

    /**
     * ⭐ `import_user_url` 的**第三张准入名单**：上一轮摆出来过的那条地址，
     * 用户此刻说「就那张」时既不在本轮消息里、也不在本轮候选表里。
     * ⛔ 它照旧不松来源判定 —— 下一条用例验的就是那道闸没动。
     */
    it('上一轮那条地址进得了 import_user_url 的名单', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
            title: 'import the earlier one',
            args: { url: 'https://cdn.example.test/earlier.png' },
          },
        },
        { finished: true },
      )
      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ workingMemory: MEMORY }),
        ),
      )
      const step = terminalStep(
        events,
        ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
      )
      expect(step?.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
      expect(step?.payload).toMatchObject({
        url: 'https://cdn.example.test/earlier.png',
      })
    })

    it('⛔ 记忆之外的地址照旧 urlNotFromUser', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
            title: 'import',
            args: { url: 'https://cdn.example.test/never-seen.png' },
          },
        },
        { finished: true },
      )
      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ workingMemory: MEMORY }),
        ),
      )
      expect(
        terminalStep(events, ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl),
      ).toMatchObject({
        error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.urlNotFromUser },
      })
    })

    it('⛔ 记忆之外的 id 照旧 unknownAsset —— 名单不是「什么都能挂」', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
            title: 'mount',
            args: { assetId: 'made-up' },
          },
        },
        { finished: true },
      )
      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ workingMemory: MEMORY }),
        ),
      )
      expect(
        terminalStep(events, ASSISTANT_OPERATOR_TOOL_IDS.mountReference),
      ).toMatchObject({
        error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.unknownAsset },
      })
    })
  })

  describe('起名（label）', () => {
    it('prime_generate 把 label 透传进载荷，⛔ 服务端一行库都不写', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
            title: 'write',
            args: { value: 'a rainy street at night' },
          },
        },
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
            title: 'arm',
            args: { label: '主视觉' },
          },
        },
        { finished: true },
      )
      const events = await collect(
        runAssistantOperator('clerk-1', buildRequest()),
      )
      expect(
        terminalStep(events, ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate)
          ?.payload,
      ).toEqual({ primed: true, label: '主视觉' })
      expect(mockSetGenerationReviewState).not.toHaveBeenCalled()
    })

    it('request_generation 的载荷（= 生成确认卡那几行）也带着它', async () => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
            title: 'write',
            args: { value: 'a rainy street at night' },
          },
        },
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
            title: 'send',
            args: { label: '主视觉' },
          },
        },
        { finished: true },
      )
      const events = await collect(
        runAssistantOperator('clerk-1', buildRequest()),
      )
      const confirm = events.find(
        (event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirm,
      ) as { confirm: { request?: { label?: string } } } | undefined
      expect(confirm?.confirm.request?.label).toBe('主视觉')
    })
  })
})

describe('current reference image bindings', () => {
  const refs = [
    { url: 'https://cdn.test/female.png' },
    { url: 'https://cdn.test/male.png' },
    { url: 'https://cdn.test/pose.png' },
    { url: 'https://cdn.test/style.png' },
  ]
  const facts = {
    identity: 'Recognizable face and costume',
    pose: 'Visible limb positions',
    style: {
      rendering:
        'Stylized 3D NPR with volumetric hair and material-specific reflections',
      proportions: 'Stylized',
      contours: 'Clean',
      shading: 'Soft',
      materials: 'Matte',
      palette: 'Muted',
      lighting: 'Diffuse',
    },
    scene: 'Source background',
    uncertainties: [],
  }
  const brief = {
    summary: 'Two characters embracing against a white background',
    assignments: refs.map((_, index) => ({
      imageIndex: index,
      roles: [index === 2 ? 'pose' : index === 3 ? 'style' : 'identity'],
      preserve: ['Assigned features'],
      exclude: ['Source background'],
    })),
    requirements: ['Two characters embracing', 'White background'],
    avoid: ['Unrequested background'],
    uncertainties: [],
  }
  /**
   * ⚠ **这里就地包成入口形状**（`wrapEntryToolCall`）：这一组用例里有三条不走
   * `queueTurns`（它们要按 `systemPrompt` 分流不同的假回复），直接喂
   * `mockLlmTextCompletion`，所以壳得在这一层套好。
   */
  function analysisTurns(cached = false): unknown[] {
    return [
      wrapEntryToolCall({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
          title: '分析参考图',
          args: {},
        },
      }),
      ...(cached
        ? []
        : [
            { images: refs.map((_, imageIndex) => ({ imageIndex, ...facts })) },
          ]),
    ]
  }

  it('gives the answering model current verified evidence despite historical failure messages', async () => {
    queueTurns({
      finished: true,
      message: '根据已验证的图3，这是风格化角色渲染。',
    })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          messages: [
            { role: 'user', content: '分析 reference image 3 的画风' },
            { role: 'assistant', content: '图3读取连续失败，请重新上传。' },
            { role: 'user', content: '告诉我 reference image 3 的画风是什么' },
          ],
          referenceProfiles: [{ url: refs[2]!.url, ...facts }],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(lastUserPrompt()).toContain('Recognizable face and costume')
    expect(lastUserPrompt()).toContain('CURRENT VERIFIED REFERENCE EVIDENCE')
  })

  it.each([AI_ADAPTER_TYPES.GEMINI, AI_ADAPTER_TYPES.OPENAI])(
    'sends image 3 directly to the answering model on %s even after old failures',
    async (adapterType) => {
      mockResolveLlmTextRoute.mockResolvedValue({
        adapterType,
        providerConfig: { label: adapterType, baseUrl: 'https://example.test' },
        apiKey: 'test-key',
      })
      queueTurns({
        finished: true,
        message: '图3呈现风格化三维角色的视觉观感。',
      })
      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            messages: [
              { role: 'assistant', content: '图3连续读取失败，请重新上传。' },
              {
                role: 'user',
                content: '告诉我 reference image 3 的画风是什么',
              },
            ],
            snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
          }),
        ),
      )
      expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
      expect(mockLlmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
        imageData: [refs[2]!.url],
        adapterType,
      })
      expect(lastUserPrompt()).toContain(
        'IMAGES ATTACHED TO THIS MODEL REQUEST',
      )
      expect(lastUserPrompt()).toContain('"imageIndex":2')
      expect(stepsOf(events)).toHaveLength(0)
    },
  )

  it('does not attach references mentioned only in older conversation', async () => {
    queueTurns({ finished: true, message: '欢迎回来。' })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          messages: [
            { role: 'user', content: '分析 reference image 3' },
            { role: 'user', content: '你好' },
          ],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(mockLlmTextCompletion.mock.calls[0]?.[0].imageData).toBeUndefined()
  })

  it('uses only mounted URLs from current attachment metadata for an unnumbered question', async () => {
    queueTurns({ finished: true, message: '这张图是日系插画风格。' })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          messages: [{ role: 'user', content: '这张图是什么画风' }],
          mentionedAssets: [
            { id: 'third', url: refs[2]!.url },
            { id: 'unmounted', url: 'https://elsewhere.test/not-mounted.png' },
          ],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(mockLlmTextCompletion.mock.calls[0]?.[0].imageData).toEqual([
      refs[2]!.url,
    ])
  })

  it('automatically obtains evidence for a text-only model before it can repeat an old failure', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://example.test' },
      apiKey: 'text-key',
    })
    mockFindVisionCapableRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://example.test' },
      apiKey: 'vision-key',
    })
    queueTurns(
      { images: [{ imageIndex: 2, ...facts }] },
      { finished: true, message: '根据这次视觉检查，图3是风格化角色渲染。' },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          messages: [
            { role: 'assistant', content: '图3无法读取。' },
            { role: 'user', content: '再分析图3的画风' },
          ],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    expect(mockLlmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      imageData: [refs[2]!.url],
    })
    expect(mockLlmTextCompletion.mock.calls[1]?.[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      userPrompt: expect.stringContaining('Recognizable face and costume'),
    })
    expect(mockLlmTextCompletion.mock.calls[1]?.[0].imageData).toBeUndefined()
    expect(
      stepsOf(events).some(
        (step) => step.tool === 'analyze_references' && step.status === 'done',
      ),
    ).toBe(true)
  })

  it('reuses complete visual evidence for a text-only answer without another paid inspection', async () => {
    mockResolveLlmTextRoute.mockResolvedValue({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      providerConfig: { label: 'DeepSeek', baseUrl: 'https://example.test' },
      apiKey: 'text-key',
    })
    queueTurns({ finished: true, message: '图3是风格化三维渲染。' })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          messages: [{ role: 'user', content: '图3是什么画风' }],
          referenceProfiles: [{ url: refs[2]!.url, ...facts }],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(mockFindVisionCapableRoute).not.toHaveBeenCalled()
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(lastUserPrompt()).toContain('Stylized 3D NPR')
    expect(mockLlmTextCompletion.mock.calls[0]?.[0].imageData).toBeUndefined()
  })

  it('answers a question about image 3 without invoking source-role planning', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
          title: '分析图3',
          args: { imageIndices: [2] },
        },
      },
      { images: [{ imageIndex: 2, ...facts }] },
      { finished: true, message: '这是图3的画风分析。' },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      stepsOf(events).findLast(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences &&
          step.status !== 'running',
      ),
    ).toMatchObject({
      status: 'done',
      result: { profiles: [{ url: refs[2]!.url, ...facts }], brief: null },
    })
    const vision = mockLlmTextCompletion.mock.calls.filter(
      ([input]) => input.imageData,
    )
    expect(vision).toHaveLength(1)
    expect(vision[0]?.[0].imageData).toEqual([refs[2]!.url])
    expect(
      mockLlmTextCompletion.mock.calls.some(([input]) =>
        input.systemPrompt.includes('Build a reference-use brief'),
      ),
    ).toBe(false)
  })

  it('keeps inspected evidence when the source-role brief fails and never writes the prompt', async () => {
    queueTurns(
      ...analysisTurns(),
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '写提示词',
          args: { value: 'A hug on white' },
        },
      },
      { assignments: [] },
      { finished: true, message: '看图已完成，分工整理失败。' },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      stepsOf(events).findLast(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences &&
          step.status !== 'running',
      ),
    ).toMatchObject({
      status: 'done',
      result: {
        profiles: refs.map(({ url }) => ({ url, ...facts })),
        brief: null,
      },
    })
    expect(
      stepsOf(events).findLast(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
          step.status !== 'running',
      ),
    ).toMatchObject({
      status: 'error',
      error: {
        reason: 'referenceBriefFailed',
        detail: expect.stringContaining(
          'Do not claim the images are unreadable',
        ),
      },
    })
    expect(
      mockLlmTextCompletion.mock.calls.filter(([input]) => input.imageData),
    ).toHaveLength(1)
  })

  it('rejects malformed visual fields without exceeding the error event limit', async () => {
    queueTurns(
      analysisTurns()[0],
      { images: [{ imageIndex: 0 }] },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      stepsOf(events).findLast(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences &&
          step.status !== 'running',
      ),
    ).toMatchObject({
      status: 'error',
      error: {
        reason: 'referenceAnalysisFailed',
        detail: expect.stringContaining('Do not ask for re-upload'),
      },
    })
  })

  it('shows the current numbered images and emits thumbnail tokens when writing the prompt', async () => {
    queueTurns(
      ...analysisTurns(),
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '绑定参考分工',
          args: {
            value:
              'Image 1 clothes, 图2 identity, 参考图3 pose only, reference image 4 style and face.',
          },
        },
      },
      brief,
      { issues: [] },
      { finished: true, message: '已填写参考分工。' },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    const done = stepsOf(events).find(
      (step) =>
        step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
        step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
    )
    expect(done?.payload).toMatchObject({
      value:
        '@Image1 clothes, @Image2 identity, @Image3 pose only, @Image4 style and face.',
    })
    expect(lastUserPrompt()).toContain('@Image1')
    expect(lastUserPrompt()).toContain('https://cdn.test/female.png')
    expect(lastUserPrompt()).toContain('@Image4')
    expect(lastUserPrompt()).toContain('https://cdn.test/style.png')
    expect(systemPrompt()).toContain('STYLE REFERENCE')
    expect(
      mockLlmTextCompletion.mock.calls.some(
        ([input]) =>
          JSON.stringify(input.imageData) ===
          JSON.stringify(refs.map((ref) => ref.url)),
      ),
    ).toBe(true)
  })

  it('requires reference evidence before prompt writes and keeps the form unchanged', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '写提示词',
          args: { value: 'Embracing on white' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(stepsOf(events)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'error',
          error: expect.objectContaining({
            reason: 'referenceAnalysisRequired',
          }),
        }),
      ]),
    )
    expect(
      stepsOf(events).some(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
          step.status === 'done',
      ),
    ).toBe(false)
  })

  it('continues a confirmed prompt edit from cached visual facts without another analysis tool call', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'Two people hugging in stylized 3D' },
        },
      },
      brief,
      { issues: [] },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          messages: [{ role: 'user', content: '没问题，继续写入提示词' }],
          referenceProfiles: refs
            .map(({ url }) => ({ url, ...facts }))
            .reverse(),
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      stepsOf(events).some(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
          step.status === 'done',
      ),
    ).toBe(true)
    expect(
      mockLlmTextCompletion.mock.calls.some(([input]) =>
        input.systemPrompt.startsWith('Analyze reference images'),
      ),
    ).toBe(false)
  })

  it('allows the same prompt write to resume after satisfying its analysis prerequisite', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'Two people hugging in stylized 3D' },
        },
      },
      ...analysisTurns(),
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'Two people hugging in stylized 3D' },
        },
      },
      brief,
      { issues: [] },
      { finished: true, message: '已写入。' },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      stepsOf(events).filter(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
          step.status === 'done',
      ),
    ).toHaveLength(1)
    expect(lastUserPrompt()).toContain('then retry set_prompt')
    expect(lastUserPrompt()).not.toContain('Do not retry it unchanged')
  })

  it.each(['missing', 'outdated-rendering'])(
    'does not accept %s cached evidence for prompt writes',
    async (kind) => {
      queueTurns(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
            args: { value: 'A stylized 3D embrace' },
          },
        },
        { finished: true, message: '需要补齐依据。' },
      )
      const cached = refs.map(({ url }) => ({ url, ...facts }))
      if (kind === 'missing')
        cached[0] = { ...cached[0]!, url: 'https://cdn.test/removed.png' }
      else
        cached[0] = { ...cached[0]!, style: { ...facts.style, rendering: '' } }
      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({
            referenceProfiles: cached,
            snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
          }),
        ),
      )
      expect(
        stepsOf(events).find(
          (step) =>
            step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
            step.status === 'error',
        )?.error,
      ).toMatchObject({ reason: 'referenceAnalysisRequired' })
    },
  )

  it('still requires overwrite approval when cached evidence is complete', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          args: { value: 'A stylized 3D embrace' },
        },
      },
      brief,
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          referenceProfiles: refs.map(({ url }) => ({ url, ...facts })),
          snapshot: {
            ...SNAPSHOT,
            prompt: 'My existing draft',
            references: { items: refs, limit: 4 },
          },
        }),
      ),
    )
    expect(
      events.some((event) => event.type === ASSISTANT_OPERATOR_EVENTS.ask),
    ).toBe(true)
    expect(
      stepsOf(events).some(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
          step.status === 'done',
      ),
    ).toBe(false)
  })

  it('reuses unchanged visual evidence after refresh without an extra brief call', async () => {
    queueTurns(...analysisTurns(true), {
      finished: true,
      message: '分工已更新。',
    })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          referenceProfiles: refs.map(({ url }) => ({ url, ...facts })),
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      mockLlmTextCompletion.mock.calls.every(([input]) => !input.imageData),
    ).toBe(true)
    expect(
      stepsOf(events).some(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences &&
          step.status === 'done',
      ),
    ).toBe(true)
  })

  it('marks interrupted reference analysis as failed before propagating the provider error', async () => {
    const failure = new Error('Gemini returned no text')
    mockLlmTextCompletion
      .mockReset()
      .mockResolvedValueOnce(JSON.stringify(analysisTurns()[0]))
      .mockRejectedValueOnce(failure)
    const events: AssistantOperatorEvent[] = []
    const consume = async () => {
      for await (const event of runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ))
        events.push(event)
    }
    await expect(consume()).rejects.toBe(failure)
    expect(stepsOf(events).at(-1)).toMatchObject({
      tool: ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
      status: 'error',
      error: { reason: 'referenceAnalysisFailed' },
    })
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
  })

  it('reports the unavailable reference instead of aborting the analysis stream on a source 404', async () => {
    mockLlmTextCompletion
      .mockReset()
      .mockResolvedValueOnce(JSON.stringify(analysisTurns()[0]))
      .mockRejectedValueOnce(
        new Error(`Failed to fetch image (404): ${refs[1]!.url}`),
      )
      .mockResolvedValue(
        JSON.stringify({ finished: true, message: '请重新添加图2。' }),
      )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(stepsOf(events)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
          status: 'error',
          error: expect.objectContaining({
            reason: 'referenceImageUnavailable',
            detail: expect.stringContaining('@Image2'),
          }),
        }),
      ]),
    )
    expect(events.at(-1)?.type).toBe('done')
    expect(stepsOf(events).some((step) => step.status === 'done')).toBe(false)
  })

  it('rejects conflicting prompts twice and does not keep paying for synonym rewrites', async () => {
    const turns = analysisTurns()
    for (const value of ['A hug in a forest', 'An embrace in the woods']) {
      turns.push(
        {
          tool: {
            name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
            title: '写提示词',
            args: { value },
          },
        },
        ...(value === 'A hug in a forest' ? [brief] : []),
        { issues: ['The background must be white, not a forest.'] },
      )
    }
    queueTurns(
      ...turns,
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '写提示词',
          args: { value: 'Two people embracing in woodland' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      stepsOf(events).some(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
          step.status === 'done',
      ),
    ).toBe(false)
    expect(
      mockLlmTextCompletion.mock.calls.filter(([input]) =>
        input.systemPrompt.includes('Check an image-generation prompt'),
      ),
    ).toHaveLength(2)
  })

  it('writes a validated reference prompt once instead of paying for successful synonym rewrites', async () => {
    const turns = [
      ...analysisTurns(),
      wrapEntryToolCall({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '填写完整提示词',
          args: { value: 'Two people hugging on white' },
        },
      }),
      wrapEntryToolCall({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '再润色一次',
          args: { value: 'Two people embracing on a pure white background' },
        },
      }),
      { finished: true },
    ]
    mockLlmTextCompletion
      .mockReset()
      .mockImplementation(async (input) =>
        JSON.stringify(
          input.systemPrompt.includes('Check an image-generation prompt')
            ? { issues: [] }
            : input.systemPrompt.includes('Build a reference-use brief')
              ? brief
              : (turns.shift() ?? { finished: true }),
        ),
      )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(
      stepsOf(events).filter(
        (step) =>
          step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
          step.status === 'done',
      ),
    ).toHaveLength(1)
    expect(
      mockLlmTextCompletion.mock.calls.filter(([input]) =>
        input.systemPrompt.includes('Check an image-generation prompt'),
      ),
    ).toHaveLength(1)
  })

  it('rejects stale references in existing text before reviewing an appended prompt', async () => {
    queueTurns(
      ...analysisTurns(),
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '追加背景要求',
          args: { value: 'White background', mode: 'append' },
        },
      },
      brief,
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: {
            ...SNAPSHOT,
            prompt: 'Use @Image9 for the pose',
            references: { items: refs, limit: 4 },
          },
          confirmations: [{ field: 'prompt', choice: 'append' }],
        }),
      ),
    )
    expect(stepsOf(events)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          status: 'error',
          error: expect.objectContaining({ reason: 'unknownAsset' }),
        }),
      ]),
    )
    expect(
      mockLlmTextCompletion.mock.calls.some(([input]) =>
        input.systemPrompt.includes('Check an image-generation prompt'),
      ),
    ).toBe(false)
  })

  it('does not critique mounted source images as failed generations', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: '看图',
          args: { targetIds: ['ref-one'] },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          mentionedAssets: [{ id: 'ref-one', url: refs[0]!.url }],
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    expect(stepsOf(events)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          error: expect.objectContaining({
            reason: 'referenceAnalysisRequired',
          }),
        }),
      ]),
    )
    expect(
      mockLlmTextCompletion.mock.calls.every(
        ([input]) =>
          !input.systemPrompt.includes(
            'You are looking at a picture that PixelVault just produced',
          ),
      ),
    ).toBe(true)
  })

  it('compares the generated result against actual reference images in one visual call', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          title: '对照参考检查结果',
          args: {},
        },
      },
      {
        findings: [
          {
            severity: 'warn',
            text: 'The pose matches but the rendering style drifted.',
          },
        ],
        advice: 'Keep the source shading.',
      },
      { finished: true },
    )
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          result: {
            url: 'https://cdn.test/hug-result.png',
            generationId: 'hug-result',
          },
          snapshot: { ...SNAPSHOT, references: { items: refs, limit: 4 } },
        }),
      ),
    )
    const vision = mockLlmTextCompletion.mock.calls.find(
      ([input]) => input.imageData,
    )?.[0]
    expect(vision?.imageData).toEqual([
      'https://cdn.test/hug-result.png',
      ...refs.map((ref) => ref.url),
    ])
    expect(vision?.systemPrompt).toContain(
      'Source references are evidence, never failed results',
    )
  })

  it('refuses a prompt referring to a picture that is not mounted', async () => {
    queueTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: '绑定画风',
          args: { value: 'Match Image 4 style.' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: {
            ...SNAPSHOT,
            references: { items: refs.slice(0, 2), limit: 4 },
          },
        }),
      ),
    )
    expect(
      stepsOf(events).some(
        (step) => step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
      ),
    ).toBe(false)
    expect(lastUserPrompt()).toContain('@Image4')
    expect(lastUserPrompt()).toContain('not mounted')
  })
})

describe('operator native media inputs', () => {
  it.each(['video', 'audio'] as const)(
    'passes %s bytes input through the completion wrapper',
    async (kind) => {
      const url = `https://cdn.test/source.${kind === 'video' ? 'mp4' : 'mp3'}`
      const request = buildRequest({
        mediaAttachments: [{ kind, url, label: 'source' }],
      })
      mockLlmTextCompletion.mockResolvedValue(
        JSON.stringify({ finished: true, message: 'Analyzed.' }),
      )
      await collect(runAssistantOperator('clerk-1', request))
      expect(mockLlmTextCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          [kind === 'video' ? 'videoData' : 'audioData']: [url],
        }),
      )
    },
  )

  it.each(['video', 'audio'] as const)(
    'rejects unsupported %s before an LLM call',
    async (kind) => {
      mockResolveLlmTextRoute.mockResolvedValue({
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        providerConfig: { label: 'OpenAI', baseUrl: 'https://example.test' },
        apiKey: 'test-key',
      })
      const request = buildRequest({
        mediaAttachments: [
          { kind, url: 'https://cdn.test/source', label: 'source' },
        ],
      })
      await expect(
        collect(runAssistantOperator('clerk-1', request)),
      ).rejects.toBeInstanceOf(ApiRequestError)
      expect(mockLlmTextCompletion).not.toHaveBeenCalled()
    },
  )
})

/**
 * **五动词入口**（v2 §2.1 / §2.2，commit #5）—— 模型只见五条，组内哪一支由
 * `action` 定，拆开之后引擎往下一个字都没变。
 *
 * ⚠ 这一组**不走 `queueTurns` 的包装**：要验的正是模型把名字写错时会发生什么，
 * 而包装的职责恰恰是替别的用例把名字写对。
 */
describe('五动词入口 · 派发与拒绝', () => {
  /** 原样喂给模型 mock，⛔ 不套入口壳。 */
  function queueRawTurns(...turns: unknown[]): void {
    mockLlmTextCompletion.mockReset()
    for (const turn of turns) {
      mockLlmTextCompletion.mockResolvedValueOnce(
        typeof turn === 'string' ? turn : JSON.stringify(turn),
      )
    }
    mockLlmTextCompletion.mockResolvedValue(JSON.stringify({ finished: true }))
  }

  /** 观察进的是下一轮的 user prompt —— 模型读得到它才谈得上「改一个词自己走通」。 */
  function observations(): string {
    return mockLlmTextCompletion.mock.calls
      .map((call) => (call[0] as { userPrompt: string }).userPrompt)
      .join('\n')
  }

  it('⭐ apply{action} 派发到原实现：step 上是旧工具名，verb 是入口名', async () => {
    queueRawTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply,
          title: 'write the prompt',
          args: {
            action: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
            value: 'a girl under a red umbrella',
          },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const [running, done] = stepsOf(events)
    expect(running.tool).toBe(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt)
    // ⭐ `verb` 是必填的一等字段（§3.1）：面板那句状态词直接读它。
    expect(running.verb).toBe(ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply)
    expect(done.verb).toBe(ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply)
    // ⛔ `action` 不许漏进载荷 —— 往下每一道闸都不知道入口存在过。
    expect(done.payload).toEqual({
      value: 'a girl under a red umbrella',
      mode: 'replace',
    })
    expect(done.inverse).toEqual({ value: '' })
  })

  it('每个 step 的 verb 与工具表对得上（读类那一支也一样）', async () => {
    queueRawTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.look,
          args: { action: ASSISTANT_OPERATOR_TOOL_IDS.readState },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    for (const step of stepsOf(events)) {
      expect(step.verb).toBe(
        ASSISTANT_OPERATOR_TOOL_VERBS[
          step.tool as (typeof ASSISTANT_OPERATOR_TOOLS)[number]
        ],
      )
    }
  })

  /**
   * ⭐ 旧工具名直接调是收口之后最常见的一次跑偏（模型的先验里全是旧名字）。
   * ⚠ 拒得**指得出路**：下一轮该写哪个入口、`action` 填什么。
   */
  it('⭐ 旧工具名直接调被拒，且拒绝里写清楚该改成哪个入口', async () => {
    queueRawTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'write the prompt',
          args: { value: 'a girl under a red umbrella' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const steps = stepsOf(events)
    // 一条被拒的步 —— 旧名字是真工具，拒得出一条合法的帧。
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
      status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
    // ⛔ 一个字都没落到表单上。
    expect(steps[0]).not.toHaveProperty('inverse')
    const observed = observations()
    expect(observed).toContain(ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply)
    expect(observed).toContain(ASSISTANT_OPERATOR_TOOL_IDS.setPrompt)
  })

  it('名字压根不认识：一步都不落，观察里把五个入口列一遍', async () => {
    queueRawTurns(
      { tool: { name: 'generate_image', title: 'go', args: {} } },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(stepsOf(events)).toHaveLength(0)
    const observed = observations()
    for (const entry of ASSISTANT_OPERATOR_ENTRY_TOOLS) {
      expect(observed).toContain(entry)
    }
  })

  it('action 不在这个入口的枚举里：一步都不落，观察里列出能选的那几个', async () => {
    queueRawTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.look,
          args: { action: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt, value: 'x' },
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(stepsOf(events)).toHaveLength(0)
    expect(observations()).toContain(ASSISTANT_OPERATOR_TOOL_IDS.readState)
  })

  /**
   * ⚠ `research` / `request_generation` 既是入口名也是组内同名旧工具 —— 漏写
   * `action` 时这一支救得回来，而且没有歧义。⛔ 别把它推广到别的入口。
   */
  it('request_generation 漏写 action 时按同名那条走（⛔ apply 漏了照旧拒）', async () => {
    queueRawTurns(
      {
        tool: { name: ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply, args: {} },
      },
      { finished: true },
    )
    const noAction = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(stepsOf(noAction)).toHaveLength(0)

    queueRawTurns(
      {
        tool: {
          name: ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.requestGeneration,
          args: {},
        },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(stepsOf(events)[0]?.tool).toBe(
      ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
    )
  })

  /**
   * **反问**（§3.4）—— `ask` 组里没有旧工具，入口自己就是终点：一帧问题卡、停流，
   * ⛔ 一步都不落。
   */
  it('⭐ ask 入口吐问题卡并停流，⛔ 一步都不落', async () => {
    queueRawTurns({
      tool: {
        name: ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask,
        title: 'ask about the look',
        args: {
          question: '要哪一路画风？',
          header: '画风',
          options: [
            {
              label: '3D 游戏渲染',
              description: '干净的引擎质感，最接近官图。',
            },
            {
              label: '风格化 3D',
              description: '形更软、色更平，读起来像插画。',
            },
          ],
        },
      },
    })

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(typesOf(events)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.ask,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    const ask = events[0] as Extract<AssistantOperatorEvent, { type: 'ask' }>
    expect(ask.question.question).toBe('要哪一路画风？')
    expect(ask.question.options).toHaveLength(2)
    expect(events[1]).toMatchObject({
      reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
    })
  })

  it('⭐ 系统提示的工具段是五段，⛔ 不再逐条罗列 31 个工具名', async () => {
    queueRawTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))
    const prompt = systemPrompt()
    for (const entry of ASSISTANT_OPERATOR_ENTRY_TOOLS) {
      expect(prompt).toContain(`  - ${entry}: `)
    }
    /**
     * 旧的逐条清单形状（`  - set_prompt: …`）在提示里彻底消失。
     * ⚠ 跳过 `research` / `request_generation`：它们与入口同名（入口那一行本身
     * 就长这样），不是残留的旧清单。
     */
    for (const tool of ASSISTANT_OPERATOR_TOOLS) {
      if (isAssistantOperatorEntryTool(tool)) continue
      expect(prompt).not.toContain(`  - ${tool}: `)
    }
    // 图片域里模型看得见的入口就是这五个 —— 每个入口的枚举都非空。
    expect(
      ASSISTANT_OPERATOR_ENTRY_TOOLS.filter((entry) =>
        prompt.includes(`  - ${entry}: `),
      ),
    ).toHaveLength(ASSISTANT_OPERATOR_ENTRY_TOOLS.length)
  })
})
