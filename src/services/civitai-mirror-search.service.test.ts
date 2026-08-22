import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL } from '@/constants/lora'

const mockCount = vi.fn()
const mockFindMany = vi.fn()
const mockStateFindUnique = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    civitaiLoraMirror: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    civitaiMirrorSyncState: {
      findUnique: (...args: unknown[]) => mockStateFindUnique(...args),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  readCivitaiMirrorFreshness,
  searchCivitaiMirror,
} from '@/services/civitai-mirror-search.service'

function mirrorRow(overrides: Record<string, unknown> = {}) {
  return {
    modelId: 1234,
    versionId: 4242,
    versionName: 'v2',
    name: 'Anima Turbo LoRA',
    creator: 'someone',
    baseModel: 'Illustrious',
    tags: ['concept'],
    trainedWords: ['anima'],
    hashAutoV3: 'BBBB',
    downloadCount: 900,
    thumbsUpCount: 40,
    images: [{ id: 7, url: 'uuid-7', type: 'image', nsfwLevel: 1 }],
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  }
}

function whereOf(call: unknown): Record<string, unknown> {
  return (call as { where: Record<string, unknown> }).where
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('searchCivitaiMirror', () => {
  it('returns null when the mirror has nothing for this query', async () => {
    // 调用方据此继续往下降级，而不是把「本地没有」当成「真的没有」端给用户。
    mockCount.mockResolvedValue(0)
    mockFindMany.mockResolvedValue([])

    await expect(
      searchCivitaiMirror({ search: 'nothing', maxImageNsfwLevel: 2 }),
    ).resolves.toBeNull()
  })

  it('builds a full library item from a mirror row', async () => {
    mockCount.mockResolvedValue(1)
    mockFindMany.mockResolvedValue([mirrorRow()])

    const result = await searchCivitaiMirror({
      search: 'anima',
      maxImageNsfwLevel: 2,
    })
    const item = result?.items[0]

    expect(item?.id).toBe('civitai:1234:4242')
    // 下载地址本地构造，不打上游——这正是镜像能在上游全挂时服务的前提。
    expect(item?.loraUrl).toBe('https://civitai.com/api/download/models/4242')
    expect(item?.fileHashAutoV3).toBe('BBBB')
    expect(item?.coverImageUrl).toContain('image.civitai.com')
    expect(result?.offsetPaginationSupported).toBe(true)
  })

  it('puts exact and prefix name matches first, keeping the sort inside each tier', async () => {
    // 兜底层必须和主路径排得一样——上游一挂顺序就突然变样，比慢更让人不安。
    // rows 按 downloadCount 降序进来（orderBy），分层是稳定排序，所以层内
    // 顺序原样保留。
    mockCount.mockResolvedValue(4)
    mockFindMany.mockResolvedValue([
      mirrorRow({ modelId: 1, name: 'Velvet Mythic', downloadCount: 900000 }),
      mirrorRow({ modelId: 2, name: 'Anima Turbo LoRA', downloadCount: 5000 }),
      mirrorRow({
        modelId: 3,
        name: 'Studio with anima inside',
        downloadCount: 40,
      }),
      mirrorRow({ modelId: 4, name: 'anima', downloadCount: 3 }),
    ])

    const result = await searchCivitaiMirror({
      search: 'anima',
      sort: 'Most Downloaded',
      maxImageNsfwLevel: 2,
    })

    expect(result?.items.map((item) => item.name)).toEqual([
      'anima', // 完全匹配
      'Anima Turbo LoRA', // 前缀
      'Studio with anima inside', // 包含
      'Velvet Mythic', // 名称没命中
    ])
  })

  it('applies the same safe ceiling as the upstream filter', async () => {
    mockCount.mockResolvedValue(1)
    mockFindMany.mockResolvedValue([mirrorRow()])

    await searchCivitaiMirror({ nsfwFilter: 'safe', maxImageNsfwLevel: 2 })

    const and = whereOf(mockCount.mock.calls[0][0]).AND as Record<
      string,
      unknown
    >[]
    expect(and[0]).toEqual({
      nsfwLevelMax: { lte: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL },
      nsfwNamed: false,
    })
  })

  it('inverts the ceiling for nsfwOnly so the two tiers stay a clean partition', async () => {
    mockCount.mockResolvedValue(1)
    mockFindMany.mockResolvedValue([mirrorRow()])

    await searchCivitaiMirror({ nsfwFilter: 'nsfwOnly', maxImageNsfwLevel: 16 })

    const and = whereOf(mockCount.mock.calls[0][0]).AND as Record<
      string,
      unknown
    >[]
    expect(and[0]).toEqual({
      nsfwLevelMax: { gt: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL },
    })
  })

  it('flags Highest Rated as a relevance fallback — we cannot reproduce it locally', async () => {
    mockCount.mockResolvedValue(1)
    mockFindMany.mockResolvedValue([mirrorRow()])

    const rated = await searchCivitaiMirror({
      sort: 'Highest Rated',
      maxImageNsfwLevel: 2,
    })
    expect(rated?.sortFellBackToRelevance).toBe(true)

    const downloads = await searchCivitaiMirror({
      sort: 'Most Downloaded',
      maxImageNsfwLevel: 2,
    })
    expect(downloads?.sortFellBackToRelevance).toBe(false)
  })

  it('narrows to the accepted base model family names', async () => {
    mockCount.mockResolvedValue(1)
    mockFindMany.mockResolvedValue([mirrorRow()])

    await searchCivitaiMirror({
      acceptedBaseModelNames: ['Illustrious', 'Illustrious XL'],
      maxImageNsfwLevel: 2,
    })

    const and = whereOf(mockCount.mock.calls[0][0]).AND as Record<
      string,
      unknown
    >[]
    expect(and).toContainEqual({
      baseModel: { in: ['Illustrious', 'Illustrious XL'] },
    })
  })

  it('returns null instead of throwing when the database is unreachable', async () => {
    mockCount.mockRejectedValue(new Error('db down'))
    mockFindMany.mockRejectedValue(new Error('db down'))

    await expect(
      searchCivitaiMirror({ search: 'anima', maxImageNsfwLevel: 2 }),
    ).resolves.toBeNull()
  })
})

describe('readCivitaiMirrorFreshness', () => {
  it('reports when the mirror last completed a full pass', async () => {
    const at = new Date('2026-08-19T10:00:00.000Z')
    mockStateFindUnique.mockResolvedValue({ lastCompletedAt: at })

    await expect(readCivitaiMirrorFreshness()).resolves.toEqual(at)
  })

  it('returns null when the mirror has never finished a pass', async () => {
    mockStateFindUnique.mockResolvedValue({ lastCompletedAt: null })

    await expect(readCivitaiMirrorFreshness()).resolves.toBeNull()
  })
})
