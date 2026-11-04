import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ logger: mockLogger }))

import {
  mergeWebVideoHits,
  searchWebVideos,
  serperVideoSearch,
  wantsBilibiliVideos,
} from '@/services/web-video-search.service'
import { resetResearchBreakers } from '@/services/research/connector-runtime'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('SERPER_API_KEY', 'test-serper-key')
  vi.stubGlobal('fetch', mockFetch)
  resetResearchBreakers(['bilibili'])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

describe('serperVideoSearch — 宽容解析', () => {
  it('打 /videos，用平台那把 key（X-API-KEY），⛔ 不记查询与 key', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ videos: [] }))
    await serperVideoSearch('鸣潮 PV', { num: 8 })
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://google.serper.dev/videos')
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe(
      'test-serper-key',
    )
    expect(JSON.parse(String(init.body))).toEqual({ q: '鸣潮 PV', num: 8 })
    const logged = JSON.stringify(mockLogger.info.mock.calls)
    expect(logged).not.toContain('test-serper-key')
    expect(logged).not.toContain('鸣潮')
  })

  it('⭐ 缺格只少那一格；没有链接或标题的整条丢；每次记一行原始字段名', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        searchParameters: { q: 'x' },
        videos: [
          {
            title: 'Official PV',
            link: YT,
            channel: 'Kuro Games',
            duration: '3:29',
            imageUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            date: 'Jan 6, 2024',
            position: 1,
          },
          // 字段换了类型：只丢那一格（时长是对象、频道是数字）。
          {
            title: 'Typed oddly',
            link: 'https://vimeo.com/76979871',
            duration: { seconds: 12 },
            channel: 42,
          },
          { title: 'no link' },
          { link: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
          { title: 'bad link', link: 'javascript:alert(1)' },
          'not an object',
        ],
      }),
    )
    const videos = await serperVideoSearch('x', { num: 8 })
    expect(videos).toEqual([
      {
        url: YT,
        title: 'Official PV',
        platform: 'youtube',
        channel: 'Kuro Games',
        domain: 'youtube.com',
        date: 'Jan 6, 2024',
        durationSeconds: 209,
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      },
      {
        url: 'https://vimeo.com/76979871',
        title: 'Typed oddly',
        platform: 'vimeo',
        domain: 'vimeo.com',
      },
    ])
    const shapeLogs = mockLogger.info.mock.calls.filter(
      ([message]) => message === 'webVideoSearch.serper raw shape',
    )
    expect(shapeLogs).toHaveLength(1)
    const [, meta] = shapeLogs[0] as [
      string,
      { count: number; keys: string[]; topKeys: string[] },
    ]
    expect(meta.count).toBe(6)
    expect(meta.keys).toEqual(
      expect.arrayContaining(['channel', 'duration', 'imageUrl', 'position']),
    )
    expect(meta.topKeys).toEqual(['searchParameters', 'videos'])
  })

  it('YouTube 没给封面时按稿件号补；`source` 只是平台名时⛔ 不当频道', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        videos: [{ title: 'PV', link: YT, source: 'YouTube' }],
      }),
    )
    const [video] = await serperVideoSearch('x', { num: 8 })
    expect(video?.thumbnailUrl).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    )
    expect(video?.channel).toBeUndefined()
  })

  it('没 key / 上游挂了 / 形状不认得：返回 []，⛔ 不抛', async () => {
    vi.stubEnv('SERPER_API_KEY', '')
    expect(await serperVideoSearch('x', { num: 8 })).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()

    vi.stubEnv('SERPER_API_KEY', 'test-serper-key')
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500))
    expect(await serperVideoSearch('x', { num: 8 })).toEqual([])
    mockFetch.mockResolvedValueOnce(jsonResponse('<html>'))
    expect(await serperVideoSearch('x', { num: 8 })).toEqual([])
    mockFetch.mockRejectedValueOnce(new Error('timeout'))
    expect(await serperVideoSearch('x', { num: 8 })).toEqual([])
  })
})

