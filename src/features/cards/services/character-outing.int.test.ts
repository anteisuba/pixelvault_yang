/**
 * 角色自己出门逛（`character-outing.service`）：开始 / 结束 / 一段一段跑。
 * 真库（L2a）：卡、这一趟、看到的、日记、用量都是库里的行；逛的那几轮是真的 `browseRound`。
 * 只假模型（`llmTextCompletion`，按系统提示认是哪一步）和网络（`fetch`：搜索源一律空手）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))

type CompletionInput = {
  systemPrompt: string
  userPrompt: string
  onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void
}
const fake = vi.hoisted(() => ({
  /** 想搜什么那一步：回什么、报多少 token、回之前顺手做点什么（模拟这期间发生的事）。 */
  plan: { queries: [] as { source: string; query: string }[] },
  planTokens: 10,
  beforePlan: null as null | (() => Promise<void> | void),
  diary: '今天看到古籍修复，好想学。',
  /** 话题分类（小任务）、话题那趟的搜索词、回来写的小结：回什么（`Error` = 抛）。 */
  classify: { vague: false, tags: [] } as unknown,
  topicPlan: { queries: [] } as unknown,
  digest: { lines: [] } as unknown,
  calls: [] as CompletionInput[],
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: async (input: CompletionInput) => {
    fake.calls.push(input)
    const system = input.systemPrompt
    if (system.includes('You sort a short topic')) {
      if (fake.classify instanceof Error) throw fake.classify
      return JSON.stringify(fake.classify)
    }
    if (system.includes('find out about ONE topic today')) {
      await fake.beforePlan?.()
      input.onUsage?.({ inputTokens: fake.planTokens, outputTokens: 0 })
      return JSON.stringify(fake.topicPlan)
    }
    if (system.includes('Write a short summary of what you found out'))
      return JSON.stringify(fake.digest)
    if (input.systemPrompt.includes('Today you have some free time online')) {
      await fake.beforePlan?.()
      input.onUsage?.({ inputTokens: fake.planTokens, outputTokens: 0 })
      return JSON.stringify(fake.plan)
    }
    input.onUsage?.({ inputTokens: 10, outputTokens: 10 })
    if (input.systemPrompt.includes("Write tonight's diary entry"))
      return fake.diary
    return '{}'
  },
}))

import { after } from 'next/server'

import { CHARACTER_OUTING, CHARACTER_TOPIC } from '@/constants/character-browse'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StartCharacterOutingRequest } from '@/types/character-growth'
import { db } from '@/lib/db'
import { Prisma } from '@/lib/generated/prisma/client'
import { seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  previewOutingTopicForClerkId,
  runOutingChunk,
  startOutingForClerkId,
  stopOutingForClerkId,
} from './character-outing.service'

const MODEL = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].modelId
const START: StartCharacterOutingRequest = {
  model: MODEL,
  sources: [],
  sites: [],
  videos: [],
  pinnedVideos: [],
  budgetPoints: 30,
}

let user: Awaited<ReturnType<typeof createTestUser>>
let cardId = ''

/** 网络：调用日志那一路收下，搜索源一律报错（每个源各自吞成「没找到」）。 */
const network = vi.fn(async (url: string): Promise<Response> => {
  if (url.includes('/logs/')) return new Response(null, { status: 204 })
  return new Response('offline', { status: 503 })
})

