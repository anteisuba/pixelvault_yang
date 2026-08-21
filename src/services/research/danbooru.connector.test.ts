import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import { RESEARCH_SOURCE_IDS } from '@/constants/research'
import { fetchDanbooruEvidence } from '@/services/research/danbooru.connector'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
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

function routeFetch(routes: { match: string; body: unknown }[]): void {
  mockFetch.mockImplementation(async (url: string) => {
    const hit = routes.find((route) => url.includes(route.match))
    if (!hit) throw new Error(`unexpected fetch: ${url}`)
    return jsonResponse(hit.body)
  })
}

function post(id: number, rating: string, tags: string) {
  return {
    id,
    rating,
    large_file_url: `https://cdn.donmai.us/${id}.jpg`,
    tag_string_general: tags,
  }
}

describe('fetchDanbooruEvidence', () => {
  it('resolves a Chinese character name through other_names — no hand-built mapping table', async () => {
    routeFetch([
      {
        match: 'other_names_match',
        body: [
          {
            title: 'changli_(wuthering_waves)',
            other_names: ['Changli', '長離', '长离', 'チョウリ'],
            body: 'Playable character in Wuthering Waves.',
          },
        ],
      },
      {
        match: 'search%5Btitle%5D',
        body: [
          {
            title: 'changli_(wuthering_waves)',
            other_names: ['Changli', '長離', '长离', 'チョウリ'],
            body: 'Playable character in Wuthering Waves.',
          },
        ],
      },
      {
        match: '/posts.json',
        body: [
          post(1, 'g', 'pink_hair yellow_eyes long_hair'),
          post(2, 'g', 'pink_hair long_hair'),
          post(3, 's', 'pink_hair'),
        ],
      },
    ])

    const result = await fetchDanbooruEvidence({ query: '长离' })

    // 中文名反查没有走 tags.json 的模糊匹配 —— 别名字段直接命中
    expect(
      mockFetch.mock.calls.every(
        (call) => !String(call[0]).includes('name_matches'),
      ),
    ).toBe(true)

    const identity = result.items.find(
      (item) => item.kind === 'tags' && item.id.endsWith('identity'),
    )
    expect(identity).toMatchObject({
      sourceId: RESEARCH_SOURCE_IDS.danbooru,
      tags: [
        'changli_(wuthering_waves)',
        'Changli',
        '長離',
        '长离',
        'チョウリ',
      ],
    })
  })

  it('emits co-occurrence tags with their counts — strength is part of the evidence', async () => {
    routeFetch([
      {
        match: 'other_names_match',
        body: [{ title: 'changli_(wuthering_waves)' }],
      },
      { match: 'search%5Btitle%5D', body: [] },
      {
        match: '/posts.json',
        body: [
          post(1, 'g', 'pink_hair yellow_eyes'),
          post(2, 'g', 'pink_hair'),
          post(3, 'g', 'pink_hair'),
        ],
      },
    ])

    const result = await fetchDanbooruEvidence({ query: 'changli' })
    const consensus = result.items.find(
      (item) => item.kind === 'tags' && item.id.endsWith('consensus'),
    )

    // 「3/3」和「1/3」不是一回事 —— 去掉计数就是把强弱证据拍平
    expect(consensus?.kind === 'tags' && consensus.tags[0]).toBe(
      'pink_hair (3/3)',
    )
    expect(consensus?.kind === 'tags' && consensus.tags).toContain(
      'yellow_eyes (1/3)',
    )
    expect(consensus?.kind === 'tags' && consensus.provenance).toContain(
      '3 张样本',
    )
  })

  it('only offers all-ages sample images, and stores URLs without downloading', async () => {
    routeFetch([
      {
        match: 'other_names_match',
        body: [{ title: 'changli_(wuthering_waves)' }],
      },
      { match: 'search%5Btitle%5D', body: [] },
      {
        match: '/posts.json',
        body: [
          post(11, 'e', 'pink_hair'),
          post(12, 'g', 'pink_hair'),
          post(13, 'q', 'pink_hair'),
        ],
      },
    ])

    const result = await fetchDanbooruEvidence({ query: 'changli' })
    const images = result.items.filter((item) => item.kind === 'image')

    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({
      imageUrl: 'https://cdn.donmai.us/12.jpg',
      url: 'https://danbooru.donmai.us/posts/12',
    })
    // 只存 URL：没有任何一次请求去拉图片本体
    expect(
      mockFetch.mock.calls.every(
        (call) => !String(call[0]).includes('cdn.donmai.us'),
      ),
    ).toBe(true)
  })

  it('falls back to a fuzzy character-tag search for an unknown ASCII name', async () => {
    routeFetch([
      { match: 'other_names_match', body: [] },
      {
        match: 'name_matches',
        body: [
          { name: 'changli_(laurel_nymph)_(wuthering_waves)', post_count: 201 },
          { name: 'changli_(wuthering_waves)', post_count: 3651 },
        ],
      },
      { match: 'search%5Btitle%5D', body: [] },
      { match: '/posts.json', body: [] },
    ])

    const result = await fetchDanbooruEvidence({ query: 'changli' })
    const identity = result.items[0]

    // 同名多个 tag 时按图量取最主流的那个
    expect(identity?.kind === 'tags' && identity.tags[0]).toBe(
      'changli_(wuthering_waves)',
    )
  })

  it('returns nothing (rather than guessing) when no tag matches', async () => {
    routeFetch([
      { match: 'other_names_match', body: [] },
      { match: 'name_matches', body: [] },
    ])

    const result = await fetchDanbooruEvidence({ query: 'notacharacter' })
    expect(result.items).toHaveLength(0)
  })
})
