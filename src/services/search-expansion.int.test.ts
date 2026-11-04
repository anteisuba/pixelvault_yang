/**
 * L2a 真库：搜索词扩展（search-expansion.service）。中日文词库走真库（DanbooruTagName），
 * 语义检索只假外部的索引服务（fetch）。核返回的英文写法与发给索引的请求。
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import {
  clearSearchExpansionCache,
  expandSearchQuery,
  expandSearchWords,
} from '@/services/search-expansion.service'
import { resetDatabase } from '@/test/int/db'

const INDEX = 'https://semantic-index.test'
const index = vi.hoisted(() => ({
  status: 200,
  byText: {} as Record<string, string[]>,
  queries: [] as Array<Record<string, unknown>>,
}))

beforeAll(() => {
  vi.stubEnv('SEMANTIC_INDEX_URL', INDEX)
  vi.stubEnv('SEMANTIC_INDEX_TOKEN', 'test-index-token')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

beforeEach(async () => {
  await resetDatabase()
  clearSearchExpansionCache()
  index.status = 200
  index.byText = {}
  index.queries = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if (url.origin !== INDEX) return new Response('nope', { status: 404 })
      const body = JSON.parse(String(init?.body)) as { text: string }
      index.queries.push({
        ...body,
        auth: new Headers(init?.headers).get('Authorization'),
      })
      if (index.status !== 200) return new Response('down', { status: 500 })
      return Response.json({
        matches: (index.byText[body.text] ?? []).map((key) => ({
          key,
          score: 0.9,
          meta: { category: 0, count: 1 },
        })),
      })
    }),
  )
})

function seedName(tag: string, searchText: string, count = 100) {
  return db.danbooruTagName.create({
    data: { tag, category: 0, count, searchText },
  })
}

describe('expandSearchWords（真库词库 + 假索引）', () => {
  it('词库在前、按意思在后；下划线换空格、去重、不含原词', async () => {
    await seedName('rain', '下雨\n雨', 500)
    await seedName('after_rain', '雨后\n下雨后', 100)
    index.byText['下雨'] = ['rain', 'raincloud']

    expect(await expandSearchWords('下雨')).toEqual([
      'rain',
      'after rain',
      'raincloud',
    ])
    expect(index.queries[0]).toMatchObject({
      text: '下雨',
      kind: 'danbooru-tag',
      auth: 'Bearer test-index-token',
    })

    index.byText.rain = ['rain', 'heavy_rain']
    expect(await expandSearchWords('rain')).toEqual(['heavy rain'])
  })

  it('翻过的词记住：前后空格不同也不再问', async () => {
    index.byText['猫耳'] = ['cat_ears']
    await expandSearchWords('猫耳')
    expect(await expandSearchWords(' 猫耳 ')).toEqual(['cat ears'])
    expect(index.queries).toHaveLength(1)
  })

  it('索引挂了：只用词库那一半，不抛', async () => {
    await seedName('cat_ears', '猫耳')
    index.status = 500
    expect(await expandSearchWords('猫耳')).toEqual(['cat ears'])
  })

  it('空词：什么都不问', async () => {
    expect(await expandSearchWords('  ')).toEqual([])
    expect(index.queries).toHaveLength(0)
  })
})

describe('expandSearchQuery（真库词库 + 假索引）', () => {
  it('一个词就是 expandSearchWords', async () => {
    await seedName('rain', '下雨')
    expect(await expandSearchQuery('下雨')).toEqual(['rain'])
  })

  it('多个词各翻各的再合起来，搜索词里已有的写法不要', async () => {
    index.byText['下雨'] = ['rain']
    index.byText['猫耳'] = ['cat_ears']
    index.byText.rain = ['rain']
    expect(await expandSearchQuery('下雨 猫耳, rain')).toEqual(['cat ears'])
    expect(await expandSearchQuery('下雨 猫耳')).toEqual(['rain', 'cat ears'])
  })
})
