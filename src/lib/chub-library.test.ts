import { describe, expect, it } from 'vitest'

import { CHUB_LIBRARY } from '@/constants/cards/chub-library'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import {
  chubCharacterUrl,
  chubSearchUrl,
  isChubCountryBlock,
  isChubImageUrl,
  parseChubCharacter,
  parseChubSearch,
  rankChubCards,
  realChubTopics,
} from '@/lib/chub-library'
import type { ChubCardSummary } from '@/types/chub-library'

function node(index: number, overrides: Record<string, unknown> = {}) {
  return {
    fullPath: `maker/card-${index}`,
    name: `Card ${index}`,
    tagline: 'A quiet shopkeeper',
    topics: ['ROOT', 'Female', 'Original'],
    starCount: 1200,
    nTokens: 900,
    ...overrides,
  }
}

const definition = {
  name: 'Rei',
  personality: '{{char}} runs a tea shop.',
  tavern_personality: 'calm, dry',
  scenario: 'A rainy night',
  first_message: 'Welcome.',
  example_dialogs: '',
  description: 'My favourite shopkeeper.',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: [],
  embedded_lorebook: null,
}

describe('chubSearchUrl', () => {
  it('同样的参数：带成人内容、不要 NSFL，排序换成 chub 的键', () => {
    const url = new URL(chubSearchUrl({ q: '店主', page: 2, sort: 'recent' }))

    expect(`${url.origin}${url.pathname}`).toBe(CHUB_LIBRARY.SEARCH_URL)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: '店主',
      first: String(CHUB_LIBRARY.PAGE_SIZE),
      page: '2',
      sort: 'last_activity_at',
      asc: 'false',
      nsfw: 'true',
      nsfl: 'false',
    })
  })

  it('越界的页码、太长的词回到默认', () => {
    const url = new URL(
      chubSearchUrl({
        q: 'x'.repeat(CHUB_LIBRARY.QUERY_MAX_LENGTH + 1),
        page: CHUB_LIBRARY.MAX_PAGE + 1,
        sort: 'popular',
      }),
    )

    expect(url.searchParams.get('search')).toBe('')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('sort')).toBe('download_count')
  })
})

describe('chubCharacterUrl', () => {
  it('每段单独编码', () => {
    expect(chubCharacterUrl('ma ker/卡')).toBe(
      `${CHUB_LIBRARY.CHARACTER_URL}/ma%20ker/%E5%8D%A1?full=true`,
    )
  })
})

describe('parseChubSearch', () => {
  it('节点落成卡片要的几格；去掉 ROOT；头像只认 chub 图床，不认就按路径拼', () => {
    const result = parseChubSearch(
      {
        data: {
          nodes: [
            node(1, {
              avatar_url:
                'https://avatars.charhub.io/avatars/maker/card-1/a.webp',
            }),
            node(2, { avatar_url: 'https://evil.example/x.png' }),
          ],
        },
      },
      1,
    )

    expect(result?.items[0]).toEqual({
      fullPath: 'maker/card-1',
      name: 'Card 1',
      tagline: 'A quiet shopkeeper',
      tags: ['Female', 'Original'],
      avatarUrl: 'https://avatars.charhub.io/avatars/maker/card-1/a.webp',
      starCount: 1200,
      tokenCount: 900,
    })
    expect(result?.items[1].avatarUrl).toBe(
      `${CHUB_LIBRARY.AVATAR_URL}/maker/card-2/avatar.webp`,
    )
    expect(result?.hasMore).toBe(false)
  })

  it('成人标签照留，NSFL 兜掉；坏节点跳过不拒整页；满一页才算还有下一页', () => {
    const nodes: unknown[] = Array.from(
      { length: CHUB_LIBRARY.PAGE_SIZE },
      (_, i) => node(i),
    )
    nodes[0] = node(0, { topics: ['NSFW'] })
    nodes[1] = node(1, { topics: [' nsfl '] })
    nodes[2] = { name: 'no path' }

    const result = parseChubSearch({ data: { nodes } }, 1)

    expect(result?.items).toHaveLength(CHUB_LIBRARY.PAGE_SIZE - 2)
    expect(result?.items[0].fullPath).toBe('maker/card-0')
    expect(result?.hasMore).toBe(true)
  })

  it('翻到 MAX_PAGE 就不再有下一页', () => {
    const nodes = Array.from({ length: CHUB_LIBRARY.PAGE_SIZE }, (_, i) =>
      node(i),
    )

    expect(
      parseChubSearch({ data: { nodes } }, CHUB_LIBRARY.MAX_PAGE)?.hasMore,
    ).toBe(false)
  })

  it('名字空着用路径里的卡名', () => {
    const result = parseChubSearch(
      { data: { nodes: [node(3, { name: ' ' })] } },
      1,
    )

    expect(result?.items[0].name).toBe('card-3')
  })

  it('形状不对是 null', () => {
    expect(parseChubSearch({ nope: true }, 1)).toBeNull()
    expect(parseChubSearch(null, 1)).toBeNull()
  })
})

