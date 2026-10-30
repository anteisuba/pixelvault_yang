import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  cardFind: vi.fn(),
  outingFindFirst: vi.fn(),
  outingFindMany: vi.fn(),
  outingFindUnique: vi.fn(),
  outingCreate: vi.fn(),
  outingUpdate: vi.fn(),
  outingUpdateMany: vi.fn(),
  findingFindMany: vi.fn(),
  findingCount: vi.fn(),
  route: vi.fn(),
  browseRound: vi.fn(),
  meteredComplete: vi.fn(),
  writeJournal: vi.fn(),
  usage: vi.fn(),
}))

vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: mocks.cardFind },
    characterOuting: {
      findFirst: mocks.outingFindFirst,
      findMany: mocks.outingFindMany,
      findUnique: mocks.outingFindUnique,
      create: mocks.outingCreate,
      update: mocks.outingUpdate,
      updateMany: mocks.outingUpdateMany,
    },
    characterFinding: {
      findMany: mocks.findingFindMany,
      count: mocks.findingCount,
    },
  },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: mocks.route,
}))
vi.mock('@/services/usage.service', () => ({
  createApiUsageEntry: mocks.usage,
}))
vi.mock('./character-reflection.service', () => ({
  writeJournal: mocks.writeJournal,
}))
vi.mock('./character-browse.service', async () => {
  const actual = await vi.importActual<
    typeof import('./character-browse.service')
  >('./character-browse.service')
  return {
    OutingMeter: actual.OutingMeter,
    OutingBudgetExhausted: actual.OutingBudgetExhausted,
    normalizeOutingSite: actual.normalizeOutingSite,
    availableBrowseSources: () => ['bilibili', 'danbooru', 'civitai', 'web'],
    personaText: () => '',
    browseRound: mocks.browseRound,
    meteredComplete: mocks.meteredComplete,
  }
})

import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'
import { ApiKeyError } from '@/lib/errors'
import { OutingBudgetExhausted } from './character-browse.service'
import {
  runOutingChunk,
  startOutingForClerkId,
  stopOutingForClerkId,
} from './character-outing.service'

const MODEL = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].modelId
const STARTED = new Date('2026-10-30T01:00:00Z')

function row(patch: object = {}) {
  return {
    id: 'o1',
    status: 'RUNNING',
    model: MODEL,
    sources: [],
    sites: ['pixiv.net'],
    budgetPoints: 30,
    usedTokens: 0,
    kept: 0,
    nowLabel: null,
    endReason: null,
    startedAt: STARTED,
    endedAt: null,
    leaseUntil: null,
    ...patch,
  }
}

function loaded(patch: object = {}) {
  return {
    ...row(),
    userId: 'user-1',
    calls: 0,
    rounds: 0,
    emptyRounds: 0,
    stopRequested: false,
    characterCard: {
      id: 'card-1',
      name: 'Denia',
      tags: [],
      persona: {},
      extensions: null,
      updatedAt: STARTED,
      isDeleted: false,
    },
    ...patch,
  }
}

const ROUTE = {
  route: { adapterType: 'gemini', apiKey: 'k', providerConfig: {} },
  modelId: MODEL,
}

/** 最后一次把这一趟写成收工的那一下。 */
function finished() {
  const call = mocks.outingUpdate.mock.calls.find(
    ([arg]) => (arg as { data: { endedAt?: Date } }).data.endedAt,
  )
  return call?.[0] as { data: Record<string, unknown> } | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.route.mockResolvedValue(ROUTE)
  mocks.outingUpdateMany.mockResolvedValue({ count: 1 })
  mocks.outingUpdate.mockResolvedValue({ stopRequested: false })
  mocks.findingFindMany.mockResolvedValue([{ title: 't', note: 'n' }])
  mocks.usage.mockResolvedValue({})
})

