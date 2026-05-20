import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Bypass withRetry so tests assert the service's own logic without the
// 3-attempt backoff chain. Production behavior of retry-on-timeout is
// already covered by with-retry.ts's own tests.
vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import { listCivitaiLoras } from '@/services/civitai-lora.service'

const mockFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.useRealTimers()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('listCivitaiLoras', () => {
  it('normalizes public Civitai LoRA models into usable library items', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 122359,
            name: 'Detail Tweaker XL',
            type: 'LORA',
            tags: ['detail', 'style'],
            stats: { downloadCount: 10, thumbsUpCount: 4 },
            creator: {
              username: 'w4r10ck',
              image: 'https://example.com/avatar.png',
            },
            modelVersions: [
              {
                id: 135867,
                name: 'v1.0',
                baseModel: 'SDXL 1.0',
                publishedAt: null,
                createdAt: '2023-08-07T14:55:02.627Z',
                trainedWords: ['add detail'],
                stats: { downloadCount: 8, thumbsUpCount: 3 },
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl:
                      'https://civitai.com/api/download/models/135867',
                  },
                ],
                images: [
                  {
                    url: 'https://image.civitai.com/example.jpeg',
                    nsfwLevel: 1,
                  },
                ],
              },
            ],
          },
        ],
        metadata: {
          totalItems: 1,
          nextCursor: 'cursor-3',
        },
      }),
    )

    const result = await listCivitaiLoras({
      page: 2,
      cursor: 'cursor-2',
      search: 'detail',
      baseModel: 'SDXL 1.0',
      sort: 'Most Downloaded',
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('types')).toBe('LORA')
    expect(requestUrl.searchParams.get('page')).toBeNull()
    expect(requestUrl.searchParams.get('cursor')).toBe('cursor-2')
    expect(requestUrl.searchParams.get('query')).toBe('detail')
    // We don't forward baseModels to Civitai (their filter drops matching
    // LoRAs). Client-side filtering happens after fetch.
    expect(requestUrl.searchParams.get('baseModels')).toBeNull()
    expect(requestUrl.searchParams.get('sort')).toBe('Most Downloaded')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      id: 'civitai:122359:135867',
      styleCode: 'civitai-135867',
      name: 'Detail Tweaker XL',
      source: 'imported',
      baseModelFamily: 'SDXL 1.0',
      provider: 'civitai',
      triggerWord: 'add detail',
      loraUrl: 'https://civitai.com/api/download/models/135867',
      coverImageUrl: 'https://image.civitai.com/example.jpeg',
      creatorName: 'w4r10ck',
      downloadCount: 8,
      thumbsUpCount: 3,
      createdAt: '2023-08-07T14:55:02.627Z',
    })
    expect(result.total).toBe(1)
    expect(result.hasNextPage).toBe(true)
    expect(result.nextCursor).toBe('cursor-3')
  })

  it('passes cursor for non-search library pagination', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras({
      page: 3,
      cursor: 'cursor-2',
      baseModel: 'Anima',
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('page')).toBe('3')
    expect(requestUrl.searchParams.get('query')).toBeNull()
    expect(requestUrl.searchParams.get('cursor')).toBe('cursor-2')
    expect(requestUrl.searchParams.get('baseModels')).toBeNull()
    expect(result.nextCursor).toBeNull()
  })

  it('over-fetches and client-side filters by base model family bucket', async () => {
    const versionFor = (baseModel: string, id: number) => ({
      id,
      name: 'v1',
      baseModel,
      files: [
        {
          type: 'Model',
          primary: true,
          downloadUrl: `https://civitai.com/api/download/models/${id}`,
        },
      ],
      trainedWords: ['trigger'],
    })

    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 1,
            name: 'Illustrious LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Illustrious', 101)],
          },
          {
            id: 2,
            name: 'NoobAI LoRA',
            type: 'LORA',
            modelVersions: [versionFor('NoobAI', 102)],
          },
          {
            id: 3,
            name: 'SDXL LoRA',
            type: 'LORA',
            modelVersions: [versionFor('SDXL 1.0', 103)],
          },
          {
            id: 4,
            name: 'Anima LoRA',
            type: 'LORA',
            modelVersions: [versionFor('Anima', 104)],
          },
        ],
        metadata: { nextCursor: 'cursor-next' },
      }),
    )

    const result = await listCivitaiLoras({
      baseModel: 'Illustrious',
      pageSize: 10,
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    // Over-fetch: pageSize 10 × 4 = 40
    expect(requestUrl.searchParams.get('limit')).toBe('40')
    expect(requestUrl.searchParams.get('baseModels')).toBeNull()

    // Illustrious bucket admits NoobAI (shared weight structure).
    expect(result.items.map((item) => item.baseModelFamily)).toEqual([
      'Illustrious',
      'NoobAI',
    ])
    expect(result.hasNextPage).toBe(true)
  })

  it('forwards Civitai license fields to library items', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 9,
            name: 'Licensed LoRA',
            type: 'LORA',
            allowCommercialUse: ['Image', 'Rent', 'Sell'],
            allowDerivatives: true,
            modelVersions: [
              {
                id: 99,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/99',
                  },
                ],
              },
            ],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items[0]).toMatchObject({
      allowCommercialUse: ['Image', 'Rent', 'Sell'],
      allowDerivatives: true,
    })
  })

  it('parses Civitai PostgreSQL array literal allowCommercialUse strings', async () => {
    // Civitai's REAL response shape — PG array literal, not JSON array.
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 11,
            name: 'PG-literal LoRA',
            type: 'LORA',
            allowCommercialUse: '{Image,RentCivit,Rent}',
            allowDerivatives: true,
            modelVersions: [
              {
                id: 111,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/111',
                  },
                ],
              },
            ],
          },
          {
            id: 12,
            name: 'Empty PG-literal LoRA',
            type: 'LORA',
            allowCommercialUse: '{}',
            allowDerivatives: false,
            modelVersions: [
              {
                id: 112,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/112',
                  },
                ],
              },
            ],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items[0]?.allowCommercialUse).toEqual([
      'Image',
      'RentCivit',
      'Rent',
    ])
    expect(result.items[1]?.allowCommercialUse).toEqual([])
  })

  it('defaults license fields when Civitai omits them', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 10,
            name: 'No License Info',
            type: 'LORA',
            modelVersions: [
              {
                id: 100,
                name: 'v1',
                baseModel: 'Illustrious',
                trainedWords: ['trigger'],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://civitai.com/api/download/models/100',
                  },
                ],
              },
            ],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items[0]).toMatchObject({
      allowCommercialUse: [],
      allowDerivatives: false,
    })
  })

  it('skips LoRA entries without a downloadable model version', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 1,
            name: 'No file',
            type: 'LORA',
            modelVersions: [{ id: 2, name: 'v1' }],
          },
        ],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras()

    expect(result.items).toEqual([])
  })

  it('throws when Civitai returns a non-OK response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'rate limited' }, 429))

    await expect(listCivitaiLoras()).rejects.toThrow(/429/)
  })

  it('times out slow Civitai responses', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>(() => {
          // Intentionally unresolved: the service-level timeout should win.
        }),
    )

    const promise = expect(listCivitaiLoras()).rejects.toThrow(/timed out/)
    // Run all pending fake timers (8s service timeout + withRetry's backoff
    // delays between retries). Using runAllTimersAsync instead of a single
    // advanceTimersByTimeAsync(8000) so we don't have to predict the exact
    // schedule across multiple retry attempts.
    await vi.runAllTimersAsync()
    await promise
  })
})
