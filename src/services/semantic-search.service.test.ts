import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { SEMANTIC_SEARCH } from '@/constants/semantic-search'
import {
  searchByMeaning,
  storeByMeaning,
} from '@/services/semantic-search.service'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  vi.stubEnv('SEMANTIC_INDEX_URL', 'https://semantic.test')
  vi.stubEnv('SEMANTIC_INDEX_TOKEN', 'secret')
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response

describe('searchByMeaning', () => {
  it('asks the public area and drops matches below the score floor', async () => {
    mockFetch.mockResolvedValue(
      ok({
        matches: [
          { key: 'cat_ears', score: 0.71, meta: { category: 0, count: 9 } },
          { key: 'school', score: SEMANTIC_SEARCH.MIN_SCORE - 0.01, meta: {} },
        ],
      }),
    )
    const found = await searchByMeaning({
      kind: 'danbooru-tag',
      text: ' 猫耳の女の子 ',
      categories: [0],
      topK: 12,
    })
    expect(found.map((match) => match.key)).toEqual(['cat_ears'])
    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toBe('https://semantic.test/query')
    expect(init.headers.Authorization).toBe('Bearer secret')
    expect(JSON.parse(init.body)).toEqual({
      namespace: 'public',
      kind: 'danbooru-tag',
      text: '猫耳の女の子',
      categories: [0],
      topK: 12,
    })
  })

  it('returns nothing instead of failing the caller when the index is down or not set up', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response)
    await expect(
      searchByMeaning({ kind: 'danbooru-tag', text: 'x', topK: 5 }),
    ).resolves.toEqual([])

    vi.stubEnv('SEMANTIC_INDEX_URL', '')
    mockFetch.mockClear()
    await expect(
      searchByMeaning({ kind: 'danbooru-tag', text: 'x', topK: 5 }),
    ).resolves.toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('storeByMeaning', () => {
  it('writes in batches and surfaces failures', async () => {
    mockFetch.mockResolvedValue(ok({ upserted: 1 }))
    const items = Array.from(
      { length: SEMANTIC_SEARCH.UPSERT_BATCH + 1 },
      (_, i) => ({
        kind: 'danbooru-tag' as const,
        key: `t${i}`,
        text: `t${i}`,
      }),
    )
    await expect(storeByMeaning(items)).resolves.toBe(items.length)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    mockFetch.mockResolvedValue({ ok: false, status: 500 } as Response)
    await expect(storeByMeaning(items.slice(0, 1))).rejects.toThrow('500')
  })
})