beforeEach(async () => {
  await resetDatabase()
  vi.mocked(after).mockClear()
  fake.plan = { queries: [] }
  fake.planTokens = 10
  fake.beforePlan = null
  fake.classify = { vague: false, tags: [] }
  fake.topicPlan = { queries: [] }
  fake.digest = { lines: [] }
  fake.calls = []
  network.mockClear()
  vi.stubGlobal('fetch', (input: string | URL) => network(String(input)))
  user = await createTestUser()
  await seedAssistantKeys(user.id, {
    keys: [{ adapterType: AI_ADAPTER_TYPES.OPENAI }],
  })
  cardId = (await createTestCard(user.id, { name: 'Denia', persona: {} })).id
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function outing(data: Record<string, unknown> = {}) {
  return db.characterOuting.create({
    data: {
      userId: user.id,
      characterCardId: cardId,
      status: 'RUNNING',
      model: MODEL,
      sources: [],
      sites: ['pixiv.net'],
      budgetPoints: 30,
      ...data,
    },
  })
}

const reload = (id: string) =>
  db.characterOuting.findUniqueOrThrow({ where: { id } })

const planCalls = () =>
  fake.calls.filter((call) =>
    call.systemPrompt.includes('Today you have some free time online'),
  )

const journals = () =>
  db.characterJournal.findMany({ where: { characterCardId: cardId } })

function finding(url: string, seenAt?: Date) {
  return db.characterFinding.create({
    data: {
      userId: user.id,
      characterCardId: cardId,
      source: 'bilibili',
      url,
      title: '古籍修复',
      note: '好想学',
      ...(seenAt ? { seenAt } : {}),
    },
  })
}

const callsWith = (needle: string) =>
  fake.calls.filter((call) => call.systemPrompt.includes(needle))

describe('startOutingForClerkId', () => {
  it('记一趟（网址规整成域名、去重），马上回，后台开跑', async () => {
    const run = await startOutingForClerkId(user.clerkId, cardId, {
      ...START,
      sources: ['bilibili'],
      sites: ['https://www.pixiv.net/ranking', 'pixiv.net', '不是网址'],
    })
    expect(run?.status).toBe('RUNNING')
    const row = await reload(run!.id)
    expect(row).toMatchObject({
      status: 'RUNNING',
      model: MODEL,
      sources: ['bilibili'],
      sites: ['pixiv.net'],
      budgetPoints: 30,
    })
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('看视频的开关照存；贴的视频服务端再认一遍，认不出的丢掉', async () => {
    const run = await startOutingForClerkId(user.clerkId, cardId, {
      ...START,
      videos: ['bilibili', 'youtube'],
      pinnedVideos: [
        {
          platform: 'youtube',
          url: 'https://youtu.be/dQw4w9WgXcQ',
          start: 180,
          end: 60,
        },
        { platform: 'bilibili', url: 'https://example.com/not-a-video' },
      ],
    })
    const row = await reload(run!.id)
    expect(row.videos).toEqual(['bilibili', 'youtube'])
    // 规整成 watch?v=；结束在开始之前的那一截不要。
    expect(row.pinnedVideos).toEqual([
      {
        platform: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        start: 180,
      },
    ])
  })

  it('已经在外面：409；型号不认识 / 没 key：说人话；一趟都不多记', async () => {
    await outing()
    await expect(
      startOutingForClerkId(user.clerkId, cardId, START),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterOuting.running' })
    await db.characterOuting.deleteMany({})

    await expect(
      startOutingForClerkId(user.clerkId, cardId, {
        ...START,
        model: 'retired-model',
      }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterOuting.unknownModel' })

    await db.userApiKey.deleteMany({ where: { userId: user.id } })
    await expect(
      startOutingForClerkId(user.clerkId, cardId, START),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterOuting.missingKey' })
    expect(await db.characterOuting.count()).toBe(0)
  })

  it('不是你的卡回 null', async () => {
    const stranger = await createTestUser()
    const theirs = await createTestCard(stranger.id)
    await expect(
      startOutingForClerkId(user.clerkId, theirs.id, START),
    ).resolves.toBeNull()
  })
})

describe('stopOutingForClerkId', () => {
  it('记下「结束」；那一段还占着就让它自己停（⛔ 另起一段）；没在外面回 null', async () => {
    const row = await outing({ leaseUntil: new Date(Date.now() + 60_000) })
    await expect(
      stopOutingForClerkId(user.clerkId, cardId),
    ).resolves.toMatchObject({ id: row.id })
    expect((await reload(row.id)).stopRequested).toBe(true)
    expect(after).not.toHaveBeenCalled()

    await db.characterOuting.update({
      where: { id: row.id },
      data: { status: 'DONE' },
    })
    await expect(stopOutingForClerkId(user.clerkId, cardId)).resolves.toBeNull()
  })
})

describe('runOutingChunk', () => {
  it('别的函数正占着：什么都不做', async () => {
    const row = await outing({ leaseUntil: new Date(Date.now() + 60_000) })
    await runOutingChunk(row.id)
    expect(fake.calls).toHaveLength(0)
    expect(await reload(row.id)).toMatchObject({ status: 'RUNNING', rounds: 0 })
  })

  it('连着两轮一条新的都没有：收工（nothing），没带回东西不写日记；只有第一轮问她在意什么', async () => {
    const row = await outing()
    await runOutingChunk(row.id)

    const plans = planCalls()
    expect(plans).toHaveLength(2)
    // 允许去的内置站 + 你加的网址都交给她挑。
    expect(plans[0]!.systemPrompt).toContain('site:pixiv.net')
    expect(plans[0]!.systemPrompt).toContain('"interests"')
    expect(plans[1]!.systemPrompt).not.toContain('"interests"')
    expect(await journals()).toHaveLength(0)
    expect(await reload(row.id)).toMatchObject({
      status: 'DONE',
      endReason: 'nothing',
      rounds: 2,
      leaseUntil: null,
    })
  })

  it('额度花到顶：收工（budget），看到的写成日记，记一笔用量', async () => {
    const row = await outing()
    await finding('https://www.bilibili.com/video/BV1aaaaaaaa1')
    // 第一轮那一下就把逛的那份额度用完（写日记那一份另留着）。
    fake.planTokens =
      30 * CHARACTER_OUTING.tokensPerPoint - CHARACTER_OUTING.diaryReserveTokens

    await runOutingChunk(row.id)

    expect(planCalls()).toHaveLength(1)
    expect((await journals()).map((entry) => entry.text)).toEqual([
      '今天看到古籍修复，好想学。',
    ])
    const done = await reload(row.id)
    expect(done).toMatchObject({
      status: 'DONE',
      endReason: 'budget',
      calls: 2,
      kept: 1,
      nowLabel: null,
    })
    expect(done.usedTokens).toBeGreaterThan(fake.planTokens)
    expect(done.usedTokens).toBeLessThanOrEqual(
      30 * CHARACTER_OUTING.tokensPerPoint,
    )
    const ledger = await db.apiUsageLedger.findMany({
      where: { userId: user.id },
    })
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      modelId: MODEL,
      requestCount: 2,
      wasSuccessful: true,
    })
  })

  it('先看你贴的视频（看完记下不重看），再逛', async () => {
    const row = await outing({
      videos: ['bilibili'],
      pinnedVideos: [
        {
          platform: 'bilibili',
          url: 'https://www.bilibili.com/video/BV1aaaaaaaa1',
        },
      ],
    })
    await runOutingChunk(row.id)
    const done = await reload(row.id)
    expect(done.pinnedDone).toBe(true)
    expect(done).toMatchObject({ status: 'DONE', endReason: 'nothing' })
  })

  it('你点了「结束」：这一轮的下一步之前停，看到的照样留着', async () => {
    const row = await outing()
    await finding('https://www.bilibili.com/video/BV1aaaaaaaa1')
    fake.plan = { queries: [{ source: 'web', query: '雨天' }] }
    // 她想着搜什么的时候你点了「结束」。
    fake.beforePlan = async () => {
      await db.characterOuting.update({
        where: { id: row.id },
        data: { stopRequested: true },
      })
    }

    await runOutingChunk(row.id)

    expect(await reload(row.id)).toMatchObject({
      status: 'STOPPED',
      endReason: 'stopped',
    })
    expect(
      await db.characterFinding.count({ where: { characterCardId: cardId } }),
    ).toBe(1)
  })

  describe('分段续跑（10-30 线上一段跑满 300 秒被掐）', () => {
    it('一轮半路时间用完：⛔ 收工，存好进度交给下一段（记了几条以库里为准）', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const row = await outing({ rounds: 3 })
      for (const n of [1, 2, 3, 4]) await finding(`https://a.test/${n}`)
      fake.plan = { queries: [{ source: 'web', query: '雨天' }] }
      // 想好搜什么时这一段已经快到头：下一步（联网搜）开不了。
      fake.beforePlan = () => {
        vi.setSystemTime(Date.now() + CHARACTER_OUTING.chunkMs)
      }

      await runOutingChunk(row.id)

      expect(await journals()).toHaveLength(0)
      expect(await reload(row.id)).toMatchObject({
        status: 'RUNNING',
        endedAt: null,
        leaseUntil: null,
        kept: 4,
        rounds: 3,
      })
    })

    it('被截止时刻截断的一轮不算空手而归；剩的时间不够再开一轮就先交给下一段', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const row = await outing({ emptyRounds: 1 })
      fake.beforePlan = () => {
        vi.setSystemTime(Date.now() + CHARACTER_OUTING.chunkMs)
      }

      await runOutingChunk(row.id)

      // 不截断的话连着两轮空手 = 收工（nothing）。
      expect(planCalls()).toHaveLength(1)
      expect(await reload(row.id)).toMatchObject({
        status: 'RUNNING',
        endedAt: null,
        leaseUntil: null,
        emptyRounds: 1,
        rounds: 1,
      })
    })
  })

  it('半路 key 没了：记失败', async () => {
    const row = await outing()
    await db.userApiKey.deleteMany({ where: { userId: user.id } })

    await runOutingChunk(row.id)

    expect(await reload(row.id)).toMatchObject({
      status: 'FAILED',
      endReason: 'failed',
    })
    expect(fake.calls).toHaveLength(0)
  })
})

describe('出门指定话题', () => {
  const TEXT = '《丝之歌》的剧情和评价'
  const topicStart = (
    topic: { text: string; tags: string[] },
    rest: Partial<StartCharacterOutingRequest> = {},
  ) =>
    startOutingForClerkId(user.clerkId, cardId, {
      ...START,
      ...rest,
      topic,
    } as StartCharacterOutingRequest)

  it('开始：前端带了标签和站就照存，不再分类', async () => {
    const run = await topicStart(
      { text: TEXT, tags: ['story', 'review'] },
      { sites: ['fandom.com', 'store.steampowered.com'] },
    )
    expect(callsWith('You sort a short topic')).toHaveLength(0)
    const row = await reload(run!.id)
    expect(row.sites).toEqual(['fandom.com', 'store.steampowered.com'])
    expect(row.topic).toEqual({
      text: TEXT,
      tags: ['story', 'review'],
      digest: null,
    })
    expect(run?.topic).toEqual({
      text: TEXT,
      tags: ['story', 'review'],
      digest: null,
    })
  })

  it('开始：没带站就由服务端分类配站', async () => {
    fake.classify = { vague: false, tags: ['story'] }
    const run = await topicStart({ text: TEXT, tags: [] })
    const row = await reload(run!.id)
    expect(row.sites).toEqual(['fandom.com'])
    expect(row.topic).toEqual({ text: TEXT, tags: ['story'], digest: null })
  })

  it('开始：话题太泛 = 当没写话题，照旧自动（库里 topic 是空）', async () => {
    fake.classify = { vague: true, tags: [] }
    const run = await topicStart({ text: '游戏', tags: [] })
    const row = await reload(run!.id)
    expect(row.topic).toBeNull()
    expect(row.sites).toEqual([])
    expect(run?.topic).toBeNull()
  })

  it('跨段续跑：话题从库里读，只去配的网站，不问兴趣；回来先写带出处的小结再写日记', async () => {
    const row = await outing({
      sites: ['fandom.com'],
      topic: { text: TEXT, tags: ['story', 'review'], digest: null },
    })
    const base = Date.now() + 1_000
    await finding('https://fandom.com/a', new Date(base))
    await finding('https://fandom.com/b', new Date(base + 1_000))
    fake.digest = {
      lines: [
        { text: '讲的是一只虫', refs: [1] },
        { text: '编的', refs: [9] },
      ],
    }
    // 第一轮那一下把逛的那份额度用完（日记和小结那两份另留着）。
    fake.planTokens =
      30 * CHARACTER_OUTING.tokensPerPoint -
      CHARACTER_OUTING.diaryReserveTokens -
      CHARACTER_TOPIC.digestReserveTokens

    await runOutingChunk(row.id)

    // 话题那一步：只给她配的网站，话题进提示，没有兴趣清单。
    const [plan] = callsWith('find out about ONE topic today')
    expect(plan!.systemPrompt).toMatch(/source is one of: site:fandom\.com\./)
    expect(plan!.userPrompt).toContain(TEXT)
    expect(callsWith('"interests"')).toHaveLength(0)
    // 小结只留挂得上这趟链接的句子；日记照写。
    const done = await reload(row.id)
    expect(done).toMatchObject({ status: 'DONE', endReason: 'budget' })
    expect(done.topic).toEqual({
      text: TEXT,
      tags: ['story', 'review'],
      digest: {
        lines: [{ text: '讲的是一只虫', urls: ['https://fandom.com/a'] }],
      },
    })
    expect(await journals()).toHaveLength(1)
  })

  it('小结一句都挂不上链接：不存小结，日记照写', async () => {
    const row = await outing({
      topic: { text: TEXT, tags: ['story'], digest: null },
    })
    await finding('https://fandom.com/a', new Date(Date.now() + 1_000))
    fake.digest = { lines: [{ text: '没出处', refs: [5] }] }
    fake.planTokens =
      30 * CHARACTER_OUTING.tokensPerPoint -
      CHARACTER_OUTING.diaryReserveTokens -
      CHARACTER_TOPIC.digestReserveTokens

    await runOutingChunk(row.id)

    expect(
      callsWith('Write a short summary of what you found out'),
    ).toHaveLength(1)
    expect((await reload(row.id)).topic).toEqual({
      text: TEXT,
      tags: ['story'],
      digest: null,
    })
    expect(await journals()).toHaveLength(1)
  })

  it('没话题的旧趟（topic 为空）照旧：问兴趣、不写小结', async () => {
    const row = await outing({ topic: Prisma.DbNull })
    await finding('https://a.test/1', new Date(Date.now() + 1_000))
    fake.planTokens =
      30 * CHARACTER_OUTING.tokensPerPoint - CHARACTER_OUTING.diaryReserveTokens

    await runOutingChunk(row.id)

    expect(planCalls()[0]!.systemPrompt).toContain('"interests"')
    expect(callsWith('find out about ONE topic today')).toHaveLength(0)
    expect(
      callsWith('Write a short summary of what you found out'),
    ).toHaveLength(0)
    expect(await reload(row.id)).toMatchObject({
      status: 'DONE',
      endReason: 'budget',
      topic: null,
    })
    expect(await journals()).toHaveLength(1)
  })
})

describe('previewOutingTopicForClerkId（弹框里预览会配哪些站）', () => {
  it('回标签和站，不开跑；分类失败走兜底站不报错', async () => {
    fake.classify = { vague: false, tags: ['story'] }
    await expect(
      previewOutingTopicForClerkId(user.clerkId, cardId, {
        topic: '丝之歌的剧情',
        model: MODEL,
      }),
    ).resolves.toMatchObject({ tags: ['story'], sites: ['fandom.com'] })
    expect(await db.characterOuting.count()).toBe(0)

    fake.classify = new Error('timeout')
    const fallback = await previewOutingTopicForClerkId(user.clerkId, cardId, {
      topic: '丝之歌',
      model: MODEL,
    })
    expect(fallback?.vague).toBe(false)
    expect(fallback?.sources).toContain('web')
  })

  it('不是你的卡回 null；型号不认识说人话', async () => {
    const stranger = await createTestUser()
    const theirs = await createTestCard(stranger.id)
    await expect(
      previewOutingTopicForClerkId(user.clerkId, theirs.id, {
        topic: '丝之歌',
        model: MODEL,
      }),
    ).resolves.toBeNull()
    await expect(
      previewOutingTopicForClerkId(user.clerkId, cardId, {
        topic: '丝之歌',
        model: 'retired-model',
      }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterOuting.unknownModel' })
  })
})
