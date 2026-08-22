import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CIVITAI_MIRROR_FETCH_BATCH } from '@/constants/lora'

const mockStateUpsert = vi.fn()
const mockStateUpdate = vi.fn()
const mockStateUpdateMany = vi.fn()
const mockDeleteMany = vi.fn()
const mockCounts = vi.fn()
const mockExecuteRaw = vi.fn()
const mockFetchSearch = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    civitaiMirrorSyncState: {
      upsert: (...args: unknown[]) => mockStateUpsert(...args),
      update: (...args: unknown[]) => mockStateUpdate(...args),
      updateMany: (...args: unknown[]) => mockStateUpdateMany(...args),
    },
    civitaiLoraMirror: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    $queryRaw: (...args: unknown[]) => mockCounts(...args),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/services/civitai-lora.service', () => ({
  fetchCivitaiSearchPayload: (...args: unknown[]) => mockFetchSearch(...args),
}))

import {
  mapHitToMirrorRow,
  syncCivitaiMirrorChunk,
} from '@/services/civitai-mirror-sync.service'

function hitFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 1234,
    name: 'Anima Turbo LoRA',
    user: { username: 'someone' },
    category: { name: 'concept' },
    nsfwLevel: [1, 4],
    tags: [{ name: 'concept' }, { name: 'style' }],
    createdAt: '2026-08-01T00:00:00.000Z',
    lastVersionAtUnix: 1787145243987,
    metrics: { downloadCount: 900, thumbsUpCount: 40, collectedCount: 3 },
    version: {
      id: 4242,
      name: 'v2',
      baseModel: 'Illustrious',
      trainedWords: ['anima'],
      hashData: [
        { hash: 'AAAA', type: 'AutoV2' },
        { hash: 'BBBB', type: 'AutoV3' },
      ],
    },
    images: Array.from({ length: 12 }, (_, i) => ({
      id: i,
      url: `uuid-${i}`,
      type: 'image',
      nsfwLevel: 1,
    })),
    ...overrides,
  }
}

function searchPayload(hits: unknown[]) {
  return { results: [{ hits }] }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExecuteRaw.mockResolvedValue(0)
  mockStateUpdate.mockResolvedValue({})
  // CAS 默认成功（无并发）。count: 0 表示「有别的运行推进过 cursor」。
  mockStateUpdateMany.mockResolvedValue({ count: 1 })
  mockDeleteMany.mockResolvedValue({ count: 0 })
  // 比例闸：默认「本轮几乎全扫到了」，不挡剪枝。
  mockCounts.mockResolvedValue([{ stale: BigInt(0), total: BigInt(0) }])
})

describe('mapHitToMirrorRow', () => {
  it('flattens the nsfwLevel array to its maximum', () => {
    // 三态过滤的语义是存在性的（任意一张超标就算超标），存最大值等价且可
    // 索引——数组存进去就没法走 btree 了。
    expect(mapHitToMirrorRow(hitFixture())?.nsfwLevelMax).toBe(4)
  })

  it('picks AutoV3 out of hashData, not the first hash', () => {
    expect(mapHitToMirrorRow(hitFixture())?.hashAutoV3).toBe('BBBB')
  })

  it('caps stored images so a hot model does not blow up the row', () => {
    // 热门模型实测平均带 15.3 张图的完整元数据；不裁的话全量镜像会大一个
    // 数量级。
    expect(mapHitToMirrorRow(hitFixture())?.images).toHaveLength(6)
  })

  it('falls back to versions[0] when the hit has no chosen version', () => {
    const row = mapHitToMirrorRow(
      hitFixture({ version: undefined, versions: [{ id: 77, name: 'only' }] }),
    )
    expect(row?.versionId).toBe(77)
  })

  it('returns null when there is no usable version at all', () => {
    expect(
      mapHitToMirrorRow(hitFixture({ version: undefined, versions: [] })),
    ).toBeNull()
  })

  it('tolerates upstream nulls instead of dropping the row', () => {
    // Civitai 把「没有值」写成 null 而不是省略字段——每一层都要放行。
    const row = mapHitToMirrorRow(
      hitFixture({ user: null, category: null, metrics: null, tags: null }),
    )
    expect(row).not.toBeNull()
    expect(row?.creator).toBeNull()
    expect(row?.downloadCount).toBe(0)
    expect(row?.tags).toEqual([])
  })
})

