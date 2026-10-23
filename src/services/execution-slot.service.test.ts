import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 按账号排队（第 5a 步）：同一个账号同时只出表里那么多张，其余先来先出。
 */

interface FakeJob {
  id: string
  userId: string
  adapterType: string
  status: 'RUNNING' | 'COMPLETED' | 'CANCELLED'
  createdAt: Date
  updatedAt: Date
  startedAt: Date
  slotKey: string | null
  slotAcquiredAt: Date | null
}

const store = { jobs: [] as FakeJob[] }

interface CountWhere {
  slotKey: string
  status: string
  id?: { not: string }
  slotAcquiredAt?: null | { gte: Date }
  createdAt?: { lt: Date }
  updatedAt?: { gte: Date }
}

function matches(job: FakeJob, where: CountWhere): boolean {
  if (job.slotKey !== where.slotKey || job.status !== where.status) return false
  if (where.id && job.id === where.id.not) return false
  if (where.slotAcquiredAt === null && job.slotAcquiredAt !== null) return false
  if (where.slotAcquiredAt && where.slotAcquiredAt !== null) {
    if (!job.slotAcquiredAt || job.slotAcquiredAt < where.slotAcquiredAt.gte)
      return false
  }
  if (where.createdAt && !(job.createdAt < where.createdAt.lt)) return false
  if (where.updatedAt && job.updatedAt < where.updatedAt.gte) return false
  return true
}

const generationJob = {
  findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
    const job = store.jobs.find((item) => item.id === where.id)
    return job ? structuredClone(job) : null
  }),
  count: vi.fn(
    async ({ where }: { where: CountWhere }) =>
      store.jobs.filter((job) => matches(job, where)).length,
  ),
  update: vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string }
      data: Partial<FakeJob>
    }) => {
      const job = store.jobs.find((item) => item.id === where.id)!
      Object.assign(job, data, { updatedAt: new Date() })
      return job
    },
  ),
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    // getter：vi.mock 会被提到文件顶上，那时 generationJob 还没建好。
    get generationJob() {
      return generationJob
    },
    $transaction: async (
      callback: (tx: Record<string, unknown>) => Promise<unknown>,
    ) => callback({ generationJob, $executeRaw: vi.fn() }),
  },
}))

import { acquireExecutionSlot, isWaitingForSlot } from './execution-slot.service'

function addJob(id: string, adapterType: string, minutesAgo = 0): FakeJob {
  const at = new Date(Date.now() - minutesAgo * 60_000)
  const job: FakeJob = {
    id,
    userId: 'user-1',
    adapterType,
    status: 'RUNNING',
    createdAt: at,
    updatedAt: at,
    startedAt: at,
    slotKey: null,
    slotAcquiredAt: null,
  }
  store.jobs.push(job)
  return job
}

const ask = (runId: string) =>
  acquireExecutionSlot({ runId, apiKeyId: 'key-nai' })

beforeEach(() => {
  store.jobs = []
  vi.clearAllMocks()
})

describe('按账号排队', () => {
  it('NovelAI 一次 1 张：4 张进来 1 张出、3 张排队，出完一张轮到下一张', async () => {
    const jobs = ['a', 'b', 'c', 'd'].map((id, index) =>
      addJob(id, 'novelai', 4 - index),
    )

    expect(await ask('a')).toEqual({ state: 'granted' })
    expect(await ask('b')).toEqual({ state: 'waiting', ahead: 1 })
    expect(await ask('c')).toEqual({ state: 'waiting', ahead: 2 })
    expect(await ask('d')).toEqual({ state: 'waiting', ahead: 3 })
    expect(isWaitingForSlot(jobs[1]!)).toBe(true)
    expect(isWaitingForSlot(jobs[0]!)).toBe(false)

    // 后来的先来问也不插队。
    jobs[0]!.status = 'COMPLETED'
    expect(await ask('c')).toEqual({ state: 'waiting', ahead: 1 })
    expect(await ask('b')).toEqual({ state: 'granted' })
    expect(jobs[1]!.slotKey).toBe('key:key-nai')
  })

  it('排上号的再来问还是排上；取消了的回 cancelled', async () => {
    const job = addJob('a', 'novelai')
    await ask('a')
    expect(await ask('a')).toEqual({ state: 'granted' })
    job.status = 'CANCELLED'
    expect(await ask('a')).toEqual({ state: 'cancelled' })
    expect(await ask('missing')).toEqual({ state: 'cancelled' })
  })

  it('fal 一次 2 张；不在表里的不排队', async () => {
    addJob('a', 'fal', 3)
    addJob('b', 'fal', 2)
    addJob('c', 'fal', 1)
    expect((await ask('a')).state).toBe('granted')
    expect((await ask('b')).state).toBe('granted')
    expect((await ask('c')).state).toBe('waiting')

    addJob('x', 'ideogram')
    addJob('y', 'ideogram')
    expect((await ask('x')).state).toBe('granted')
    expect((await ask('y')).state).toBe('granted')
  })

  it('兜底：占位太久的、排队不再来问的都不算', async () => {
    const stuck = addJob('a', 'novelai', 30)
    stuck.slotKey = 'key:key-nai'
    stuck.slotAcquiredAt = new Date(Date.now() - 30 * 60_000)
    const gone = addJob('b', 'novelai', 10)
    gone.slotKey = 'key:key-nai'
    addJob('c', 'novelai', 1)
    expect(await ask('c')).toEqual({ state: 'granted' })
  })

  it('平台 key 按 adapter 一条队，没指定 key 按人', async () => {
    addJob('a', 'novelai')
    await acquireExecutionSlot({ runId: 'a', useSystemKey: true })
    addJob('b', 'novelai')
    await acquireExecutionSlot({ runId: 'b' })
    expect(store.jobs.map((job) => job.slotKey)).toEqual([
      'system:novelai',
      'user:user-1:novelai',
    ])
  })
})
