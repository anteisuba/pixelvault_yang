import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  resolveLlmTextRoute: (...args: unknown[]) => mockResolveLlmTextRoute(...args),
  isLlmTextContextLimitError: () => false,
}))

const mockGetPublicGenerationPage = vi.fn()
vi.mock('@/services/generation.service', () => ({
  getPublicGenerationPage: (...args: unknown[]) =>
    mockGetPublicGenerationPage(...args),
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
vi.mock('@/services/web-research.service', () => ({
  webImageSearch: (...args: unknown[]) => mockWebImageSearch(...args),
  isWebImageSearchConfigured: () => mockIsWebImageSearchConfigured(),
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

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_PLAN_MODE_IDS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_VERBOSITY_IDS,
} from '@/constants/assistant-persona'
import { TAG_BASED_GENERATION_PROMPT_RULE } from '@/constants/model-strengths'
import { ASSISTANT_PLAN_VISUALS } from '@/constants/assistant-plan-visuals'
import { AI_MODELS, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
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

/** 模型按顺序吐出来的几轮回复。 */
function queueTurns(...turns: unknown[]): void {
  mockLlmTextCompletion.mockReset()
  for (const turn of turns) {
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
  mockEnsureUser.mockResolvedValue({ id: 'user-db-1' })
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
        message: '这就来',
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
          title: 'write the prompt',
          reason: 'the field is empty',
          args: { value: 'a girl under a red umbrella' },
        },
      },
      { finished: true },
    )

    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    expect(events.map((event) => event.type)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.plan,
      // 切片 2a：计划条之后紧跟一帧计划卡素材（§2.6），排在第一个 step 之前。
      ASSISTANT_OPERATOR_EVENTS.planRequest,
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.step,
      ASSISTANT_OPERATOR_EVENTS.step,
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
    expect(events.map((event) => event.type)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])
  })

  it('连着两轮读不出 JSON 就大声失败，而不是把步数烧完', async () => {
    mockLlmTextCompletion.mockResolvedValue('抱歉，我说点别的。')
    await expect(
      collect(runAssistantOperator('clerk-1', buildRequest())),
    ).rejects.toThrow(/JSON/)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
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
    expect(mounted?.inverse).toEqual({ assetId: 'gen-1' })
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

    expect(events.map((event) => event.type)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.confirmRequest,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    expect(events[0]).toMatchObject({
      field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
      have: '我自己写的一段提示词',
      proposed: '助手写的新提示词',
    })
    expect(events[1]).toMatchObject({
      reason: ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm,
    })
    // 第一步就停了 —— 只问了模型一次
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
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
      events.some(
        (event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirmRequest,
      ),
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

  it('⭐ 观察里必须写明「只是预览、你不能导入」——否则模型会拿去挂参考', async () => {
    mockWebImageSearch.mockResolvedValue(WEB_HITS)
    queueWebSearch()

    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = lastUserPrompt()
    expect(prompt).toContain('PREVIEW')
    expect(prompt).toContain('nothing was saved')
    expect(prompt).toContain('cannot mount, import, or reference')
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
    { ok: true, text: '红伞是画面唯一的暖色' },
    { ok: false, text: '雨丝糊成一片' },
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
    expect(events.map((event) => event.type)).toEqual([
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
  it('视频域的清单里没有 set_count / set_specs / critique_result，有那三条视频件', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildVideoRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs)
    expect(prompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference)
    expect(prompt).toContain(ASSISTANT_OPERATOR_TOOL_IDS.setSound)
    // ⭐ 列全集的代价是实打实的：看得见就会去试，而一轮只有 maxSteps 步。
    expect(prompt).not.toContain(`- ${ASSISTANT_OPERATOR_TOOL_IDS.setCount}:`)
    expect(prompt).not.toContain(`- ${ASSISTANT_OPERATOR_TOOL_IDS.setSpecs}:`)
    expect(prompt).not.toContain(
      `- ${ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult}:`,
    )
  })

  it('图片域的清单里没有视频那三条', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain(`- ${ASSISTANT_OPERATOR_TOOL_IDS.setCount}:`)
    expect(prompt).not.toContain(
      `- ${ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs}:`,
    )
    expect(prompt).not.toContain(
      `- ${ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference}:`,
    )
    expect(prompt).not.toContain(`- ${ASSISTANT_OPERATOR_TOOL_IDS.setSound}:`)
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

  it('⛔ 视频域即使带着 result 也不给看图 —— 借来的视觉线读不了 mp4', async () => {
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
      error: { reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl },
    })
    // ⚠ 状态块里也不该出现「有一张结果在等你看」那一行 —— 它会教模型白烧一步。
    //   （断言只看状态块：被拒那一步的 observation 里当然会出现工具名。）
    const stateBlock = lastUserPrompt().split('WHAT HAPPENED SO FAR')[0]
    expect(stateBlock).not.toContain('FRESH RESULT')
    expect(stateBlock).not.toContain('fresh result of yours')
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
  it('默认 persona 不改开场白，只印长度那一句', async () => {
    queueTurns({ finished: true })
    await collect(runAssistantOperator('clerk-1', buildRequest()))

    const prompt = systemPrompt()
    expect(prompt).toContain("You are PixelVault's workbench operator.")
    // standard 档 = 2–4 句
    expect(prompt).toContain('Answer in 2–4 sentences.')
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

  it('长度三档各自映射成字数区间，⛔ 不给无边界形容词', async () => {
    for (const [verbosity, expected] of [
      [ASSISTANT_PERSONA_VERBOSITY_IDS.concise, 'Answer in under 2 sentences.'],
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
    expect(prompt.indexOf('HOW YOU TALK')).toBeLessThan(
      prompt.indexOf('Answer in 2–4 sentences.'),
    )
    expect(prompt.indexOf('Answer in 2–4 sentences.')).toBeLessThan(
      prompt.indexOf('TOOLS:'),
    )
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
 * 计划卡协议与花钱档（切片 2a，§2.6 / §5 / §6）。
 *
 * ⚠ 这一族用例守的是**协议**，不是 UI：出不出卡由客户端 `shouldShowPlanCard` 判
 * （它有自己那份测试），这里只钉「服务端把该摆的事实摆全了没有」。
 */
describe('计划卡协议 · plan_request', () => {
  it('⭐ plan 帧之后紧跟一帧 plan_request，且排在第一个 step 之前', async () => {
    queueTurns(
      {
        plan: ['看一眼表单', '写提示词', '备好生成键'],
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
    const order = events.map((event) => event.type)
    expect(order[0]).toBe(ASSISTANT_OPERATOR_EVENTS.plan)
    expect(order[1]).toBe(ASSISTANT_OPERATOR_EVENTS.planRequest)
    // ⭐ 客户端要在**任何一步落地之前**就能决定「先问一句」。
    expect(order.indexOf(ASSISTANT_OPERATOR_EVENTS.planRequest)).toBeLessThan(
      order.indexOf(ASSISTANT_OPERATOR_EVENTS.step),
    )
  })

  it('待定项带 id、图示与预估；词表外的 visual 被剥掉而整轮照跑', async () => {
    queueTurns(
      {
        plan: ['定构图', '写提示词'],
        pending: [
          {
            label: '取多少身？',
            options: [
              { label: '半身', visual: 'comp.halfBody' },
              // ⛔ 词表外的 id —— 剥掉那个图示，⛔ 不作废这一轮。
              { label: '全身', visual: 'comp.wholeThing' },
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
    const planRequest = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.planRequest,
    )
    expect(planRequest).toBeDefined()
    const frame = planRequest as Extract<
      AssistantOperatorEvent,
      { type: 'plan_request' }
    >
    expect(frame.steps).toEqual([
      { id: 'plan-1', label: '定构图' },
      { id: 'plan-2', label: '写提示词' },
    ])
    expect(frame.pending).toHaveLength(1)
    expect(frame.pending[0]?.id).toBe('pending-1')
    expect(frame.pending[0]?.kind).toBe('single')
    expect(frame.pending[0]?.options[0]?.visual).toBe('comp.halfBody')
    // 剥掉的那个：选项还在（文字选得动），只是没有图示。
    expect(frame.pending[0]?.options[1]?.visual).toBeUndefined()
    // 预估从快照现算 —— 模型给不出，也不许它给。
    expect(frame.estimate.model).toBe('Seedream 4')
    expect(frame.estimate.count).toBe(1)
    // ⚠ 这一轮不花钱，理由是「多步」。
    expect(frame.reason).toBe('multi-step')
  })

  it('只剩一个选项的待定项整条丢掉（一个选项的单选是通知不是问题）', async () => {
    queueTurns(
      {
        plan: ['写提示词'],
        pending: [{ label: '要不要加雨？', options: [{ label: '加' }] }],
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator('clerk-1', buildRequest()),
    )
    const frame = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.planRequest,
    ) as Extract<AssistantOperatorEvent, { type: 'plan_request' }>
    expect(frame.pending).toEqual([])
  })

  it('「先问我」开着时理由是 user-requested；备生成键那一轮是 spend', async () => {
    queueTurns({ plan: ['写提示词'] }, { finished: true })
    const forced = await collect(
      runAssistantOperator('clerk-1', buildRequest({ forcePlan: true })),
    )
    expect(
      (
        forced.find(
          (event) => event.type === ASSISTANT_OPERATOR_EVENTS.planRequest,
        ) as Extract<AssistantOperatorEvent, { type: 'plan_request' }>
      ).reason,
    ).toBe('user-requested')

    queueTurns(
      {
        plan: ['备好生成键'],
        tool: { name: ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate, args: {} },
      },
      { finished: true },
    )
    const spending = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: { ...SNAPSHOT, prompt: '已经写好了' } }),
      ),
    )
    expect(
      (
        spending.find(
          (event) => event.type === ASSISTANT_OPERATOR_EVENTS.planRequest,
        ) as Extract<AssistantOperatorEvent, { type: 'plan_request' }>
      ).reason,
    ).toBe('spend')
  })

  it('⭐ planApproved=false 时把答复并进上下文并要求重新规划一次', async () => {
    queueTurns({ plan: ['重新来一版'] }, { finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          planApproved: false,
          planAnswers: [{ pendingId: 'pending-1', optionId: 'option-1-2' }],
        }),
      ),
    )
    const prompt = lastUserPrompt()
    expect(prompt).toContain('WANTS A DIFFERENT PLAN')
    expect(prompt).toContain('pending-1: option-1-2')
  })

  it('planApproved=true 时答复是既定事实，⛔ 不要求重新规划', async () => {
    queueTurns({ plan: ['照计划走'] }, { finished: true })
    await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          planApproved: true,
          planAnswers: [{ pendingId: 'pending-1', optionId: 'option-1-1' }],
        }),
      ),
    )
    const prompt = lastUserPrompt()
    expect(prompt).toContain('APPROVED YOUR PLAN')
    expect(prompt).not.toContain('WANTS A DIFFERENT PLAN')
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

describe('确认三档 · 花钱档（§6）', () => {
  /**
   * ⚠ 这一族用**目录里真的有**的模型 id：预估金额取的是 `AI_MODELS[].cost`，
   * 编一个 id 的话金额永远算不出来，而「算不出来就重新硬确认」正好会让
   * 放行那条用例假绿。
   */
  const SPEND_MODEL_ID = AI_MODELS.FLUX_2_PRO
  const SPEND_MODEL_COST = getModelById(SPEND_MODEL_ID)?.cost as number
  const PRIMED_SNAPSHOT = {
    ...SNAPSHOT,
    prompt: '一只在雨里的猫',
    model: { id: SPEND_MODEL_ID, label: 'FLUX.2 Pro' },
    availableModels: [{ id: SPEND_MODEL_ID, label: 'FLUX.2 Pro' }],
  }

  it('⭐ 没有「不再问」条子时先出硬确认卡，流停在 awaiting_confirm', async () => {
    queueTurns({
      tool: { name: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration, args: {} },
    })
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({ snapshot: PRIMED_SNAPSHOT }),
      ),
    )
    expect(events.map((event) => event.type)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.spendRequest,
      ASSISTANT_OPERATOR_EVENTS.stopped,
    ])
    const spend = events[0] as Extract<
      AssistantOperatorEvent,
      { type: 'spend_request' }
    >
    expect(spend.tier).toBe('spend')
    expect(spend.request.model).toEqual({
      id: SPEND_MODEL_ID,
      label: 'FLUX.2 Pro',
    })
    expect(spend.request.count).toBe(1)
    expect(spend.request.specs).toEqual({
      aspectRatio: '1:1',
      resolution: 'auto',
      durationSeconds: null,
    })
    // 金额从模型目录现算（cost × 张数）。
    expect(SPEND_MODEL_COST).toBeGreaterThan(0)
    expect(spend.request.estimate.credits).toBe(SPEND_MODEL_COST)
    expect(
      (events[1] as Extract<AssistantOperatorEvent, { type: 'stopped' }>)
        .reason,
    ).toBe(ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm)
  })

  it('⭐ 同模型且金额不超上次时放行，只吐一步载荷（服务端什么都没做）', async () => {
    queueTurns(
      {
        tool: { name: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration, args: {} },
      },
      { finished: true },
    )
    const events = await collect(
      runAssistantOperator(
        'clerk-1',
        buildRequest({
          snapshot: PRIMED_SNAPSHOT,
          autoApprove: {
            tier: 'spend',
            model: SPEND_MODEL_ID,
            maxCredits: SPEND_MODEL_COST,
          },
        }),
      ),
    )
    expect(
      events.some(
        (event) => event.type === ASSISTANT_OPERATOR_EVENTS.spendRequest,
      ),
    ).toBe(false)
    const [running, done] = stepsOf(events)
    expect(running.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.running)
    expect(done.status).toBe(ASSISTANT_OPERATOR_STEP_STATUS_IDS.done)
    expect(done.tool).toBe(ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration)
    // ⛔ 撤不掉 —— 契约里就没有 `inverse` 这一格。
    expect(done).not.toHaveProperty('inverse')
  })

  it('⛔ 换了模型 / 金额超了 / 条子的档不对，一律重新硬确认', async () => {
    for (const autoApprove of [
      // 换了模型 —— 换一笔账，重新问。
      { tier: 'spend' as const, model: AI_MODELS.IDEOGRAM_3, maxCredits: 99 },
      // 金额超了上次确认过的那个数。
      {
        tier: 'spend' as const,
        model: SPEND_MODEL_ID,
        maxCredits: SPEND_MODEL_COST - 1,
      },
    ]) {
      queueTurns({
        tool: {
          name: ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
          args: {},
        },
      })
      const events = await collect(
        runAssistantOperator(
          'clerk-1',
          buildRequest({ snapshot: PRIMED_SNAPSHOT, autoApprove }),
        ),
      )
      expect(
        events.some(
          (event) => event.type === ASSISTANT_OPERATOR_EVENTS.spendRequest,
        ),
        `${autoApprove.model}/${autoApprove.maxCredits} 应该重新确认`,
      ).toBe(true)
    }
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
      events.some(
        (event) => event.type === ASSISTANT_OPERATOR_EVENTS.spendRequest,
      ),
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

  it('覆盖档的 confirm_request 显式带 tier=overwrite（⛔ 服务端不发空的档）', async () => {
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
    const confirm = events.find(
      (event) => event.type === ASSISTANT_OPERATOR_EVENTS.confirmRequest,
    ) as Extract<AssistantOperatorEvent, { type: 'confirm_request' }>
    expect(confirm.tier).toBe('overwrite')
  })
})
