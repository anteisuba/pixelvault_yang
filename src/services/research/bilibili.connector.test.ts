import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

const mockWebSearch = vi.fn()
vi.mock('@/services/web-research.service', () => ({
  webSearch: (...args: unknown[]) => mockWebSearch(...args),
}))

import { fetchBilibiliEvidence } from '@/services/research/bilibili.connector'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockWebSearch.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

/** 风控页：HTTP 412，不是 JSON 信封。实测 6 次裸调只成 3 次。 */
function riskControlResponse(): Response {
  return {
    ok: false,
    status: 412,
    json: async () => {
      throw new Error('not json')
    },
    text: async () => '<html>412</html>',
  } as unknown as Response
}

const SEARCH_OK = {
  code: 0,
  data: {
    result: [
      {
        bvid: 'BV1ji421e7nM',
        title: '《鸣潮》动画短片 | <em class="keyword">今昔</em>',
        author: '鸣潮',
        duration: '17:58',
        arcurl: 'https://www.bilibili.com/video/BV1ji421e7nM',
      },
    ],
  },
}

describe('fetchBilibiliEvidence — 搜索入口（风控路）', () => {
  it('retries once after a 412 risk-control page and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(riskControlResponse())
      .mockResolvedValueOnce(jsonResponse(SEARCH_OK))

    const result = await fetchBilibiliEvidence({ query: '鸣潮 长离' })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.via).toBeUndefined()
    expect(result.items).toHaveLength(1)
    // 高亮标记要剥掉 —— 证据里不该出现 <em class="keyword">
    expect(result.items[0]?.title).toBe('bilibili · 《鸣潮》动画短片 | 今昔')
    expect(mockWebSearch).not.toHaveBeenCalled()
  })

  it('falls back to site:bilibili.com web search and says so in the receipt', async () => {
    mockFetch.mockResolvedValue(riskControlResponse())
    mockWebSearch.mockResolvedValue([
      {
        title: '鸣潮 长离 PV',
        url: 'https://www.bilibili.com/video/BV1xx',
        snippet: '官方 PV',
      },
    ])

    const result = await fetchBilibiliEvidence({ query: '鸣潮 长离' })

    // 半数概率静默失败是不允许的 —— 退路必须走，而且必须如实标注
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockWebSearch).toHaveBeenCalledWith('鸣潮 长离', {
      includeDomains: ['bilibili.com'],
      num: 5,
    })
    expect(result.via).toBe('serper-fallback')
    expect(result.items[0]?.title).toContain('经网搜')
  })

  it('treats HTTP 200 + code!=0 as a failure, not as an empty result', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ code: -412, message: '请求被拦截' }),
    )
    mockWebSearch.mockResolvedValue([])

    const result = await fetchBilibiliEvidence({ query: '鸣潮' })

    // 两次 code!=0 之后照样走退路（退路返回空 = empty，不是假成功）
    expect(result.via).toBe('serper-fallback')
    expect(result.items).toHaveLength(0)
  })
})

describe('fetchBilibiliEvidence — 单稿件（稳定路）', () => {
  it('uses view?bvid and emits metadata only — never video content', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        code: 0,
        data: {
          bvid: 'BV1ji421e7nM',
          title: '《鸣潮》动画短片 | 今昔',
          owner: { name: '鸣潮' },
          duration: 1078,
          pubdate: 1718852400,
          pic: '//i2.hdslb.com/cover.jpg',
          desc: '官方动画短片',
        },
      }),
    )

    const result = await fetchBilibiliEvidence({
      query: '这个视频讲什么 https://www.bilibili.com/video/BV1ji421e7nM',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain(
      'view?bvid=BV1ji421e7nM',
    )

    const text = result.items.find((item) => item.kind === 'text')
    expect(text?.excerpt).toContain('UP主：鸣潮')
    // 时长来自接口的秒数，不是「看过视频」推断的 —— 检索线不假装看过画面
    expect(text?.excerpt).toContain('17:58（1078 秒）')
    expect(text?.sourceTier).toBe('social')

    const cover = result.items.find((item) => item.kind === 'image')
    // 协议相对 URL 要补全，否则存下来的是打不开的地址
    expect(cover?.kind === 'image' && cover.imageUrl).toBe(
      'https://i2.hdslb.com/cover.jpg',
    )
  })
})