describe('startOutingForClerkId', () => {
  beforeEach(() => {
    mocks.cardFind.mockResolvedValue({ id: 'card-1' })
    mocks.outingFindFirst.mockResolvedValue(null)
    mocks.outingCreate.mockImplementation(async ({ data }) =>
      row({ ...data, id: 'o1' }),
    )
  })

  it('记一趟（网址规整成域名、去重），马上回，后台开跑', async () => {
    const run = await startOutingForClerkId('clerk', 'card-1', {
      model: MODEL,
      sources: ['bilibili'],
      sites: ['https://www.pixiv.net/ranking', 'pixiv.net', '不是网址'],
      budgetPoints: 30,
    })
    expect(mocks.outingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RUNNING',
          model: MODEL,
          sources: ['bilibili'],
          sites: ['pixiv.net'],
          budgetPoints: 30,
        }),
      }),
    )
    expect(run?.status).toBe('RUNNING')
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })

  it('已经在外面：409；型号不认识 / 没 key：说人话', async () => {
    mocks.outingFindFirst.mockResolvedValueOnce({ id: 'busy' })
    await expect(
      startOutingForClerkId('clerk', 'card-1', {
        model: MODEL,
        sources: [],
        sites: [],
        budgetPoints: 30,
      }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterOuting.running' })
    await expect(
      startOutingForClerkId('clerk', 'card-1', {
        model: 'retired-model',
        sources: [],
        sites: [],
        budgetPoints: 30,
      }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterOuting.unknownModel' })
    mocks.route.mockRejectedValueOnce(new ApiKeyError('missing'))
    await expect(
      startOutingForClerkId('clerk', 'card-1', {
        model: MODEL,
        sources: [],
        sites: [],
        budgetPoints: 30,
      }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterOuting.missingKey' })
    expect(mocks.outingCreate).not.toHaveBeenCalled()
  })

  it('不是你的卡回 null', async () => {
    mocks.cardFind.mockResolvedValueOnce(null)
    await expect(
      startOutingForClerkId('clerk', 'x', {
        model: MODEL,
        sources: [],
        sites: [],
        budgetPoints: 30,
      }),
    ).resolves.toBeNull()
  })
})

describe('stopOutingForClerkId', () => {
  it('记下「结束」；没在外面回 null', async () => {
    mocks.outingFindFirst.mockResolvedValueOnce(
      row({ leaseUntil: new Date(Date.now() + 60_000) }),
    )
    await expect(
      stopOutingForClerkId('clerk', 'card-1'),
    ).resolves.toMatchObject({ id: 'o1' })
    expect(mocks.outingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stopRequested: true } }),
    )
    // 那一段还占着：它自己会停，⛔ 另起一段。
    expect(mocks.after).not.toHaveBeenCalled()
    mocks.outingFindFirst.mockResolvedValueOnce(null)
    await expect(stopOutingForClerkId('clerk', 'card-1')).resolves.toBeNull()
  })
})

describe('runOutingChunk', () => {
  it('别的函数正占着：什么都不做', async () => {
    mocks.outingUpdateMany.mockResolvedValueOnce({ count: 0 })
    await runOutingChunk('o1')
    expect(mocks.outingFindUnique).not.toHaveBeenCalled()
  })

  it('额度花到顶：收工（budget），看到的写成日记，记一笔用量', async () => {
    let roundLimit = 0
    mocks.outingFindUnique.mockResolvedValue(loaded())
    mocks.browseRound
      .mockImplementationOnce(async (input) => {
        roundLimit = input.route.meter.remaining()
        input.route.meter.charge(50_000)
        await input.onNow('bilibili', '古籍修复')
        return { queries: 1, seen: 3, kept: 2 }
      })
      .mockImplementationOnce(async () => {
        throw new OutingBudgetExhausted()
      })
    mocks.findingCount.mockResolvedValue(2)
    mocks.meteredComplete.mockImplementation(async (meter) => {
      meter.charge(3_000)
      return '今天看到古籍修复，好想学。'
    })

    await runOutingChunk('o1')

    const first = mocks.browseRound.mock.calls[0]?.[0]
    expect(first.askInterests).toBe(true)
    expect(first.sources).toEqual([
      'bilibili',
      'danbooru',
      'civitai',
      'web',
      'site:pixiv.net',
    ])
    // 逛的那几轮碰不到写日记那一份。
    expect(roundLimit).toBe(300_000 - 8_000)
    expect(mocks.browseRound.mock.calls[1]?.[0].askInterests).toBe(false)
    expect(mocks.outingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nowLabel: 'bilibili\n古籍修复' }),
      }),
    )
    expect(mocks.writeJournal).toHaveBeenCalledWith(
      'user-1',
      'card-1',
      '今天看到古籍修复，好想学。',
    )
    expect(finished()?.data).toMatchObject({
      status: 'DONE',
      endReason: 'budget',
      usedTokens: 53_000,
      calls: 2,
      kept: 2,
    })
    expect(mocks.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        modelId: MODEL,
        requestCount: 2,
        outputImageCount: 0,
        wasSuccessful: true,
      }),
    )
  })

  it('你点了「结束」：这一轮的下一步之前停，看到的照样留着', async () => {
    mocks.outingFindUnique.mockResolvedValue(loaded())
    mocks.outingUpdate.mockResolvedValueOnce({ stopRequested: true })
    mocks.browseRound.mockImplementationOnce(async (input) => {
      await input.onNow('web', '雨天')
      return { queries: 1, seen: 0, kept: 0 }
    })

    await runOutingChunk('o1')

    expect(finished()?.data).toMatchObject({
      status: 'STOPPED',
      endReason: 'stopped',
    })
  })

  it('连着两轮一条新的都没有：收工（nothing），没带回东西不写日记', async () => {
    mocks.outingFindUnique.mockResolvedValue(loaded())
    mocks.browseRound.mockResolvedValue({ queries: 1, seen: 0, kept: 0 })

    await runOutingChunk('o1')

    expect(mocks.browseRound).toHaveBeenCalledTimes(2)
    expect(mocks.writeJournal).not.toHaveBeenCalled()
    expect(finished()?.data).toMatchObject({
      status: 'DONE',
      endReason: 'nothing',
      rounds: 2,
    })
  })

  it('半路 key 没了：记失败', async () => {
    mocks.outingFindUnique.mockResolvedValue(loaded())
    mocks.route.mockRejectedValueOnce(new ApiKeyError('missing'))

    await runOutingChunk('o1')

    expect(finished()?.data).toMatchObject({
      status: 'FAILED',
      endReason: 'failed',
    })
    expect(mocks.browseRound).not.toHaveBeenCalled()
  })
})
