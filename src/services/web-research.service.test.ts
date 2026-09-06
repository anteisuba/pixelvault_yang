import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { WEB_IMAGE_SEARCH } from '@/constants/web-search'
import {
  gatherWebContext,
  hasWebContext,
  isWebImageSearchConfigured,
  isWebSearchConfigured,
  extractFocusedExcerpt,
  readUrl,
  webImageSearch,
  webImageSearchMulti,
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

  it('把 Serper 的字段映成候选：原图 / 缩略图 / 页面 / 域名 / 发布者 / 尺寸', async () => {
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
      // ⚠ 站名与域名**各归各位**（切片 3b）：早先两者塞进同一个 `domain`，
      //    候选卡上那行小字于是时而域名时而站名，而它们答的是两个问题。
      publisher: 'Example',
      title: 'PVC figure studio shot',
      width: 1600,
      height: 1200,
    })
  })

  it('`domain` 缺席时从页面地址现算，⛔ 不再拿站名顶替', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(
      jsonResponse({
        images: [
          {
            imageUrl: 'https://cdn.example.com/a.jpg',
            source: 'Example',
            link: 'https://blog.example.com/post/a',
          },
        ],
      }),
    )

    const [hit] = await webImageSearch('pvc figure')
    // 拿站名当域名的下场：下游那张来源判定表一条都匹配不上，全落进「未知」。
    expect(hit.domain).toBe('blog.example.com')
    expect(hit.publisher).toBe('Example')
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

describe('webImageSearchMulti（多语言变体归并，2026-09-06）', () => {
  it('每条变体各打一次，⛔ 不合并成一次请求', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(jsonResponse({ images: [] }))

    await webImageSearchMulti(
      ['ananta shiye', 'ananta shiye 官方 立绘 设定图'],
      { num: 4 },
    )

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const bodies = mockFetch.mock.calls.map(
      (call) => JSON.parse((call[1] as RequestInit).body as string).q,
    )
    expect(bodies).toEqual(['ananta shiye', 'ananta shiye 官方 立绘 设定图'])
  })

  it('⭐ 归并是**轮转**的：每条变体的第一张先来，⛔ 不是一条接一条', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          images: [
            { imageUrl: 'https://a.test/1.jpg' },
            { imageUrl: 'https://a.test/2.jpg' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          images: [
            { imageUrl: 'https://b.test/1.jpg' },
            { imageUrl: 'https://b.test/2.jpg' },
          ],
        }),
      )

    const merged = await webImageSearchMulti(['en query', 'zh query'])
    expect(merged.map((image) => image.imageUrl)).toEqual([
      'https://a.test/1.jpg',
      'https://b.test/1.jpg',
      'https://a.test/2.jpg',
      'https://b.test/2.jpg',
    ])
  })

  it('同一张图被两条变体都搜到时只留一份', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({ images: [{ imageUrl: 'https://same.test/1.jpg' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ images: [{ imageUrl: 'https://same.test/1.jpg' }] }),
      )

    const merged = await webImageSearchMulti(['a', 'b'])
    expect(merged).toHaveLength(1)
  })

  it('只有一条查询时退回单次调用（⛔ 别白花第二个 credit）', async () => {
    vi.stubEnv('SERPER_API_KEY', 'serper-key')
    mockFetch.mockResolvedValue(jsonResponse({ images: [] }))

    await webImageSearchMulti(['only one', 'only one  '])
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('extractFocusedExcerpt（按 focus 在服务端截段，2026-09-06）', () => {
  const PAGE = [
    '# 时夜',
    '时夜是《无限大》中的可操作角色，隶属于夜巡组。',
    '## 外貌与服饰\n黑色长发束成低马尾，金色瞳孔；身着改良中式长衫，外披深灰色风衣。',
    '## 战斗数据\n武器为双刃，技能循环以突进起手，冷却 12 秒。',
    '## 声优\n由某位声优配音，首次登场于第二章。',
  ].join('\n\n')

  it('短于上限时原样返回（⛔ 不做任何加工）', () => {
    expect(extractFocusedExcerpt('  一句话  ', '外貌', 100)).toBe('一句话')
  })

  it('⭐ 命中 focus 的段落被选中，不相关的段落被丢掉', () => {
    const excerpt = extractFocusedExcerpt(PAGE, '外貌与服饰', 120)
    expect(excerpt).toContain('金色瞳孔')
    expect(excerpt).not.toContain('冷却 12 秒')
  })

  it('中文 focus 走二元组匹配 —— 「服饰」这类词命中得到', () => {
    const excerpt = extractFocusedExcerpt(PAGE, '服饰', 120)
    expect(excerpt).toContain('改良中式长衫')
  })

  it('一段都没命中时退回页首，⛔ 不返回空串', () => {
    const excerpt = extractFocusedExcerpt(PAGE, 'zzz nothing matches', 40)
    expect(excerpt.length).toBeGreaterThan(0)
    expect(excerpt.startsWith('# 时夜')).toBe(true)
  })

  it('没给 focus 时就是截页首', () => {
    const excerpt = extractFocusedExcerpt(PAGE, undefined, 30)
    expect(excerpt.startsWith('# 时夜')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(30)
  })

  it('⚠ 命中的段落按**原文顺序**拼回去，⛔ 不按得分重排', () => {
    const excerpt = extractFocusedExcerpt(PAGE, '角色 外貌', 200)
    const intro = excerpt.indexOf('可操作角色')
    const looks = excerpt.indexOf('金色瞳孔')
    expect(intro).toBeGreaterThanOrEqual(0)
    expect(looks).toBeGreaterThan(intro)
  })

  it('永远不超过上限', () => {
    expect(extractFocusedExcerpt(PAGE, '外貌', 50).length).toBeLessThanOrEqual(
      50,
    )
  })
})
