import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  gatherWebContext,
  hasWebContext,
  isWebSearchConfigured,
  readUrl,
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
