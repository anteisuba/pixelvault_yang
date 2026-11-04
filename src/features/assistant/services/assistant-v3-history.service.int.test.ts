import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  /** 摘要那一次模型调用（`llmTextCompletion` 边界）。 */
  complete: vi.fn<(options: Record<string, unknown>) => Promise<string>>(),
  warn: vi.fn(),
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
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (options: Record<string, unknown>) =>
    mocks.complete(options),
}))

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  ASSISTANT_V3_HISTORY_SUMMARY_SYSTEM_PROMPT,
  loadAssistantV3HistorySummaries,
  scheduleAssistantV3HistorySummary,
} from './assistant-v3-history.service'

/**
 * v3 历史摘要（真库 L2a）：摘要存进真会话行的 `historySummary`（真 store）；只假模型那一跳。
 */
let owner = {
  userId: '',
  clerkId: '',
  conversationId: '' as string | undefined,
  incognito: false,
}

/** 这段会话存着的摘要。 */
async function storedRows(): Promise<AssistantV3HistorySummary[]> {
  const row = await db.assistantConversation.findUniqueOrThrow({
    where: { id: owner.conversationId! },
  })
  return (row.historySummary ?? []) as unknown as AssistantV3HistorySummary[]
}

async function storeRows(rows: AssistantV3HistorySummary[]) {
  await db.assistantConversation.update({
    where: { id: owner.conversationId! },
    data: { historySummary: rows as never },
  })
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
  while (mocks.afterTasks.length) {
    const tasks = mocks.afterTasks.splice(0)
    await Promise.all(tasks.map((task) => task()))
  }
}

beforeEach(async () => {
  mocks.afterTasks.length = 0
  mocks.afterThrows = false
  mocks.complete.mockReset()
  mocks.warn.mockReset()
  await resetDatabase()
  const user = await createTestUser()
  const conversation = await db.assistantConversation.create({
    data: { userId: user.id, surface: 'NODE_CANVAS', messages: [] },
  })
  owner = {
    userId: user.id,
    clerkId: user.clerkId,
    conversationId: conversation.id,
    incognito: false,
  }
})

describe('loadAssistantV3HistorySummaries', () => {
  it('没会话：不读、不补', async () => {
    expect(
      await loadAssistantV3HistorySummaries({
        ...owner,
        conversationId: undefined,
      }),
    ).toEqual({ summaries: [], canSummarize: false })
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
    await storeRows(stored)
    expect(
      await loadAssistantV3HistorySummaries({ ...owner, incognito: true }),
    ).toEqual({ summaries: stored, canSummarize: false })
    expect(await loadAssistantV3HistorySummaries(owner)).toEqual({
      summaries: stored,
      canSummarize: true,
    })
  })

  it('读不出来：记一行警告，⛔ 写（免得冲掉存着的）', async () => {
    // Postgres 的文本收不下 `\u0000`：让那一次读真报错。
    expect(
      await loadAssistantV3HistorySummaries({
        ...owner,
        conversationId: 'bad\u0000id',
      }),
    ).toEqual({ summaries: [], canSummarize: false })
    expect(mocks.warn).toHaveBeenCalledWith(
      'assistant history summaries not loaded',
      expect.anything(),
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
      adapterType: route.adapterType,
      apiKey: route.apiKey,
      modelId: 'deepseek-flash',
      reasoningEffort: 'low',
      responseFormat: 'json_object',
      systemPrompt: ASSISTANT_V3_HISTORY_SUMMARY_SYSTEM_PROMPT,
      cacheKey: 'historySummary:abc',
    })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.userPrompt).toContain('[creator] 定了：16:9 横版')
    expect(options.userPrompt).not.toContain('第二轮')
    expect(await storedRows()).toEqual([
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
    await storeRows([kept])
    mocks.complete.mockResolvedValueOnce('sorry, no json')
    schedule()
    await settle()
    mocks.complete.mockRejectedValueOnce(new Error('timeout'))
    schedule()
    await settle()
    expect(await storedRows()).toEqual([kept])
    const notStored = mocks.warn.mock.calls.filter(
      ([message]) => message === 'assistant history summary not stored',
    )
    expect(notStored).toHaveLength(2)
    expect(mocks.warn).toHaveBeenCalledWith(
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
    await settle()
    expect(mocks.complete).toHaveBeenCalledTimes(1)
    // 那一份补完了，下一次照常起。
    schedule()
    await settle()
    expect(mocks.complete).toHaveBeenCalledTimes(2)
  })

  it('隐身 / 没会话 / 没缺口：一次都不调', async () => {
    schedule({ owner: { ...owner, incognito: true } })
    schedule({ owner: { ...owner, conversationId: undefined } })
    schedule({ plan: { ...plan, summarize: null } })
    await settle()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('不在请求作用域里（脚本）：当场跑', async () => {
    mocks.afterThrows = true
    mocks.complete.mockResolvedValue('{"decisions":["x"]}')
    schedule()
    await vi.waitFor(async () => expect(await storedRows()).toHaveLength(1))
  })
})
