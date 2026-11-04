import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { fetchBilibiliEvidence } from '@/services/research/bilibili.connector'
import { runWithTimers, serperQuery, stubFetch } from '@/test/fake-fetch'

/**
 * 只假网络：B站接口与 Serper 都在 `fetch` 上替；重试、退避、退到网搜全是真代码，
 * 退避等待用假时钟拨过去。
 */
const mockFetch = vi.fn<(url: string) => Response>()
const serperResults =
  vi.fn<(q: string) => { title: string; link: string; snippet: string }[]>()
let fetchFake: ReturnType<typeof stubFetch>

function serperCalls() {
  return fetchFake.mock.calls
    .filter(([url]) => String(url).includes('serper.dev'))
    .map(([, init]) => serperQuery(init))
}
function bilibiliCalls() {
  return fetchFake.mock.calls.filter(
    ([url]) => !String(url).includes('serper.dev'),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubEnv('SERPER_API_KEY', 'serper-test-key')
  serperResults.mockReturnValue([])
  fetchFake = stubFetch((url, init) =>
    url.includes('serper.dev')
      ? Response.json({ organic: serperResults(serperQuery(init)) })
      : mockFetch(url),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
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
        // 真接口的 `arcurl` 是 av 号的写法，新稿件 15–16 位。
        arcurl: 'http://www.bilibili.com/video/av113012345678901',
      },
    ],
  },
}

describe('fetchBilibiliEvidence — 搜索入口（风控路）', () => {
  it('retries once after a 412 risk-control page and succeeds', async () => {
    mockFetch
      .mockReturnValueOnce(riskControlResponse())
      .mockReturnValueOnce(jsonResponse(SEARCH_OK))

    const result = await runWithTimers(
      fetchBilibiliEvidence({ query: '鸣潮 长离' }),
    )

    expect(bilibiliCalls()).toHaveLength(2)
    expect(result.via).toBeUndefined()
    expect(result.items).toHaveLength(1)
    // 高亮标记要剥掉 —— 证据里不该出现 <em class="keyword">
    expect(result.items[0]?.title).toBe('bilibili · 《鸣潮》动画短片 | 今昔')
    const first = result.items[0]
    expect(first?.kind === 'video' && first.channel).toBe('鸣潮')
    // ⭐ 有 BV 号就用 BV 号拼地址（av 写法嵌不了、也和 Google 那一路去不了重）。
    expect(first?.url).toBe('https://www.bilibili.com/video/BV1ji421e7nM')
    expect(first?.kind === 'video' && first.videoUrl).toBe(
      'https://www.bilibili.com/video/BV1ji421e7nM',
    )
    expect(serperCalls()).toEqual([])
  })

  it('falls back to site:bilibili.com web search and says so in the receipt', async () => {
    mockFetch.mockReturnValue(riskControlResponse())
    serperResults.mockReturnValue([
      {
        title: '鸣潮 长离 PV',
        link: 'https://www.bilibili.com/video/BV1xx',
        snippet: '官方 PV',
      },
    ])

    const result = await runWithTimers(
      fetchBilibiliEvidence({ query: '鸣潮 长离' }),
    )

    // 半数概率静默失败是不允许的 —— 退路必须走，而且必须如实标注
    expect(bilibiliCalls()).toHaveLength(2)
    expect(serperCalls()).toEqual(['鸣潮 长离 site:bilibili.com'])
    expect(result.via).toBe('serper-fallback')
    expect(result.items[0]?.title).toContain('经网搜')
  })

  it('treats HTTP 200 + code!=0 as a failure, not as an empty result', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ code: -412, message: '请求被拦截' }),
    )
    const result = await runWithTimers(fetchBilibiliEvidence({ query: '鸣潮' }))

    // 两次 code!=0 之后照样走退路（退路返回空 = empty，不是假成功）
    expect(result.via).toBe('serper-fallback')
    expect(result.items).toHaveLength(0)
  })
})

describe('fetchBilibiliEvidence — 单稿件（稳定路）', () => {
  it('uses view?bvid and emits metadata only — never video content', async () => {
    mockFetch.mockReturnValue(
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

    expect(bilibiliCalls()).toHaveLength(1)
    expect(String(bilibiliCalls()[0]?.[0])).toContain('view?bvid=BV1ji421e7nM')

    /**
     * ⚠ 56b 切片 1 起一条稿件出**一条 `video` 证据**（此前是 text + image 两条）：
     * 封面与时长进结构化字段，元数据仍旧原样在 `excerpt` 里 —— 少的只是那条与它
     * 同 URL 的重复封面条。
     */
    expect(result.items).toHaveLength(1)
    const video = result.items.find((item) => item.kind === 'video')
    expect(video?.kind).toBe('video')
    expect(video?.kind === 'video' && video.excerpt).toContain('UP主：鸣潮')
    // 搜索期第二片：UP主名另起一格，「找视频」那一排卡片的第二行读它
    expect(video?.kind === 'video' && video.channel).toBe('鸣潮')
    // 时长来自接口的秒数，不是「看过视频」推断的 —— 检索线不假装看过画面
    expect(video?.kind === 'video' && video.excerpt).toContain(
      '17:58（1078 秒）',
    )
    expect(video?.kind === 'video' && video.durationSeconds).toBe(1078)
    expect(video?.sourceTier).toBe('social')
    // 协议相对 URL 要补全，否则存下来的是打不开的地址
    expect(video?.kind === 'video' && video.thumbnailUrl).toBe(
      'https://i2.hdslb.com/cover.jpg',
    )
  })
})
