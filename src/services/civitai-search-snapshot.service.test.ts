import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CIVITAI_SEARCH_SNAPSHOT_MAX_ENTRIES } from '@/constants/lora'
import type { CivitaiLoraLibraryResult } from '@/types'

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockUpsert = vi.fn()
const mockCount = vi.fn()
const mockFindMany = vi.fn()
const mockDeleteMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    civitaiSearchSnapshot: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  buildCivitaiSnapshotKey,
  pruneCivitaiSearchSnapshots,
  readCivitaiSearchSnapshot,
  writeCivitaiSearchSnapshot,
} from '@/services/civitai-search-snapshot.service'

const BASE_KEY_INPUT = {
  page: 1,
  pageSize: 12,
  cursor: null,
  search: 'anima',
  baseModel: 'all',
  sort: 'Highest Rated',
  nsfwFilter: 'safe',
  contentType: 'all',
}

function libraryResult(
  overrides: Partial<CivitaiLoraLibraryResult> = {},
): CivitaiLoraLibraryResult {
  return {
    items: [
      {
        id: 'civitai-1',
        styleCode: 'civitai-1',
        name: 'Anima LoRA',
        source: 'imported',
        type: 'style',
        baseModelFamily: 'Anima',
        provider: 'civitai',
        triggerWord: 'anima',
        triggerAlternates: [],
        recommendedPrompt: null,
        recommendedPromptAlternates: [],
        triggerSource: 'official',
        fileHashAutoV3: null,
        loraUrl: 'https://civitai.com/api/download/models/1',
        coverImageUrl: null,
        coverImageUrlOriginal: null,
        thumbImageUrl: null,
        previewImageUrls: [],
        defaultScale: 1,
        isPublic: true,
        isOwn: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        modelId: 1,
        modelVersionId: 1,
        versionName: 'v1',
        creatorName: 'creator',
        creatorAvatarUrl: null,
        modelPageUrl: 'https://civitai.com/models/1',
        tags: [],
        downloadCount: 1,
        thumbsUpCount: 1,
        allowCommercialUse: [],
        allowDerivatives: false,
      },
    ],
    page: 1,
    pageSize: 12,
    total: 1,
    hasNextPage: false,
    nextCursor: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildCivitaiSnapshotKey', () => {
  it('is stable for the same query', () => {
    expect(buildCivitaiSnapshotKey(BASE_KEY_INPUT)).toBe(
      buildCivitaiSnapshotKey({ ...BASE_KEY_INPUT }),
    )
  })

  it('normalises case and surrounding whitespace in the search term', () => {
    expect(
      buildCivitaiSnapshotKey({ ...BASE_KEY_INPUT, search: '  ANIMA ' }),
    ).toBe(buildCivitaiSnapshotKey(BASE_KEY_INPUT))
  })

  it.each([
    ['nsfwFilter', { nsfwFilter: 'unrestricted' }],
    ['baseModel', { baseModel: 'Illustrious' }],
    ['sort', { sort: 'Most Downloaded' }],
    ['contentType', { contentType: 'character' }],
    ['page', { page: 2 }],
    ['cursor', { cursor: 'abc' }],
  ])('separates snapshots that differ only by %s', (_label, overrides) => {
    // 串味防线：漏掉任何一个都会让 safe 档用户在降级时看到别的档的结果。
    expect(
      buildCivitaiSnapshotKey({ ...BASE_KEY_INPUT, ...overrides }),
    ).not.toBe(buildCivitaiSnapshotKey(BASE_KEY_INPUT))
  })
})

describe('writeCivitaiSearchSnapshot', () => {
  it('strips the response-only stale markers before persisting', async () => {
    await writeCivitaiSearchSnapshot(
      'k',
      libraryResult({ stale: true, fetchedAt: '2026-08-19T00:00:00.000Z' }),
    )

    const args = mockUpsert.mock.calls[0][0]
    expect(args.create.payload).not.toHaveProperty('stale')
    expect(args.create.payload).not.toHaveProperty('fetchedAt')
    expect(args.update.payload).not.toHaveProperty('stale')
  })

  it('does not spend an LRU slot on an empty result', async () => {
    await writeCivitaiSearchSnapshot('k', libraryResult({ items: [] }))

    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('fails open — a snapshot write error never breaks the search', async () => {
    mockUpsert.mockRejectedValue(new Error('db down'))

    await expect(
      writeCivitaiSearchSnapshot('k', libraryResult()),
    ).resolves.toBeUndefined()
  })
})

describe('readCivitaiSearchSnapshot', () => {
  it('returns the parsed payload and touches the LRU timestamp', async () => {
    const fetchedAt = new Date('2026-08-19T14:12:00.000Z')
    mockFindUnique.mockResolvedValue({ payload: libraryResult(), fetchedAt })
    mockUpdate.mockResolvedValue({})

    const hit = await readCivitaiSearchSnapshot('k')

    expect(hit?.fetchedAt).toEqual(fetchedAt)
    expect(hit?.payload.items).toHaveLength(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'k' } }),
    )
  })

  it('returns null when the stored shape no longer matches the schema', async () => {
    // 字段演进后的旧快照：宁可把上游的真实错误抛给调用方，也不要硬塞一份
    // 解析不了的数据给 UI。
    mockFindUnique.mockResolvedValue({
      payload: { items: 'not-an-array' },
      fetchedAt: new Date(),
    })

    await expect(readCivitaiSearchSnapshot('k')).resolves.toBeNull()
  })

  it('returns null when the database is unreachable', async () => {
    mockFindUnique.mockRejectedValue(new Error('db down'))

    await expect(readCivitaiSearchSnapshot('k')).resolves.toBeNull()
  })
})

describe('pruneCivitaiSearchSnapshots', () => {
  it('does nothing while under the cap', async () => {
    mockCount.mockResolvedValue(CIVITAI_SEARCH_SNAPSHOT_MAX_ENTRIES)

    await expect(pruneCivitaiSearchSnapshots()).resolves.toBe(0)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('evicts exactly the overflow, least-recently-used first', async () => {
    mockCount.mockResolvedValue(CIVITAI_SEARCH_SNAPSHOT_MAX_ENTRIES + 3)
    mockFindMany.mockResolvedValue([{ key: 'a' }, { key: 'b' }, { key: 'c' }])
    mockDeleteMany.mockResolvedValue({ count: 3 })

    await expect(pruneCivitaiSearchSnapshots()).resolves.toBe(3)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { lastUsedAt: 'asc' }, take: 3 }),
    )
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { key: { in: ['a', 'b', 'c'] } },
    })
  })
})