describe('parseChubCharacter', () => {
  it('只留落格要的几格；类型不对的格当空', () => {
    const result = parseChubCharacter({
      node: {
        name: 'Rei',
        topics: ['ROOT', 'Original'],
        max_res_url: 42,
        forks: ['x'],
        definition: { ...definition, scenario: null, extra: 'drop me' },
      },
    })

    expect(result).toEqual({
      success: true,
      node: {
        name: 'Rei',
        topics: ['ROOT', 'Original'],
        max_res_url: null,
        definition: { ...definition, scenario: '' },
      },
    })
  })

  it('没有 node / 没有定义：「没这张卡」', () => {
    expect(parseChubCharacter({})).toEqual({
      success: false,
      reason: 'notFound',
    })
    expect(parseChubCharacter({ node: { name: 'Rei' } })).toEqual({
      success: false,
      reason: 'notFound',
    })
  })

  it('一格超长、整张卡超过文件导入的上限：「太大」', () => {
    const half = 'x'.repeat(TAVERN_CARD.MAX_FILE_BYTES / 2 + 1)
    expect(
      parseChubCharacter({
        node: {
          name: 'Rei',
          definition: {
            ...definition,
            system_prompt: 'x'.repeat(TAVERN_CARD.MAX_FILE_BYTES + 1),
          },
        },
      }),
    ).toEqual({ success: false, reason: 'tooLarge' })
    expect(
      parseChubCharacter({
        node: {
          name: 'Rei',
          definition: { ...definition, personality: half, scenario: half },
        },
      }),
    ).toEqual({ success: false, reason: 'tooLarge' })
  })
})

describe('isChubCountryBlock', () => {
  it('只认 403 + 「not available in your country」', () => {
    const body = 'This service is not available in your country.'
    expect(isChubCountryBlock(403, body)).toBe(true)
    expect(isChubCountryBlock(403, 'Forbidden')).toBe(false)
    expect(isChubCountryBlock(451, body)).toBe(false)
  })
})

describe('isChubImageUrl / realChubTopics', () => {
  it('图床：https 且是 charhub.io / chub.ai 本身或子域', () => {
    expect(isChubImageUrl('https://avatars.charhub.io/a.webp')).toBe(true)
    expect(isChubImageUrl('https://chub.ai/a.webp')).toBe(true)
    expect(isChubImageUrl('http://avatars.charhub.io/a.webp')).toBe(false)
    expect(isChubImageUrl('https://evilcharhub.io/a.webp')).toBe(false)
    expect(isChubImageUrl('not a url')).toBe(false)
    expect(isChubImageUrl(null)).toBe(false)
  })

  it('标签去掉树根与空串', () => {
    expect(realChubTopics(['ROOT', '', 'Original'])).toEqual(['Original'])
  })
})

describe('rankChubCards', () => {
  const card = (name: string, tags: string[] = []): ChubCardSummary => ({
    fullPath: `maker/${name}`,
    name,
    tagline: '',
    tags,
    avatarUrl: null,
    starCount: null,
    tokenCount: null,
  })

  it('名字就是它 > 名字里有 > 标签里有 > 只在正文里；同一档保持原顺序', () => {
    const ranked = rankChubCards(
      [
        card('Forced to be Free'),
        card('Wuthering crew', ['Denia']),
        card('Denia (Wuthering Waves)'),
        card('Chris'),
        card('denia'),
      ],
      ' Denia ',
    )

    expect(ranked.map((item) => item.name)).toEqual([
      'denia',
      'Denia (Wuthering Waves)',
      'Wuthering crew',
      'Forced to be Free',
      'Chris',
    ])
  })

  it('没有搜索词：原样', () => {
    const items = [card('B'), card('A')]
    expect(rankChubCards(items, '  ')).toEqual(items)
  })
})
