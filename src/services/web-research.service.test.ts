import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { WEB_IMAGE_SEARCH } from '@/constants/web-search'
import {
  gatherWebContext,
  hasWebContext,
  isWebImageSearchConfigured,
  isWebSearchConfigured,
  readUrl,
  webImageSearch,
  webSearch,
} from '@/services/web-research.service'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response
}

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response
}

describe('isWebSearchConfigured', () => {
  it('reflects SERPER_API_KEY presence', () => {
    vi.stubEnv('SERPER_API_KEY', '')
    expect(isWebSearchConfigured()).toBe(false)
    vi.stubEnv('SERPER_API_KEY', 'k')
    expect(isWebSearchConfigured()).toBe(true)
  })
})

describe('webSearch', () => {
  it('returns [] without a Serper key and does not call fetch', async () => {
    vi.stubEnv('SERPER_API_KEY', '')
    const results = await webSearch('convenience store romance pacing')
    expect(results).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('parses Serper organic results and forwards the query + key', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(
      jsonResponse({
        organic: [
          { title: 'A', link: 'https://a.test', snippet: 'sa' },
          { title: 'B', link: 'https://b.test', snippet: 'sb' },
          { title: 'no link' },
        ],
      }),
    )

    const results = await webSearch('q', { num: 3 })

    expect(results).toEqual([
      { title: 'A', url: 'https://a.test', snippet: 'sa' },
      { title: 'B', url: 'https://b.test', snippet: 'sb' },
    ])
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(
      'serper-key',
    )
    expect(JSON.parse(init.body as string)).toEqual({ q: 'q', num: 3 })
  })

  it('appends site: filters for includeDomains', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(jsonResponse({ organic: [] }))
    await webSearch('opinions', { includeDomains: ['bilibili.com'] })
    const init = mockFetch.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string).q).toContain('site:bilibili.com')
  })

  it('returns [] on a non-retryable error (graceful)', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(jsonResponse({}, 400))
    const results = await webSearch('q')
    expect(results).toEqual([])
  })
})

describe('readUrl', () => {
  it('reads and trims page content via Jina', async () => {
    mockFetch.mockResolvedValue(textResponse('  hello world  '))
    const page = await readUrl('https://example.com/post')
    expect(page).toEqual({
      url: 'https://example.com/post',
      content: 'hello world',
    })
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://r.jina.ai/https://example.com/post',
    )
  })

  it('rejects an unsafe (private) URL without fetching', async () => {
    const page = await readUrl('http://localhost:3000/admin')
    expect(page).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null on fetch failure', async () => {
    mockFetch.mockResolvedValue(textResponse('', 400))
    const page = await readUrl('https://example.com')
    expect(page).toBeNull()
  })
})

describe('gatherWebContext', () => {
  it('reads URLs in the message and searches the remaining text', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockImplementation(async (input: string) => {
      if (input.startsWith('https://r.jina.ai/')) {
        return textResponse('page body')
      }
      return jsonResponse({
        organic: [{ title: 'T', link: 'https://t.test', snippet: 's' }],
      })
    })

    const ctx = await gatherWebContext(
      'What do people say about https://example.com/film pacing?',
    )

    expect(ctx.pages).toEqual([
      { url: 'https://example.com/film', content: 'page body' },
    ])
    expect(ctx.results).toEqual([
      { title: 'T', url: 'https://t.test', snippet: 's' },
    ])
    expect(hasWebContext(ctx)).toBe(true)
  })

  it('skips search when the message is only a URL', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(textResponse('body'))
    const ctx = await gatherWebContext('https://example.com')
    expect(ctx.results).toEqual([])
    expect(ctx.pages).toHaveLength(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('webImageSearch (Serper /images · P3-B 预览候选)', () => {
  it('reflects SERPER_API_KEY presence — same key as /search', () => {
    vi.stubEnv('SERPER_API_KEY', '')
    expect(isWebImageSearchConfigured()).toBe(false)
    vi.stubEnv('SERPER_API_KEY', 'k')
    expect(isWebImageSearchConfigured()).toBe(true)
  })

  it('⛔ 没 key 时一次 fetch 都不发（credits 是真钱）', async () => {
    vi.stubEnv('SERPER_API_KEY', '')
    expect(await webImageSearch('pvc figure')).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('打的是 /images 而不是 /search，且带上 key 与 num', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(jsonResponse({ images: [] }))

    await webImageSearch('pvc figure studio shot', { num: 5 })

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(WEB_IMAGE_SEARCH.serperEndpoint)
    expect(url).toContain('/images')
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(
      'serper-key',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      q: 'pvc figure studio shot',
      num: 5,
    })
  })

  it('把 Serper 的字段映成候选：原图 / 缩略图 / 页面 / 域名 / 尺寸', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(
      jsonResponse({
        images: [
          {
            title: 'PVC figure studio shot',
            imageUrl: 'https://cdn.example.com/a.jpg',
            imageWidth: 1600,
            imageHeight: 1200,
            thumbnailUrl: 'https://encrypted-tbn0.gstatic.com/a.jpg',
            source: 'Example',
            domain: 'example.com',
            link: 'https://example.com/post/a',
          },
        ],
      }),
    )

    const [hit] = await webImageSearch('pvc figure')
    expect(hit).toEqual({
      imageUrl: 'https://cdn.example.com/a.jpg',
      thumbnailUrl: 'https://encrypted-tbn0.gstatic.com/a.jpg',
      pageUrl: 'https://example.com/post/a',
      domain: 'example.com',
      title: 'PVC figure studio shot',
      width: 1600,
      height: 1200,
    })
  })

  it('⛔ 没有原图直链的条目直接丢 —— 候选的全部意义就是「点它能转存」', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(
      jsonResponse({
        images: [
          { title: 'no direct link', thumbnailUrl: 'https://tbn/x.jpg' },
          { imageUrl: 'https://cdn.example.com/ok.jpg' },
        ],
      }),
    )

    const results = await webImageSearch('pvc figure')
    expect(results.map((hit) => hit.imageUrl)).toEqual([
      'https://cdn.example.com/ok.jpg',
    ])
  })

  it('num 超过档位上限时收窄，⛔ 不把额度按模型写的大数烧掉', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(jsonResponse({ images: [] }))

    await webImageSearch('pvc figure', { num: 500 })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    ) as { num: number }
    expect(body.num).toBe(WEB_IMAGE_SEARCH.maxNumResults)
  })

  it('⛔ 上游挂了不抛也不重试 —— 一次调用就是一个 credit', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(jsonResponse({ error: 'boom' }, 429))

    expect(await webImageSearch('pvc figure')).toEqual([])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
