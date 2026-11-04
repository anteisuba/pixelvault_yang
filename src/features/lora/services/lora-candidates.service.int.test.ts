/**
 * L2a 真库：助手照库页的条件搜 LoRA（lora-assistant §13.1）。
 * 真 civitai-lora-library 把条件翻成索引查询；只在 fetch 边界上假索引 Worker。
 * 「已在库里」读真库的 LoraAsset。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { LORA_CANDIDATE_BREAKER_PREFIX } from '@/constants/lora-candidate'
import { LORA_LIBRARY_BROWSE_PAGE_SIZE } from '@/constants/lora'
import { searchLoraLibraryCandidates } from '@/features/lora/services/lora-candidates.service'
import { getCircuitBreaker } from '@/lib/circuit-breaker'
import { db } from '@/lib/db'
import { civitaiIndexRow, fakeCivitaiIndex } from '@/test/fake-civitai-index'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>
let index: ReturnType<typeof fakeCivitaiIndex>

beforeEach(async () => {
  // 熔断器按名字全局缓存 —— 不复位的话前一条的失败计数会漏进后面。
  for (const source of ['civitai', 'huggingface']) {
    getCircuitBreaker(`${LORA_CANDIDATE_BREAKER_PREFIX}:${source}`).reset()
  }
  await resetDatabase()
  me = await createTestUser()
  index = fakeCivitaiIndex()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('searchLoraLibraryCandidates — 照库页的条件搜', () => {
  it('参数与库页逐字相同：词 · 同族底模 · 库页筛选 · 每页 24；只搜 Civitai；收藏过的标出来', async () => {
    index.answer([
      civitaiIndexRow(),
      civitaiIndexRow({ modelId: 9, versionId: 90, name: 'Other' }),
    ])
    await db.loraAsset.create({
      data: {
        userId: me.id,
        name: 'Changli',
        styleCode: 'pv-changli',
        source: 'imported',
        triggerWord: 'changli',
        loraUrl: 'https://elsewhere.test/changli.safetensors',
        civitaiModelVersionId: 135867,
      },
    })

    const result = await searchLoraLibraryCandidates({
      userId: me.id,
      query: 'changli',
      baseModelFamily: 'illustrious',
      filters: {
        sort: 'Most Downloaded',
        nsfwFilter: 'unrestricted',
        contentType: 'all',
      },
    })

    // 只问了索引一次（⛔ Hugging Face：别的地址会直接报错）。
    expect(index.fetch).toHaveBeenCalledTimes(1)
    // 排序跟库页一样：一搜词就是「推荐」（按相关度），网址上的排序不作数。
    expect(index.requests[0]).toMatchObject({
      q: 'changli',
      baseModels: ['Illustrious', 'NoobAI'],
      nsfw: {},
      contentType: null,
      sort: 'relevance',
      page: 1,
      pageSize: LORA_LIBRARY_BROWSE_PAGE_SIZE,
    })
    expect(result.baseModel).toBe('Illustrious')
    expect(result.sources.map((source) => source.source)).toEqual(['civitai'])
    expect(
      result.candidates.map((candidate) => [
        candidate.candidateId,
        candidate.alreadyImported,
      ]),
    ).toEqual([
      ['civitai:122359:135867', true],
      ['civitai:9:90', false],
    ])
  })

  it('家族映射不到库页筛选值时不限底模，返回 null', async () => {
    const result = await searchLoraLibraryCandidates({
      userId: me.id,
      query: 'changli',
    })

    expect(index.requests[0]).toMatchObject({
      q: 'changli',
      sort: 'relevance',
      pageSize: LORA_LIBRARY_BROWSE_PAGE_SIZE,
    })
    expect(index.requests[0]).not.toHaveProperty('baseModels')
    expect(result.baseModel).toBeNull()
  })
})
