import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import { resetResearchBreakers } from '@/services/research/connector-runtime'
import { RESEARCH_SOURCE_IDS } from '@/constants/research'
import {
  fetchDanbooruEvidence,
  resetDanbooruCatalogCache,
} from '@/services/research/danbooru.connector'

const mockFetch = vi.fn()

beforeEach(() => {
  resetResearchBreakers([RESEARCH_SOURCE_IDS.danbooru])
  resetDanbooruCatalogCache()
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

/**
 * **给了作品名 = 「query 是这部作品里的角色」**（2026-09-07）。
 *
 * 🔬 两条真机：查作品名「无限大」拿回 game tag `ananta` 的全作品统计；查
 * 「Tokiya」拿回《歌之王子殿下》的 `ichinose_tokiya`。两条都长得像答案。
 */
describe('fetchDanbooruEvidence · 角色级判据', () => {
  it('⭐ 解析出来的不是角色 tag（game tag）→ 不出证据，回执说得出为什么', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('other_names_match')) {
        return jsonResponse([{ title: 'ananta' }])
      }
      // tags.json?search[name]=ananta —— category 3 = 版权/作品
      if (url.includes('search%5Bname%5D=')) {
        return jsonResponse([{ name: 'ananta', category: 3 }])
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await fetchDanbooruEvidence({
      query: '时夜',
      work: '无限大',
    })

    expect(result.items).toEqual([])
    // ⛔ 「没料」与「查到的是作品不是人」下一步该做的事不同。
    expect(result.unrelated).toContain('not a character tag')
  })

  it('⭐ 角色 tag 与作品 tag 从不共现 → 是别部作品的同名角色，判掉', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('=Tokiya')) {
        return jsonResponse([{ title: 'ichinose_tokiya' }])
      }
      if (url.includes('other_names_match'))
        return jsonResponse([{ title: 'ananta' }])
      if (url.includes('search%5Bname%5D=')) {
        return jsonResponse([{ name: 'ichinose_tokiya', category: 4 }])
      }
      // 共现查询：一张都没有
      if (url.includes('posts.json')) return jsonResponse([])
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await fetchDanbooruEvidence({
      query: 'Tokiya',
      work: '无限大',
    })

    expect(result.items).toEqual([])
    expect(result.unrelated).toContain('never appears together')
  })

  it('⭐ 完全没有角色 tag 时，回执点名「只有作品 tag」', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('=%E6%97%B6%E5%A4%9C')) {
        return jsonResponse([])
      }
      if (url.includes('other_names_match')) {
        return jsonResponse([{ title: 'ananta' }])
      }
      if (url.includes('tags.json')) return jsonResponse([])
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await fetchDanbooruEvidence({
      query: '时夜',
      work: '无限大',
    })

    expect(result.items).toEqual([])
    expect(result.unrelated).toContain('no character tag')
    expect(result.unrelated).toContain('ananta')
  })
})

