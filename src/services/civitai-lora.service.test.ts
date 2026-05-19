import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
                publishedAt: '2023-08-07T14:55:02.627Z',
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
    expect(requestUrl.searchParams.get('baseModels')).toBe('SDXL 1.0')
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
    })
    expect(result.total).toBe(1)
    expect(result.hasNextPage).toBe(true)
    expect(result.nextCursor).toBe('cursor-3')
  })

  it('keeps page pagination for non-search library requests', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [],
        metadata: {},
      }),
    )

    const result = await listCivitaiLoras({ page: 3 })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('page')).toBe('3')
    expect(requestUrl.searchParams.get('query')).toBeNull()
    expect(requestUrl.searchParams.get('cursor')).toBeNull()
    expect(result.nextCursor).toBeNull()
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

    const assertion = expect(listCivitaiLoras()).rejects.toThrow(/timed out/)

    await vi.advanceTimersByTimeAsync(8000)
    await assertion
  })
})