describe('wantsBilibiliVideos', () => {
  it.each([
    ['鸣潮 长离 PV', '', true],
    ['wuthering waves PV', '去 B站 找找', true],
    ['bilibili dance cover', '', true],
    // 日文同样有汉字：有假名就⛔ 不当中文。
    ['鳴潮 ショートアニメ', '', false],
    ['wuthering waves PV', 'find the trailer', false],
  ])('%s / %s → %s', (query, creator, expected) => {
    expect(wantsBilibiliVideos(query, creator)).toBe(expected)
  })
})

describe('searchWebVideos — 两路归并（真 B站连接器，假网络）', () => {
  const BILIBILI_SEARCH = 'https://api.bilibili.com/x/web-interface/search/type'

  /** B站搜索接口里的一条（真接口的字段名）。 */
  const ENTRY = {
    bvid: 'BV1ji421e7nM',
    title: '《鸣潮》<em class="keyword">动画短片</em> | 今昔',
    author: '鸣潮',
    duration: '17:58',
    pic: '//i2.hdslb.com/cover.jpg',
  }

  /** 按网址分路：B站搜索 / Serper 视频 / Serper 网页（B站退路），各回各的。 */
  function route(handlers: {
    bilibili?: () => Response
    serperVideos?: () => Response
  }) {
    const calls: string[] = []
    mockFetch.mockImplementation(async (input: string) => {
      const url = String(input)
      if (url.startsWith(BILIBILI_SEARCH)) {
        calls.push('bilibili')
        return handlers.bilibili?.() ?? jsonResponse({}, 500)
      }
      if (url.endsWith('/videos')) {
        calls.push('serper-videos')
        return handlers.serperVideos?.() ?? jsonResponse({ videos: [] })
      }
      calls.push('serper-search')
      return jsonResponse({ organic: [] })
    })
    return calls
  }
  const bilibiliResults = (result: unknown[]) => () =>
    jsonResponse({ code: 0, message: '0', data: { result } })

  it('⭐ 轮转归并、按视频去重（重复那条补缺格）、封顶', async () => {
    const calls = route({
      serperVideos: () =>
        jsonResponse({
          videos: [
            // 与 B站那条是同一支（嵌入地址相同），只是没有频道与封面。
            {
              title: 'B 站 同一支',
              link: 'https://www.bilibili.com/video/BV1ji421e7nM/?spm_id_from=x',
            },
            { title: 'YT 1', link: YT, duration: '3:29' },
            { title: 'YT 2', link: 'https://youtu.be/aaaaaaaaaaa' },
          ],
        }),
      bilibili: bilibiliResults([
        ENTRY,
        // 没有 BV 号：用 arcurl（常是 http）
        {
          title: '长离 演示',
          arcurl: 'http://www.bilibili.com/video/BV1xx411c7mD',
        },
        // 没有播放页：连接器退回 text，⛔ 不当视频
        { title: '没有链接' },
      ]),
    })

    const { hits, blocked } = await searchWebVideos({
      query: '鸣潮 长离',
      limit: 3,
      serper: true,
      bilibili: true,
    })
    expect(blocked).toBe(0)
    expect(calls.sort()).toEqual(['bilibili', 'serper-videos'])
    expect(
      String(
        mockFetch.mock.calls.find(([u]) =>
          String(u).startsWith(BILIBILI_SEARCH),
        )?.[0],
      ),
    ).toContain(`keyword=${encodeURIComponent('鸣潮 长离')}`)
    expect(hits.map((hit) => [hit.sourceId, hit.video.title])).toEqual([
      // 第一轮：Serper 的「同一支」先到，B站那条被认成重复、拿来补缺格。
      ['web_search', 'B 站 同一支'],
      ['web_search', 'YT 1'],
      ['bilibili', '长离 演示'],
    ])
    const merged = hits[0]?.video
    expect(merged?.channel).toBe('鸣潮')
    expect(merged?.durationSeconds).toBe(1078)
    expect(merged?.thumbnailUrl).toBe('https://i2.hdslb.com/cover.jpg')
    // 一律 https（B站的 arcurl 常是 http）。
    expect(hits[2]?.video.url).toBe(
      'https://www.bilibili.com/video/BV1xx411c7mD',
    )
  })

  it('点名 B站时 B站排前；标题前那截来源名、高亮标签剥掉', async () => {
    route({
      serperVideos: () =>
        jsonResponse({ videos: [{ title: 'YT 1', link: YT }] }),
      bilibili: bilibiliResults([ENTRY]),
    })
    const { hits } = await searchWebVideos({
      query: 'wuthering waves',
      limit: 8,
      serper: true,
      bilibili: true,
      bilibiliFirst: true,
    })
    expect(hits.map((hit) => hit.video.title)).toEqual([
      '《鸣潮》动画短片 | 今昔',
      'YT 1',
    ])
    expect(hits[0]?.video).toMatchObject({
      platform: 'bilibili',
      url: 'https://www.bilibili.com/video/BV1ji421e7nM',
      channel: '鸣潮',
    })
  })

  it('只开一路就只打那一路', async () => {
    const serperOnly = route({
      serperVideos: () =>
        jsonResponse({ videos: [{ title: 'YT 1', link: YT }] }),
    })
    await searchWebVideos({
      query: 'x',
      limit: 8,
      serper: true,
      bilibili: false,
    })
    expect(serperOnly).toEqual(['serper-videos'])

    const bilibiliOnly = route({ bilibili: bilibiliResults([ENTRY]) })
    await searchWebVideos({
      query: '鸣潮',
      limit: 8,
      serper: false,
      bilibili: true,
    })
    expect(bilibiliOnly).toEqual(['bilibili'])
  })

  it('B站搜索被风控：退避重试一次再退到网搜；照样出 Serper 那一半', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const calls = route({
        serperVideos: () =>
          jsonResponse({ videos: [{ title: 'YT 1', link: YT }] }),
        bilibili: () => jsonResponse({}, 412),
      })
      let settled = false
      const pending = searchWebVideos({
        query: '鸣潮',
        limit: 8,
        serper: true,
        bilibili: true,
      }).finally(() => {
        settled = true
      })
      while (!settled) await vi.advanceTimersByTimeAsync(200)
      const { hits } = await pending
      expect(hits.map((hit) => hit.video.title)).toEqual(['YT 1'])
      expect(calls.filter((c) => c === 'bilibili')).toHaveLength(2)
      expect(calls).toContain('serper-search')
    } finally {
      vi.useRealTimers()
    }
  })

  it('来源名单那道闸：先滤再去重，被挡掉的数出来', async () => {
    route({
      serperVideos: () =>
        jsonResponse({
          videos: [
            { title: 'YT 1', link: YT },
            {
              title: 'B 站 同一支',
              link: 'https://www.bilibili.com/video/BV1ji421e7nM',
            },
          ],
        }),
      bilibili: bilibiliResults([ENTRY]),
    })
    const { hits, blocked } = await searchWebVideos({
      query: '鸣潮',
      limit: 8,
      serper: true,
      bilibili: true,
      allows: (url, sourceId) =>
        sourceId === 'bilibili' || !url.includes('bilibili.com'),
    })
    expect(blocked).toBe(1)
    expect(hits.map((hit) => [hit.sourceId, hit.video.title])).toEqual([
      ['web_search', 'YT 1'],
      ['bilibili', '《鸣潮》动画短片 | 今昔'],
    ])
  })
})

describe('mergeWebVideoHits', () => {
  it('同一支 YouTube 的不同写法收成一条；封顶', () => {
    const hit = (url: string, title: string) => ({
      sourceId: 'web_search' as const,
      video: {
        url,
        title,
        platform: 'youtube' as const,
      },
    })
    const merged = mergeWebVideoHits(
      [
        [hit(YT, 'a'), hit('https://youtu.be/bbbbbbbbbbb', 'b')],
        [hit('https://youtu.be/dQw4w9WgXcQ', 'a again')],
      ],
      8,
    )
    expect(merged.map((entry) => entry.video.title)).toEqual(['a', 'b'])
    expect(mergeWebVideoHits([[hit(YT, 'a')], [hit(YT, 'b')]], 0)).toEqual([])
  })
})