describe('catalog used by the tag workbench', () => {
  it('returns ambiguous aliases as candidates and excludes the wrong category', async () => {
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/wiki_pages.json')
        return jsonResponse([{ title: 'denia' }, { title: 'other' }])
      if (url.searchParams.get('search[name]') === 'denia')
        return jsonResponse([{ name: 'denia', category: 4, post_count: 20 }])
      if (url.searchParams.get('search[name]') === 'other')
        return jsonResponse([{ name: 'other', category: 1, post_count: 100 }])
      return jsonResponse([
        { name: 'denia', category: 4, post_count: 20 },
        { name: 'denia_alternate', category: 4, post_count: 10 },
      ])
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({
      query: '达妮娅',
      kind: 'character',
    })
    expect(result.candidates.map((tag) => tag.name)).toEqual([
      'denia',
      'denia_alternate',
    ])
    expect(result.detail).toBeNull()
  })
  it('counts only general-rated posts and allows preview images only from Danbooru', async () => {
    routeFetch([
      {
        match: '/tags.json',
        body: [{ name: 'denia', category: 4, post_count: 3 }],
      },
      { match: '/wiki_pages.json', body: [{ other_names: ['达妮娅'] }] },
      {
        match: '/posts.json',
        body: [
          {
            ...post(1, 'g', 'pink_hair pink_hair long_hair'),
            preview_file_url: 'https://cdn.donmai.us/1.jpg',
          },
          {
            ...post(2, 'g', 'long_hair'),
            preview_file_url: 'https://untrusted.example/image',
          },
          {
            ...post(3, 'e', 'pink_hair'),
            preview_file_url: 'https://cdn.donmai.us/3.jpg',
          },
        ],
      },
    ])
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({
      query: 'denia',
      kind: 'character',
      tag: 'denia',
    })
    expect(result.detail?.sampleSize).toBe(2)
    expect(result.detail?.count).toBe(3)
    expect(result.detail?.traits).toEqual([
      { tag: 'long_hair', count: 2 },
      { tag: 'pink_hair', count: 1 },
    ])
    expect(result.detail?.images).toEqual([
      {
        id: 1,
        url: 'https://cdn.donmai.us/1.jpg',
        large: 'https://cdn.donmai.us/1.jpg',
      },
    ])
    expect(
      mockFetch.mock.calls.some(
        ([url]) => new URL(url).searchParams.get('tags') === 'denia rating:g',
      ),
    ).toBe(true)
  })
  it('gives each candidate an all-ages sample and the work it comes from', async () => {
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/wiki_pages.json') return jsonResponse([])
      if (url.pathname === '/tags.json')
        return jsonResponse([
          { name: 'hatsune_miku', category: 4, post_count: 150000 },
          { name: 'snow_miku', category: 4, post_count: 5000 },
        ])
      if (url.searchParams.get('tags') === 'hatsune_miku rating:g')
        return jsonResponse([
          {
            id: 1,
            rating: 'g',
            tag_string_general: 'twintails',
            tag_string_copyright: 'vocaloid',
            preview_file_url: 'https://cdn.donmai.us/p1.jpg',
          },
        ])
      throw new Error('rate limited')
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({
      query: 'miku',
      kind: 'character',
    })
    expect(result.candidates).toEqual([
      {
        name: 'hatsune_miku',
        count: 150000,
        category: 4,
        work: 'vocaloid',
        previews: ['https://cdn.donmai.us/p1.jpg'],
      },
      // 这一行的样图没拿到：只是没图，⛔ 不让整张列表失败。
      {
        name: 'snow_miku',
        count: 5000,
        category: 4,
        work: null,
        previews: [],
      },
    ])
    expect(result.crossHint).toBeNull()
  })

  it("infers a character row's work from the detail's sample, not the first post", async () => {
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/wiki_pages.json') return jsonResponse([])
      if (url.pathname === '/tags.json')
        return jsonResponse([
          { name: 'hatsune_miku', category: 4, post_count: 150000 },
        ])
      if (url.searchParams.get('tags') === 'hatsune_miku rating:g') {
        // 与详情同一份样图（同一个缓存键）。
        expect(url.searchParams.get('limit')).toBe('20')
        return jsonResponse([
          // 最新那一张恰好是跨作品的同人图 —— 只看它会写成 pokemon。
          {
            id: 1,
            rating: 'g',
            tag_string_general: 'twintails',
            tag_string_copyright: 'pokemon vocaloid',
            preview_file_url: 'https://cdn.donmai.us/p1.jpg',
          },
          {
            id: 2,
            rating: 'g',
            tag_string_general: 'twintails',
            tag_string_copyright: 'vocaloid',
            preview_file_url: 'https://cdn.donmai.us/p2.jpg',
          },
          {
            id: 3,
            rating: 'g',
            tag_string_general: 'twintails',
            tag_string_copyright: 'vocaloid',
            preview_file_url: 'https://cdn.donmai.us/p3.jpg',
          },
        ])
      }
      throw new Error('rate limited')
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({
      query: 'miku',
      kind: 'character',
    })
    expect(result.candidates[0]).toMatchObject({
      name: 'hatsune_miku',
      work: 'vocaloid',
      // 行上只画得下一张。
      previews: ['https://cdn.donmai.us/p1.jpg'],
    })
  })

  it('points to the artist page when a character search finds only an artist', async () => {
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/wiki_pages.json') return jsonResponse([])
      if (url.searchParams.get('search[category]') === '1')
        return jsonResponse([
          { name: 'fukemachi', category: 1, post_count: 260 },
        ])
      return jsonResponse([])
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({
      query: 'fukemachi',
      kind: 'character',
    })
    expect(result.candidates).toEqual([])
    expect(result.crossHint).toEqual({
      kind: 'artist',
      name: 'fukemachi',
      count: 260,
    })
  })

  it('draws random top artists that have all-ages samples, never placeholders', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const pool = [
      { name: 'banned_artist', category: 1, post_count: 90000 },
      ...Array.from({ length: 12 }, (_, i) => ({
        name: `artist_${i}`,
        category: 1,
        post_count: 5000 - i,
      })),
    ]
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/tags.json') return jsonResponse(pool)
      const tag = url.searchParams.get('tags')?.split(' ')[0] ?? ''
      // 编号为 0 的那位一张全年龄作品都没有。
      if (tag === 'artist_0') return jsonResponse([])
      return jsonResponse(
        [1, 2, 3].map((n) => ({
          id: n,
          rating: 'g',
          preview_file_url: `https://cdn.donmai.us/${tag}-${n}.jpg`,
        })),
      )
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const first = await fetchDanbooruCatalog({ kind: 'artist', random: '1' })
    expect(first.candidates.length).toBeLessThanOrEqual(8)
    expect(first.candidates.length).toBeGreaterThan(0)
    for (const artist of first.candidates) {
      expect(artist.name).not.toBe('banned_artist')
      expect(artist.name).not.toBe('artist_0')
      expect(artist.previews).toHaveLength(3)
    }
    await fetchDanbooruCatalog({ kind: 'artist', random: '1' })
    // 画师名单只问一次（服务端缓存）。
    expect(
      mockFetch.mock.calls.filter(([url]) =>
        String(url).includes('/tags.json'),
      ),
    ).toHaveLength(1)
    vi.mocked(Math.random).mockRestore()
  })

  it('draws random top characters from the character category', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const pool = Array.from({ length: 12 }, (_, i) => ({
      name: `character_${i}`,
      category: 4,
      post_count: 5000 - i,
    }))
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/tags.json') {
        expect(url.searchParams.get('search[category]')).toBe('4')
        return jsonResponse(pool)
      }
      const tag = url.searchParams.get('tags')?.split(' ')[0] ?? ''
      return jsonResponse([
        {
          id: 1,
          rating: 'g',
          preview_file_url: `https://cdn.donmai.us/${tag}.jpg`,
        },
      ])
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({
      kind: 'character',
      random: '1',
    })
    expect(result.candidates).toHaveLength(8)
    for (const character of result.candidates) {
      expect(character.name).toMatch(/^character_/)
      expect(character.previews).toHaveLength(1)
    }
    vi.mocked(Math.random).mockRestore()
  })

  it('drops composition tags from a character’s traits but keeps them for an artist', async () => {
    const posts = [
      {
        id: 1,
        rating: 'g',
        tag_string_general: '1girl solo twintails aqua_hair',
        tag_string_copyright: 'vocaloid',
      },
    ]
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/tags.json') {
        const name = url.searchParams.get('search[name]')
        return jsonResponse([
          {
            name,
            category: name === 'hatsune_miku' ? 4 : 1,
            post_count: 10,
          },
        ])
      }
      if (url.pathname === '/wiki_pages.json') return jsonResponse([])
      return jsonResponse(posts)
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const character = await fetchDanbooruCatalog({
      kind: 'character',
      tag: 'hatsune_miku',
    })
    expect(character.detail?.traits.map((trait) => trait.tag)).toEqual([
      'twintails',
      'aqua_hair',
    ])
    expect(character.detail?.work).toBe('vocaloid')
    const artist = await fetchDanbooruCatalog({
      kind: 'artist',
      tag: 'mizuiro_sora',
    })
    expect(artist.detail?.traits.map((trait) => trait.tag)).toContain('1girl')
    expect(artist.detail?.work).toBeNull()
  })

  it('counts a work’s characters and a feature’s companions, never the tag itself', async () => {
    const posts = [
      {
        id: 1,
        rating: 'g',
        tag_string_general: '1girl solo maid apron frills',
        tag_string_copyright: 'genshin_impact',
        tag_string_character: 'lumine_(genshin_impact) paimon_(genshin_impact)',
      },
      {
        id: 2,
        rating: 'g',
        tag_string_general: 'maid apron',
        tag_string_copyright: 'genshin_impact',
        tag_string_character: 'paimon_(genshin_impact)',
      },
    ]
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/tags.json') {
        const name = url.searchParams.get('search[name]')
        return jsonResponse([
          { name, category: name === 'maid' ? 0 : 3, post_count: 10 },
        ])
      }
      if (url.pathname === '/wiki_pages.json') return jsonResponse([])
      return jsonResponse(posts)
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const work = await fetchDanbooruCatalog({
      kind: 'copyright',
      tag: 'genshin_impact',
    })
    expect(work.detail?.traits).toEqual([
      { tag: 'paimon_(genshin_impact)', count: 2 },
      { tag: 'lumine_(genshin_impact)', count: 1 },
    ])
    expect(work.detail?.work).toBeNull()
    const feature = await fetchDanbooruCatalog({ kind: 'general', tag: 'maid' })
    expect(feature.detail?.traits).toEqual([
      { tag: 'apron', count: 2 },
      { tag: 'frills', count: 1 },
    ])
  })

  it('draws random features from the all-ages list, not the top general tags', async () => {
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/tags.json') {
        expect(url.searchParams.get('search[order]')).toBeNull()
        const names = url.searchParams.get('search[name_comma]')?.split(',')
        expect(names).toContain('twintails')
        return jsonResponse(
          (names ?? []).map((name) => ({ name, category: 0, post_count: 9 })),
        )
      }
      return jsonResponse([
        { id: 1, rating: 'g', preview_file_url: 'https://cdn.donmai.us/x.jpg' },
      ])
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({ kind: 'general', random: '1' })
    expect(result.candidates).toHaveLength(8)
  })

  it('points to the work page when a character search finds only a work', async () => {
    mockFetch.mockImplementation(async (raw: string) => {
      const url = new URL(raw)
      if (url.pathname === '/wiki_pages.json') return jsonResponse([])
      if (url.searchParams.get('search[category]') === '3')
        return jsonResponse([
          { name: 'genshin_impact', category: 3, post_count: 90000 },
        ])
      return jsonResponse([])
    })
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    const result = await fetchDanbooruCatalog({
      query: 'genshin',
      kind: 'character',
    })
    expect(result.crossHint).toEqual({
      kind: 'copyright',
      name: 'genshin_impact',
      count: 90000,
    })
  })

  it('propagates network failures instead of returning a misleading empty search', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    const { fetchDanbooruCatalog } = await import('./danbooru.connector')
    await expect(
      fetchDanbooruCatalog({ query: 'denia', kind: 'character' }),
    ).rejects.toThrow('offline')
  })
})
