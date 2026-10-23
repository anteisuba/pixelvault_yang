import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// 绕开退避链：这里验的是「单源失败不拖垮另一源」的接线，重试本身在
// with-retry.ts 自己的测试里覆盖。
vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

const mockListCivitaiLoras = vi.fn()
vi.mock('@/services/civitai-lora-library.service', () => ({
  listCivitaiLoras: (...args: unknown[]) => mockListCivitaiLoras(...args),
}))
vi.mock('@/services/civitai-lora.service', () => ({
  // 与真实实现同一归一化语义（小写 + 去分隔符）。
  normalizeLoraNameKey: (value: string) =>
    value.toLowerCase().replace(/[\s\-_.]+/g, ''),
}))

const mockSearchHuggingFaceLoras = vi.fn()
vi.mock('@/services/huggingface-lora.service', () => ({
  searchHuggingFaceLoras: (...args: unknown[]) =>
    mockSearchHuggingFaceLoras(...args),
}))

const mockAssetFindMany = vi.fn()
vi.mock('@/lib/db', () => ({
  db: { loraAsset: { findMany: (...a: unknown[]) => mockAssetFindMany(...a) } },
}))

import { LORA_CANDIDATE_BREAKER_PREFIX } from '@/constants/lora-candidate'
import { LORA_LIBRARY_BROWSE_PAGE_SIZE } from '@/constants/lora'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { searchLoraLibraryCandidates } from '@/services/lora/lora-candidates.service'
import type { CivitaiLoraLibraryItem } from '@/types'

function civitaiItem(
  overrides: Partial<CivitaiLoraLibraryItem> = {},
): CivitaiLoraLibraryItem {
  return {
    id: 'civitai:122359:135867',
    styleCode: 'civitai-135867',
    name: 'Changli Wuthering Waves',
    source: 'imported',
    type: 'subject',
    baseModelFamily: 'Illustrious',
    provider: 'civitai',
    triggerWord: 'changli',
    loraUrl: 'https://civitai.com/api/download/models/135867',
    coverImageUrl: 'https://image.civitai.com/cover-640.jpeg',
    coverImageUrlOriginal: 'https://image.civitai.com/cover.jpeg',
    thumbImageUrl: 'https://image.civitai.com/cover-96.jpeg',
    previewImageUrls: [
      'https://image.civitai.com/p1.jpeg',
      'https://image.civitai.com/p2.jpeg',
    ],
    defaultScale: 1,
    isPublic: true,
    isOwn: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    modelId: 122359,
    modelVersionId: 135867,
    versionName: 'v1.0',
    creatorName: 'someauthor',
    creatorAvatarUrl: null,
    modelPageUrl: 'https://civitai.com/models/122359?modelVersionId=135867',
    tags: ['character'],
    downloadCount: 4200,
    thumbsUpCount: 300,
    allowCommercialUse: ['Image', 'Rent'],
    allowDerivatives: true,
    allowNoCredit: false,
    triggerAlternates: ['changli casual'],
    recommendedPrompt: 'changli, red hair',
    recommendedPromptAlternates: [],
    triggerSource: 'official',
    fileHashAutoV3: 'abcdef123456',
    fileSizeBytes: 57_420_828,
    ...overrides,
  }
}

const INPUT = { userId: 'user_1', query: 'changli' }

beforeEach(() => {
  vi.clearAllMocks()
  // 熔断器按名字全局缓存 —— 不复位的话，前一条「单源失败」用例的失败计数会
  // 漏进后面的用例里。
  for (const source of ['civitai', 'huggingface']) {
    getCircuitBreaker(`${LORA_CANDIDATE_BREAKER_PREFIX}:${source}`).reset()
  }
  mockAssetFindMany.mockResolvedValue([])
  mockListCivitaiLoras.mockResolvedValue({ items: [] })
  mockSearchHuggingFaceLoras.mockResolvedValue({ items: [] })
})

describe('searchLoraLibraryCandidates — 照库页的条件搜（lora-assistant §13.1）', () => {
  it('参数与库页逐字相同：词 · 同族底模 · 库页筛选 · 每页 24；只搜 Civitai', async () => {
    mockListCivitaiLoras.mockResolvedValue({ items: [civitaiItem()] })
    const filters = {
      sort: 'Most Downloaded',
      nsfwFilter: 'unrestricted',
      contentType: 'all',
    } as const

    const result = await searchLoraLibraryCandidates({
      ...INPUT,
      baseModelFamily: 'illustrious',
      filters,
    })

    expect(mockListCivitaiLoras).toHaveBeenCalledTimes(1)
    // 排序跟库页一样：一搜词就是「Highest Rated」，网址上的排序不作数。
    expect(mockListCivitaiLoras).toHaveBeenCalledWith({
      search: 'changli',
      pageSize: LORA_LIBRARY_BROWSE_PAGE_SIZE,
      baseModel: 'Illustrious',
      ...filters,
      sort: 'Highest Rated',
    })
    expect(mockSearchHuggingFaceLoras).not.toHaveBeenCalled()
    expect(result.baseModel).toBe('Illustrious')
    expect(result.sources.map((source) => source.source)).toEqual(['civitai'])
    expect(result.candidates[0]?.candidateId).toBe('civitai:122359:135867')
  })

  it('家族映射不到库页筛选值时不限底模，返回 null', async () => {
    mockListCivitaiLoras.mockResolvedValue({ items: [] })
    const result = await searchLoraLibraryCandidates(INPUT)
    expect(mockListCivitaiLoras).toHaveBeenCalledWith({
      search: 'changli',
      pageSize: LORA_LIBRARY_BROWSE_PAGE_SIZE,
      sort: 'Highest Rated',
    })
    expect(result.baseModel).toBeNull()
  })
})