describe('syncCivitaiMirrorChunk', () => {
  it('advances the cursor and does not prune mid-pass', async () => {
    // 中途删会把「还没扫到」误判成「已经不在了」。
    mockStateUpsert.mockResolvedValue({ cursor: 0, passStartedAt: null })
    mockFetchSearch.mockResolvedValue(
      searchPayload(
        Array.from({ length: CIVITAI_MIRROR_FETCH_BATCH }, (_, i) =>
          hitFixture({ id: i }),
        ),
      ),
    )

    const result = await syncCivitaiMirrorChunk({ maxBatches: 1 })

    expect(result.completed).toBe(false)
    expect(result.cursor).toBe(CIVITAI_MIRROR_FETCH_BATCH)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('prunes rows the finished pass never touched', async () => {
    const passStartedAt = new Date('2026-08-19T00:00:00.000Z')
    mockStateUpsert.mockResolvedValue({ cursor: 500, passStartedAt })
    // 短页 = 上游供给到头
    mockFetchSearch.mockResolvedValue(searchPayload([hitFixture()]))
    mockDeleteMany.mockResolvedValue({ count: 7 })
    // 比例闸：7/100 = 7%，远低于阈值，不该挡
    mockCounts.mockResolvedValue([{ stale: BigInt(7), total: BigInt(100) }])

    const result = await syncCivitaiMirrorChunk({ maxBatches: 3 })

    expect(result.completed).toBe(true)
    expect(result.pruned).toBe(7)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { syncedAt: { lt: passStartedAt } },
    })
    // 收尾走 CAS（updateMany），不是无条件 update。
    // ⚠ 条件必须同时带 cursor 与 passStartedAt：只比 cursor 会有 ABA——收尾把
    // cursor 重置回 0 之后，并发运行的 `where: { cursor: 0 }` 会意外匹配上，
    // 拿着自己那份边界去剪枝。
    expect(mockStateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cursor: 500, passStartedAt }),
        data: expect.objectContaining({ cursor: 0, passStartedAt: null }),
      }),
    )
    // ⚠ lastCompletedAt 只在剪枝真的做完之后写，而且是最后一步——它是
    // freshness 唯一读的字段。
    expect(mockStateUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastCompletedAt: expect.any(Date) }),
      }),
    )
  })

  it('restarts the pass instead of pruning when passStartedAt is missing mid-pass', async () => {
    // {cursor > 0, passStartedAt: null} 是状态损坏。旧实现会拿 new Date() 当
    // 整轮边界，本轮一走到 exhausted 就把除本次 upsert 外的整张表删掉。
    mockStateUpsert.mockResolvedValue({ cursor: 45_000, passStartedAt: null })
    mockFetchSearch.mockResolvedValue(
      searchPayload(
        Array.from({ length: CIVITAI_MIRROR_FETCH_BATCH }, (_, i) =>
          hitFixture({ id: i }),
        ),
      ),
    )

    const result = await syncCivitaiMirrorChunk({ maxBatches: 1 })

    // 从 0 重开一轮，而不是从 45,000 接着跑到尽头然后剪枝。
    // 开轮写也走 CAS：条件是「状态还是我读到的那个样子」。
    expect(mockStateUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cursor: 0,
          passStartedAt: expect.any(Date),
        }),
      }),
    )
    expect(result.cursor).toBe(CIVITAI_MIRROR_FETCH_BATCH)
    expect(result.completed).toBe(false)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('aborts the prune when too much of the table looks stale', async () => {
    // 上游只给回一小撮（降级/索引改名/公钥轮换），整轮会显得「几乎全没扫到」。
    // 这时删下去就是把兜底层削空，且削空是静默的。
    const passStartedAt = new Date('2026-08-19T00:00:00.000Z')
    mockStateUpsert.mockResolvedValue({ cursor: 500, passStartedAt })
    mockFetchSearch.mockResolvedValue(searchPayload([hitFixture()]))
    mockCounts.mockResolvedValue([
      { stale: BigInt(9_800), total: BigInt(10_000) },
    ])

    const result = await syncCivitaiMirrorChunk({ maxBatches: 3 })

    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(result.pruned).toBe(0)
    // 闸门跳闸时的补记走 annotateCompletedPass（updateMany + 「还没人开新轮」）
    expect(mockStateUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cursor: 0, passStartedAt: null }),
        data: expect.objectContaining({
          lastError: expect.stringContaining('Prune aborted'),
        }),
      }),
    )
    // ⚠ 关键：闸门挡下删除时**绝不能**写 lastCompletedAt——那是 freshness 唯一
    // 读的字段，写了就等于一边不删一边告诉界面「刚刚完整刷新过」。
    for (const call of mockStateUpdateMany.mock.calls) {
      expect(
        (call[0] as { data?: Record<string, unknown> }).data,
      ).not.toHaveProperty('lastCompletedAt')
    }
  })

  it('reports the last persisted cursor when a mid-pass write loses the race', async () => {
    // CAS 输掉时不能把本地推进过的 cursor 当结果报出去——那是个从没落过库的
    // 游标，调用方会以为进度存下了（而且 HTTP 还是 200 success）。
    mockStateUpsert.mockResolvedValue({
      cursor: 500,
      passStartedAt: new Date(),
    })
    mockFetchSearch.mockResolvedValue(
      searchPayload(
        Array.from({ length: CIVITAI_MIRROR_FETCH_BATCH }, (_, i) =>
          hitFixture({ id: i }),
        ),
      ),
    )
    mockStateUpdateMany.mockResolvedValue({ count: 0 })

    const result = await syncCivitaiMirrorChunk({ maxBatches: 1 })

    expect(result.cursor).toBe(500)
    expect(result.notice).toMatch(/Progress discarded/)
  })

  it('skips the prune when a concurrent run already advanced the cursor', async () => {
    // CAS 没认领到 = 本次算出的 passStartedAt 不再代表这一轮的真实边界。
    const passStartedAt = new Date('2026-08-19T00:00:00.000Z')
    mockStateUpsert.mockResolvedValue({ cursor: 500, passStartedAt })
    mockFetchSearch.mockResolvedValue(searchPayload([hitFixture()]))
    mockStateUpdateMany.mockResolvedValue({ count: 0 })

    const result = await syncCivitaiMirrorChunk({ maxBatches: 3 })

    expect(mockDeleteMany).not.toHaveBeenCalled()
    expect(result.pruned).toBe(0)
  })

  it('throws instead of treating an unreadable 200 as an empty catalog', async () => {
    // 形状不对（公钥轮换后的错误体 / index uid 被 bump / filter 改名）此前会被
    // Zod 的 .default([]) 翻译成零命中，然后直接触发整轮剪枝。
    mockStateUpsert.mockResolvedValue({
      cursor: 500,
      passStartedAt: new Date(),
    })
    mockFetchSearch.mockResolvedValue({ error: 'invalid api key' })

    await expect(syncCivitaiMirrorChunk({ maxBatches: 1 })).rejects.toThrow()

    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('throws when a result set arrives without a hits array', async () => {
    // 这条是上一条的另一半，别合并：`results: [{}]` 有结果集但缺 hits，
    // `hits: z.array(...).default([])` 会把它变成零命中 → 触发整轮剪枝，而
    // 「results 整个缺失」那条路径靠的是别的守卫。两种形状都要拦。
    mockStateUpsert.mockResolvedValue({
      cursor: 500,
      passStartedAt: new Date(),
    })
    mockFetchSearch.mockResolvedValue({ results: [{}] })

    await expect(syncCivitaiMirrorChunk({ maxBatches: 1 })).rejects.toThrow()

    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('keeps the progress it made when a batch throws', async () => {
    // 断点续跑：失败不该让已经扫过的白扫一遍。
    mockStateUpsert.mockResolvedValue({ cursor: 0, passStartedAt: null })
    mockFetchSearch
      .mockResolvedValueOnce(
        searchPayload(
          Array.from({ length: CIVITAI_MIRROR_FETCH_BATCH }, (_, i) =>
            hitFixture({ id: i }),
          ),
        ),
      )
      .mockRejectedValueOnce(new Error('upstream down'))

    await expect(syncCivitaiMirrorChunk({ maxBatches: 4 })).rejects.toThrow(
      /upstream down/,
    )

    expect(mockStateUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cursor: 0 }),
        data: expect.objectContaining({
          cursor: CIVITAI_MIRROR_FETCH_BATCH,
          lastError: 'upstream down',
        }),
      }),
    )
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })
})
