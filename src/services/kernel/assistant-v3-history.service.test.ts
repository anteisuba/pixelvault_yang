import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_V3_HISTORY } from '@/constants/assistant-v3'
import {
  splitAssistantV3History,
  type AssistantV3HistoryPlan,
} from '@/lib/assistant-v3-history'
import type { AssistantV3HistorySummary } from '@/types/assistant-v3'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  afterTasks: [] as (() => Promise<unknown>)[],
  afterThrows: false,
  complete: vi.fn<(options: Record<string, unknown>) => Promise<string>>(),
  warn: vi.fn(),
  store: {
    persists: true,
    load: vi.fn<() => Promise<AssistantV3HistorySummary[]>>(),
    rows: [] as AssistantV3HistorySummary[],
  },
}))

vi.mock('next/server', () => ({
  after: (task: () => Promise<unknown>) => {
    if (mocks.afterThrows) throw new Error('outside a request scope')
    mocks.afterTasks.push(task)
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/kernel/assistant-completion.service', () => ({
  completeAssistantTextWithContextRetry: mocks.complete,
}))
vi.mock('@/services/kernel/assistant-v3-history-store.service', () => ({
  assistantV3HistoryStore: {
    get persists() {
      return mocks.store.persists
    },
    load: () => mocks.store.load(),
    update: async (
      _key: unknown,
      apply: (
        current: AssistantV3HistorySummary[],
      ) => AssistantV3HistorySummary[],
    ) => {
      mocks.store.rows = apply(mocks.store.rows)
    },
  },
}))

import {
  ASSISTANT_V3_HISTORY_SUMMARY_SYSTEM_PROMPT,
  loadAssistantV3HistorySummaries,
  scheduleAssistantV3HistorySummary,
} from './assistant-v3-history.service'

const owner = {
  userId: 'db_user_1',
  clerkId: 'clerk_1',
  conversationId: '5f0c2a9e-3b1d-4c7a-9e21-7d4b8a6c0f13',
  incognito: false,
}
const route = {
  adapterType: 'deepseek',
  apiKey: 'sk-test',
  providerConfig: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
} as unknown as ResolvedLlmTextRoute

const { turns } = splitAssistantV3History([
  { role: 'user', content: '定了：16:9 横版' },
  { role: 'assistant', content: '好' },
  { role: 'user', content: '第二轮' },
  { role: 'assistant', content: '收到' },
  { role: 'user', content: 'now' },
])
const plan: AssistantV3HistoryPlan = {
  start: 1,
  summary: null,
  summarize: { previous: null, from: 0, to: 1 },
}

function schedule(
  overrides: Partial<
    Parameters<typeof scheduleAssistantV3HistorySummary>[0]
  > = {},
) {
  scheduleAssistantV3HistorySummary({
    owner,
    plan,
    turns,
    route,
    modelId: 'deepseek-flash',
    domain: 'canvas',
    cacheKey: 'historySummary:abc',
    ...overrides,
  })
}

async function settle() {
  const tasks = mocks.afterTasks.splice(0)
  await Promise.all(tasks.map((task) => task()))
}

beforeEach(() => {
  mocks.afterTasks.length = 0
  mocks.afterThrows = false
  mocks.complete.mockReset()
  mocks.warn.mockReset()
  mocks.store.persists = true
  mocks.store.load.mockReset()
  mocks.store.rows = []
})

describe('loadAssistantV3HistorySummaries', () => {
  it('存不下 / 没会话：不读、不补', async () => {
    mocks.store.persists = false
    expect(await loadAssistantV3HistorySummaries(owner)).toEqual({
      summaries: [],
      canSummarize: false,
    })
    mocks.store.persists = true
    expect(
      await loadAssistantV3HistorySummaries({
        ...owner,
        conversationId: undefined,
      }),
    ).toEqual({ summaries: [], canSummarize: false })
    expect(mocks.store.load).not.toHaveBeenCalled()
  })

  it('隐身照读（只关写入），⛔ 补', async () => {
    const stored = [
      {
        through: 'abc',
        turns: 8,
        decisions: ['16:9'],
        preferences: [],
        openItems: [],
        names: [],
      },
    ]
    mocks.store.load.mockResolvedValue(stored)
    expect(
      await loadAssistantV3HistorySummaries({ ...owner, incognito: true }),
    ).toEqual({ summaries: stored, canSummarize: false })
    expect(await loadAssistantV3HistorySummaries(owner)).toEqual({
      summaries: stored,
      canSummarize: true,
    })
  })

  it('读不出来：记一行警告，⛔ 写（免得冲掉存着的）', async () => {
    mocks.store.load.mockRejectedValue(new Error('db down'))
    expect(await loadAssistantV3HistorySummaries(owner)).toEqual({
      summaries: [],
      canSummarize: false,
    })
    expect(mocks.warn).toHaveBeenCalledWith(
      'assistant history summaries not loaded',
      expect.objectContaining({ error: 'db down' }),
    )
  })
})

describe('scheduleAssistantV3HistorySummary', () => {
  it('收尾后才开跑；这一轮的那一家、那个型号、low 档、要 JSON、自己的时限', async () => {
    mocks.complete.mockResolvedValue(
      '{"decisions":["16:9 横版"],"preferences":[],"openItems":[],"names":[]}',
    )
    schedule()
    expect(mocks.complete).not.toHaveBeenCalled()
    await settle()
    expect(mocks.complete).toHaveBeenCalledTimes(1)
    const options = mocks.complete.mock.calls[0]![0]
    expect(options).toMatchObject({
      route,
      modelId: 'deepseek-flash',
      reasoningEffort: 'low',
      responseFormat: 'json_object',
      systemPrompt: ASSISTANT_V3_HISTORY_SUMMARY_SYSTEM_PROMPT,
      callLog: { purpose: 'historySummary', domain: 'canvas' },
      cacheKey: 'historySummary:abc',
      contextCompactionTargetLength:
        ASSISTANT_V3_HISTORY.summary.compactedSourceChars,
    })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    const buildUserPrompt = options.buildUserPrompt as (max?: number) => string
    expect(buildUserPrompt()).toContain('[creator] 定了：16:9 横版')
    expect(buildUserPrompt()).not.toContain('第二轮')
    expect(buildUserPrompt(20)).toHaveLength(20)
    expect(mocks.store.rows).toEqual([
      {
        through: turns[0]!.fingerprint,
        turns: 1,
        decisions: ['16:9 横版'],
        preferences: [],
        openItems: [],
        names: [],
      },
    ])
  })

  it('失败（读不出 JSON / 调用出错）：记警告，存着的那几份不动', async () => {
    const kept: AssistantV3HistorySummary = {
      through: 'old',
      turns: 8,
      decisions: ['keep'],
      preferences: [],
      openItems: [],
      names: [],
    }
    mocks.store.rows = [kept]
    mocks.complete.mockResolvedValueOnce('sorry, no json')
    schedule()
    await settle()
    mocks.complete.mockRejectedValueOnce(new Error('timeout'))
    schedule()
    await settle()
    expect(mocks.store.rows).toEqual([kept])
    expect(mocks.warn).toHaveBeenCalledTimes(2)
    expect(mocks.warn).toHaveBeenLastCalledWith(
      'assistant history summary not stored',
      expect.objectContaining({
        adapterType: 'deepseek',
        modelId: 'deepseek-flash',
        error: 'timeout',
      }),
    )
  })

  it('同一段会话、管到同一轮的那一份正在补：⛔ 再起一次', async () => {
    mocks.complete.mockResolvedValue('{"decisions":[]}')
    schedule()
    schedule()
    expect(mocks.afterTasks).toHaveLength(1)
    await settle()
    schedule()
    expect(mocks.afterTasks).toHaveLength(1)
    await settle()
  })

  it('隐身 / 存不下 / 没会话 / 没缺口：一次都不调', async () => {
    schedule({ owner: { ...owner, incognito: true } })
    schedule({ owner: { ...owner, conversationId: undefined } })
    schedule({ plan: { ...plan, summarize: null } })
    mocks.store.persists = false
    schedule()
    await settle()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('不在请求作用域里（脚本）：当场跑', async () => {
    mocks.afterThrows = true
    mocks.complete.mockResolvedValue('{"decisions":["x"]}')
    schedule()
    await vi.waitFor(() => expect(mocks.store.rows).toHaveLength(1))
  })
})
