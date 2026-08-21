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
vi.mock('@/services/civitai-lora.service', () => ({
  listCivitaiLoras: (...args: unknown[]) => mockListCivitaiLoras(...args),
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

import {
  LORA_CANDIDATE_BREAKER_PREFIX,
  LORA_CANDIDATE_LIMITS,
  LORA_CANDIDATE_NOT_IMPORTABLE_REASONS,
  LORA_CANDIDATE_SOURCE_STATUSES,
} from '@/constants/lora-candidate'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { searchLoraCandidates } from '@/services/lora/lora-candidates.service'
import type { CivitaiLoraLibraryItem, HuggingFaceLoraSearchItem } from '@/types'

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

function hfItem(
  overrides: Partial<HuggingFaceLoraSearchItem> = {},
): HuggingFaceLoraSearchItem {
  return {
    repoId: 'WRATHGODDESS/Shino_Style_Anima',
    name: 'Shino Style Anima',
    modelPageUrl: 'https://huggingface.co/WRATHGODDESS/Shino_Style_Anima',
    revision: '19963ef82b6f0b899800e6ce4202d58fbf89e60e',
    files: [
      {
        filename: 'ShinoAnimaV3.safetensors',
        downloadUrl:
          'https://huggingface.co/WRATHGODDESS/Shino_Style_Anima/resolve/19963ef8/ShinoAnimaV3.safetensors',
        sizeBytes: 223_000_000,
        baseModelFamily: 'illustrious',
      },
    ],
    triggerWord: 'shino style, soft ink',
    type: 'style',
    baseModelFamily: 'illustrious',
    coverImageUrl: 'https://huggingface.co/cover.png',
    tags: ['lora'],
    downloads: 1200,
    likes: 40,
    license: 'apache-2.0',
    gated: false,
    private: false,
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

describe('searchLoraCandidates — 两源归一成同一个形状', () => {
  it('两个源的候选带同一组键，「不知道」一律是 null', async () => {
    mockListCivitaiLoras.mockResolvedValue({ items: [civitaiItem()] })
    mockSearchHuggingFaceLoras.mockResolvedValue({ items: [hfItem()] })

    const { candidates } = await searchLoraCandidates(INPUT)

    expect(candidates).toHaveLength(2)
    const [civitai, hf] = candidates
    expect(Object.keys(civitai!).sort()).toEqual(Object.keys(hf!).sort())

    expect(civitai).toMatchObject({
      candidateId: 'civitai:122359:135867',
      source: 'civitai',
      author: 'someauthor',
      baseModelFamily: 'Illustrious',
      fileSizeBytes: 57_420_828,
      downloads: 4200,
      importable: true,
    })
    // ⚠ Civitai 没有许可名，只有作者勾的权限位 —— 如实分开，别压成一个字符串。
    expect(civitai!.license).toEqual({
      label: null,
      commercialUse: ['Image', 'Rent'],
      allowDerivatives: true,
      allowNoCredit: false,
      known: true,
    })
    expect(civitai!.triggerWords).toEqual(['changli', 'changli casual'])

    expect(hf).toMatchObject({
      candidateId: 'hf:WRATHGODDESS/Shino_Style_Anima#0',
      source: 'huggingface',
      // 作者只能从 repoId 前缀切 —— HF 没有独立的作者字段。
      author: 'WRATHGODDESS',
      baseModelFamily: 'illustrious',
      fileSizeBytes: 223_000_000,
      importable: true,
    })
    expect(hf!.license).toEqual({
      label: 'apache-2.0',
      commercialUse: null,
      allowDerivatives: null,
      allowNoCredit: null,
      known: true,
    })
    expect(hf!.triggerWords).toEqual(['shino style', 'soft ink'])
  })

  it('导入载荷带满快照：HF 那条必须有作者 / 许可 / revision', async () => {
    mockSearchHuggingFaceLoras.mockResolvedValue({ items: [hfItem()] })

    const { candidates } = await searchLoraCandidates(INPUT)
    const snapshot = candidates[0]?.importPayload?.sourceSnapshot

    expect(snapshot).toMatchObject({
      source: 'huggingface',
      author: 'WRATHGODDESS',
      revision: '19963ef82b6f0b899800e6ce4202d58fbf89e60e',
      pageUrl: 'https://huggingface.co/WRATHGODDESS/Shino_Style_Anima',
      fileSizeBytes: 223_000_000,
    })
    expect(snapshot?.license.label).toBe('apache-2.0')
    expect(typeof snapshot?.retrievedAt).toBe('string')
    // ⚠ 三个 civitai 标识符对 HF 行**就该是空的** —— 快照不是拿来填满它们的。
    expect(candidates[0]?.importPayload?.fileHashAutoV3).toBeNull()
    expect(candidates[0]?.importPayload?.modelVersionId).toBeUndefined()
  })

  it('许可未知时如实写 unknown，不省略（省略会被读成「没有限制」）', async () => {
    mockSearchHuggingFaceLoras.mockResolvedValue({
      items: [hfItem({ license: null })],
    })

    const { candidates } = await searchLoraCandidates(INPUT)
    expect(candidates[0]?.license).toEqual({
      label: null,
      commercialUse: null,
      allowDerivatives: null,
      allowNoCredit: null,
      known: false,
    })
  })

  it('搜索来的 Civitai 条目没有文件大小时是 null，完整度随之降档', async () => {
    mockListCivitaiLoras.mockResolvedValue({
      items: [civitaiItem({ fileSizeBytes: null })],
    })

    const { candidates } = await searchLoraCandidates(INPUT)
    expect(candidates[0]?.fileSizeBytes).toBeNull()
    expect(candidates[0]?.metadataCompleteness).toBe('partial')
  })
})

describe('searchLoraCandidates — 导入门槛（只推荐不导入）', () => {
  it('底模家族定不出来 → importable:false + 原因码，但候选照样返回', async () => {
    mockListCivitaiLoras.mockResolvedValue({
      items: [civitaiItem({ baseModelFamily: 'unknown' })],
    })
    mockSearchHuggingFaceLoras.mockResolvedValue({
      items: [
        hfItem({
          repoId: 'someone/mystery-lora',
          files: [
            {
              filename: 'mystery.safetensors',
              downloadUrl: 'https://huggingface.co/someone/mystery-lora/x',
              sizeBytes: 1000,
              baseModelFamily: 'other',
            },
          ],
        }),
      ],
    })

    const { candidates } = await searchLoraCandidates(INPUT)

    expect(candidates).toHaveLength(2)
    for (const candidate of candidates) {
      expect(candidate.importable).toBe(false)
      expect(candidate.notImportableReason).toBe(
        LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.unknownBaseModel,
      )
      expect(candidate.baseModelFamily).toBeNull()
      expect(candidate.importPayload).toBeNull()
    }
  })

  it('HF gated 仓库 → 技术不可得，原因码优先于家族判定', async () => {
    mockSearchHuggingFaceLoras.mockResolvedValue({
      items: [hfItem({ gated: true })],
    })

    const { candidates } = await searchLoraCandidates(INPUT)
    expect(candidates[0]?.importable).toBe(false)
    expect(candidates[0]?.notImportableReason).toBe(
      LORA_CANDIDATE_NOT_IMPORTABLE_REASONS.gatedRepo,
    )
  })
})

describe('searchLoraCandidates — 已挂载 / 已收藏标注', () => {
  it('挂载栈上同名的那把标 alreadyMounted（名字归一比对）', async () => {
    mockListCivitaiLoras.mockResolvedValue({ items: [civitaiItem()] })

    const { candidates } = await searchLoraCandidates({
      ...INPUT,
      mountedNames: ['changli  wuthering-waves'],
    })

    expect(candidates[0]?.alreadyMounted).toBe(true)
    expect(candidates[0]?.alreadyImported).toBe(false)
  })

  it('库里已经有的按 loraUrl / versionId 精确标 alreadyImported', async () => {
    mockListCivitaiLoras.mockResolvedValue({ items: [civitaiItem()] })
    mockAssetFindMany.mockResolvedValue([
      {
        loraUrl: 'https://example.invalid/other',
        civitaiModelVersionId: 135867,
      },
    ])

    const { candidates } = await searchLoraCandidates(INPUT)
    expect(candidates[0]?.alreadyImported).toBe(true)
    expect(candidates[0]?.alreadyMounted).toBe(false)
  })
})

describe('searchLoraCandidates — 单源失败不拖垮另一源', () => {
  it('Civitai 挂了：HF 的候选照常返回，回执如实写 failed', async () => {
    mockListCivitaiLoras.mockRejectedValue(new Error('civitai 503'))
    mockSearchHuggingFaceLoras.mockResolvedValue({ items: [hfItem()] })

    const result = await searchLoraCandidates(INPUT)

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.source).toBe('huggingface')
    const civitaiReceipt = result.sources.find((s) => s.source === 'civitai')
    expect(civitaiReceipt?.status).toBe(LORA_CANDIDATE_SOURCE_STATUSES.failed)
    expect(civitaiReceipt?.error).toContain('civitai 503')
  })

  it('两源全挂也不抛 —— 空候选 + 两条失败回执', async () => {
    mockListCivitaiLoras.mockRejectedValue(new Error('civitai down'))
    mockSearchHuggingFaceLoras.mockRejectedValue(new Error('hf down'))

    const result = await searchLoraCandidates(INPUT)
    expect(result.candidates).toEqual([])
    expect(result.sources.map((s) => s.status)).toEqual(['failed', 'failed'])
  })

  it('空结果与失败是两件事 —— 卡面要能分开说', async () => {
    const result = await searchLoraCandidates(INPUT)
    expect(result.sources.map((s) => s.status)).toEqual(['empty', 'empty'])
  })

  it('慢到超预算的源被丢掉，另一源照常返回（宁可缺一源也不整轮 504）', async () => {
    vi.useFakeTimers()
    // HF 那条路是「15s × N 次游标扫描」，自己就能吃掉整轮 maxDuration。
    mockSearchHuggingFaceLoras.mockImplementation(
      () => new Promise(() => undefined),
    )
    mockListCivitaiLoras.mockResolvedValue({ items: [civitaiItem()] })

    const pending = searchLoraCandidates(INPUT)
    await vi.advanceTimersByTimeAsync(LORA_CANDIDATE_LIMITS.sourceTimeoutMs + 1)
    const result = await pending
    vi.useRealTimers()

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.source).toBe('civitai')
    expect(result.sources.find((s) => s.source === 'huggingface')?.status).toBe(
      LORA_CANDIDATE_SOURCE_STATUSES.failed,
    )
  })
})

describe('searchLoraCandidates — 合并', () => {
  it('两源交替取并截到上限，热度高的源不会把另一源挤没', async () => {
    mockListCivitaiLoras.mockResolvedValue({
      items: Array.from({ length: 8 }, (_, i) =>
        civitaiItem({ id: `civitai:1:${i}`, name: `C${i}` }),
      ),
    })
    mockSearchHuggingFaceLoras.mockResolvedValue({
      items: Array.from({ length: 8 }, (_, i) =>
        hfItem({ repoId: `owner/H${i}`, name: `H${i}` }),
      ),
    })

    const { candidates } = await searchLoraCandidates(INPUT)

    expect(candidates).toHaveLength(6)
    expect(candidates.map((c) => c.source)).toEqual([
      'civitai',
      'huggingface',
      'civitai',
      'huggingface',
      'civitai',
      'huggingface',
    ])
  })

  it('空检索词直接短路 —— 一次外部请求都不发', async () => {
    const result = await searchLoraCandidates({ ...INPUT, query: '   ' })
    expect(result).toEqual({ candidates: [], query: '', sources: [] })
    expect(mockListCivitaiLoras).not.toHaveBeenCalled()
    expect(mockSearchHuggingFaceLoras).not.toHaveBeenCalled()
  })
})
