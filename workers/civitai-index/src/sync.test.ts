import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  searchIndex,
  warmBrowseCounts,
  SearchInputSchema,
  TOTAL_CAP,
  type SearchInput,
} from './search'
import {
  clearMeaningCache,
  embedPending,
  loraMeaningText,
  type SemanticIndexBinding,
} from './meaning'
import { recordSyncCompleted, syncPages } from './sync'
import { createTestDb } from './test/d1'
import { LIGHT_PAGE_SIZE, type Upstream } from './upstream'
import {
  buildWordSegment,
  editDistance,
  finishWordDictionary,
  WORD_SEGMENTS,
} from './words'

interface FakeModel {
  id: number
  name: string
  tags?: string[]
  nsfwLevel?: number[]
  downloadCount?: number
  thumbsUpCount?: number
  baseModel?: string
  trainedWords?: string[]
  createdAt?: string
  lastVersionAtUnix?: number
  noVersion?: boolean
  /** 默认版本之外的版本（底模 + 触发词） */
  otherVersions?: { baseModel: string; trainedWords?: string[] }[]
}

function fullHit(model: FakeModel) {
  const version = model.noVersion
    ? null
    : {
        id: model.id * 10,
        name: 'v1.0',
        baseModel: model.baseModel ?? 'Illustrious',
        trainedWords: model.trainedWords ?? [],
        hashData: [{ hash: `AV3-${model.id}`, type: 'AutoV3' }],
      }
  return {
    id: model.id,
    name: model.name,
    type: 'LORA',
    nsfwLevel: model.nsfwLevel ?? [1],
    tags: (model.tags ?? []).map((name) => ({ name })),
    metrics: {
      downloadCount: model.downloadCount ?? 0,
      thumbsUpCount: model.thumbsUpCount ?? 0,
    },
    lastVersionAtUnix: model.lastVersionAtUnix ?? 1_700_000_000_000,
    user: { username: `creator-${model.id}`, image: `avatar-${model.id}` },
    nsfw: false,
    permissions: {
      allowCommercialUse: ['Image'],
      allowDerivatives: true,
      allowNoCredit: false,
    },
    createdAt: model.createdAt ?? '2026-01-01T00:00:00.000Z',
    version,
    versions: [
      ...(model.otherVersions ?? []).map((other, index) => ({
        id: model.id * 10 + index + 1,
        name: `${other.baseModel} v1`,
        baseModel: other.baseModel,
        trainedWords: other.trainedWords ?? [],
        hashData: [{ hash: `AV3-${model.id}-${index + 1}`, type: 'AutoV3' }],
      })),
      ...(version ? [version] : []),
    ],
    images: [{ id: model.id * 100, url: `uuid-${model.id}`, nsfwLevel: 1 }],
  }
}

class FakeUpstream implements Upstream {
  fullRequests: number[][] = []
  constructor(public catalog: FakeModel[]) {}

  async lightPage(afterId: number) {
    return this.catalog
      .filter((model) => model.id > afterId)
      .sort((a, b) => a.id - b.id)
      .slice(0, LIGHT_PAGE_SIZE)
      .map((model) => {
        const { id, name, nsfwLevel, tags, metrics, lastVersionAtUnix } =
          fullHit(model)
        return { id, name, nsfwLevel, tags, metrics, lastVersionAtUnix }
      })
  }

  async fullHits(ids: readonly number[]) {
    this.fullRequests.push([...ids])
    return this.catalog
      .filter((model) => ids.includes(model.id))
      .map((model) => fullHit(model))
  }
}

async function syncAll(db: D1Database, upstream: Upstream) {
  let cursor = 0
  const totals = {
    refreshed: 0,
    metricsUpdated: 0,
    deleted: 0,
    deletesSkipped: 0,
  }
  for (let guard = 0; guard < 50; guard += 1) {
    const progress = await syncPages(db, upstream, cursor, 2, 1_000)
    totals.refreshed += progress.refreshed
    totals.metricsUpdated += progress.metricsUpdated
    totals.deleted += progress.deleted
    totals.deletesSkipped += progress.deletesSkipped
    cursor = progress.cursor
    if (progress.done) return totals
  }
  throw new Error('sync did not finish')
}

function search(db: D1Database, input: Partial<SearchInput>) {
  return searchIndex(
    db,
    SearchInputSchema.parse({ sort: 'downloads', pageSize: 50, ...input }),
  )
}

let db: D1Database
let dispose: () => Promise<void>

beforeEach(async () => {
  ;({ db, dispose } = await createTestDb())
})

afterEach(async () => {
  await dispose()
})

describe('syncPages', () => {
  it('loads a catalog larger than one upstream page and then writes nothing when nothing changed', async () => {
    const catalog = Array.from({ length: 2_300 }, (_, index) => ({
      id: index * 3 + 1,
      name: `model ${index}`,
      downloadCount: index,
    }))
    const upstream = new FakeUpstream(catalog)

    const first = await syncAll(db, upstream)
    expect(first.refreshed).toBe(2_300)
    expect(await recordSyncCompleted(db, 5)).toBe(2_300)

    upstream.fullRequests = []
    const second = await syncAll(db, upstream)
    expect(second).toEqual({
      refreshed: 0,
      metricsUpdated: 0,
      deleted: 0,
      deletesSkipped: 0,
    })
    expect(upstream.fullRequests).toEqual([])
  })

  it('updates metrics in place, re-fetches changed models, and deletes removed ones', async () => {
    const catalog: FakeModel[] = [
      { id: 1, name: 'alpha', downloadCount: 10 },
      { id: 2, name: 'beta', downloadCount: 20 },
      { id: 3, name: 'gamma', downloadCount: 30 },
      { id: 4, name: 'delta', downloadCount: 40 },
    ]
    const upstream = new FakeUpstream(catalog)
    await syncAll(db, upstream)

    upstream.catalog = [
      { id: 1, name: 'alpha', downloadCount: 99 },
      { id: 3, name: 'gamma renamed', downloadCount: 30 },
      { id: 5, name: 'epsilon', downloadCount: 1 },
    ]
    upstream.fullRequests = []
    const totals = await syncAll(db, upstream)

    expect(totals).toMatchObject({
      refreshed: 2,
      metricsUpdated: 1,
      deleted: 2,
    })
    expect(upstream.fullRequests.flat().sort()).toEqual([3, 5])
    const { rows } = await search(db, {})
    expect(
      rows.map((row) => [row.modelId, row.name, row.downloadCount]),
    ).toEqual([
      [1, 'alpha', 99],
      [3, 'gamma renamed', 30],
      [5, 'epsilon', 1],
    ])
    expect((await search(db, { q: 'renamed' })).rows).toHaveLength(1)
  })

  it("rewrites a model's exact terms on refresh and drops them with the model", async () => {
    const terms = async () =>
      (
        await db
          .prepare(
            'SELECT term, model_id FROM lora_term ORDER BY model_id, term',
          )
          .all<{ term: string; model_id: number }>()
      ).results.map((row) => `${row.model_id}:${row.term}`)
    const upstream = new FakeUpstream([
      {
        id: 1,
        name: 'Old OC',
        tags: ['Style'],
        otherVersions: [{ baseModel: 'Anima' }],
      },
      { id: 2, name: '银发', tags: [] },
    ])
    await syncAll(db, upstream)
    expect(await terms()).toEqual([
      '1:b:Anima',
      '1:t:style',
      '1:w:oc',
      '1:w:old',
      '2:w:发',
      '2:w:银',
      '2:w:银发',
    ])

    upstream.catalog = [{ id: 1, name: 'New OC', tags: ['Style'] }]
    await syncAll(db, upstream)
    expect(await terms()).toEqual(['1:t:style', '1:w:new', '1:w:oc'])
  })

  it('refuses to mass-delete a range when an upstream page comes back mostly empty', async () => {
    const catalog = Array.from({ length: 300 }, (_, index) => ({
      id: index + 1,
      name: `model ${index}`,
    }))
    const upstream = new FakeUpstream(catalog)
    await syncAll(db, upstream)

    // 中间一段整块消失：不像真删除，像上游这一页不完整。
    upstream.catalog = catalog.filter(
      (model) => model.id <= 50 || model.id > 250,
    )
    const totals = await syncAll(db, upstream)

    expect(totals.deleted).toBe(0)
    expect(totals.deletesSkipped).toBe(200)
    expect((await search(db, {})).total).toBe(300)
  })

  it('drops a model whose current version disappeared', async () => {
    const upstream = new FakeUpstream([
      { id: 1, name: 'keeps' },
      { id: 2, name: 'loses version' },
    ])
    await syncAll(db, upstream)

    upstream.catalog = [
      { id: 1, name: 'keeps' },
      { id: 2, name: 'loses version', noVersion: true, lastVersionAtUnix: 2 },
    ]
    await syncAll(db, upstream)

    expect((await search(db, {})).rows.map((row) => row.modelId)).toEqual([1])
  })

  it('stops on an unreadable upstream page instead of treating it as the end', async () => {
    await syncAll(db, new FakeUpstream([{ id: 1, name: 'one' }]))
    const broken: Upstream = {
      lightPage: async () => [{ unexpected: true }, { also: 'wrong' }],
      fullHits: async () => [],
    }

    await expect(syncPages(db, broken, 0, 1, 1)).rejects.toThrow(/unreadable/)
    expect((await search(db, {})).total).toBe(1)
  })
})

const SEARCH_FIXTURE: FakeModel[] = [
  {
    id: 1,
    name: '银发少女 Silver Hair',
    tags: ['character'],
    downloadCount: 500,
    thumbsUpCount: 5,
  },
  {
    id: 2,
    name: 'Silver',
    tags: ['style'],
    downloadCount: 10,
    thumbsUpCount: 50,
    baseModel: 'Pony',
  },
  {
    id: 3,
    name: 'Lifestyle photo',
    tags: ['lifestyle'],
    downloadCount: 300,
    trainedWords: ['silverlight'],
  },
  {
    id: 4,
    name: 'Spicy outfit',
    tags: ['clothing'],
    nsfwLevel: [1, 16],
    downloadCount: 900,
  },
  { id: 5, name: 'My OC maker', downloadCount: 50 },
  { id: 6, name: 'Rococo palace', downloadCount: 60 },
  { id: 7, name: 'Explicit study', nsfwLevel: [8, 16], downloadCount: 70 },
]

describe('searchIndex', () => {
  beforeEach(async () => {
    await syncAll(db, new FakeUpstream(SEARCH_FIXTURE))
  })

  it('finds substrings in names, trigger words and CJK names', async () => {
    const silver = await search(db, { q: 'silver' })
    expect(silver.rows.map((row) => row.modelId).sort()).toEqual([1, 2, 3])
    expect(silver.total).toBe(3)
    expect(
      (await search(db, { q: '银发少' })).rows.map((row) => row.modelId),
    ).toEqual([1])
    // 两个字的中文词不够 trigram，查整词表。
    expect(
      (await search(db, { q: '银发' })).rows.map((row) => row.modelId),
    ).toEqual([1])
  })

  it('ranks an exact name match above prefix and contains matches', async () => {
    const { rows } = await search(db, { q: 'silver', sort: 'relevance' })
    expect(rows.map((row) => row.modelId)).toEqual([2, 1, 3])
  })

  it('ranks names containing every query word above tag-only matches', async () => {
    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        {
          id: 8,
          name: 'Popular pack',
          tags: ['silver', 'hair'],
          downloadCount: 10_000,
        },
      ]),
    )
    const { rows } = await search(db, { q: 'hair silver', sort: 'relevance' })
    expect(rows.map((row) => row.modelId)).toEqual([1, 8])
  })

  // owner 2026-09-27：安全 = 至少一张 ≤ Soft，仅 NSFW = 至少一张 > Soft，两档不互斥。
  it('applies the existence-based safe and NSFW-only filters', async () => {
    const safe = await search(db, { nsfw: { someImageAtMost: 2 } })
    expect(safe.rows.map((row) => row.modelId)).toContain(4)
    expect(safe.rows.map((row) => row.modelId)).not.toContain(7)
    const nsfwOnly = await search(db, { nsfw: { someImageAbove: 2 } })
    expect(nsfwOnly.rows.map((row) => row.modelId)).toEqual([4, 7])
  })

  it('matches content-type tags exactly and short keywords as whole words', async () => {
    const style = await search(db, {
      contentType: { tags: ['style'], nameKeywords: [] },
    })
    expect(style.rows.map((row) => row.modelId)).toEqual([2])

    const character = await search(db, {
      contentType: { tags: ['character'], nameKeywords: ['oc'] },
    })
    expect(character.rows.map((row) => row.modelId).sort()).toEqual([1, 5])
  })

  it('matches long content-type keywords at the start of a name word', async () => {
    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        { id: 8, name: 'Characters pack', downloadCount: 1 },
        { id: 9, name: 'Mycharacter study', downloadCount: 1 },
      ]),
    )
    const result = await search(db, {
      contentType: { tags: [], nameKeywords: ['character'] },
    })
    expect(result.rows.map((row) => row.modelId)).toEqual([8])
  })

  it('treats underscores, punctuation and full-width letters like plain words', async () => {
    for (const q of ['silver_hair', 'Silver-Hair!', 'ｓｉｌｖｅｒ　ｈａｉｒ']) {
      expect((await search(db, { q })).rows.map((row) => row.modelId)).toEqual([
        1,
      ])
    }
  })

  it('does not require generic words, but still ranks by them', async () => {
    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        { id: 8, name: 'Silver style', downloadCount: 1 },
      ]),
    )
    const { rows } = await search(db, {
      q: 'silver style lora',
      sort: 'relevance',
    })
    // 名字里连 style 都有的排最前，其余照「名字含 silver」→「只在触发词里」。
    expect(rows.map((row) => row.modelId)).toEqual([8, 1, 2, 3])
    // 整句都是通用词：照常当条件（Lifestyle 的名字、Silver 的标签里都有 style）。
    expect(
      (await search(db, { q: 'style' })).rows.map((row) => row.modelId).sort(),
    ).toEqual([2, 3, 8])
  })

  it('matches short Latin terms as whole words', async () => {
    expect(
      (await search(db, { q: 'oc' })).rows.map((row) => row.modelId),
    ).toEqual([5])
  })

  it("finds a model by another version's base model and shows that version", async () => {
    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        {
          id: 8,
          name: 'Multi base style',
          baseModel: 'Krea 2',
          trainedWords: ['krea_tag'],
          otherVersions: [
            { baseModel: 'Anima', trainedWords: ['@anima_tag'] },
            { baseModel: 'Illustrious', trainedWords: ['il_tag'] },
          ],
        },
      ]),
    )
    const anima = await search(db, { baseModels: ['Anima'] })
    expect(anima.rows).toHaveLength(1)
    expect(anima.rows[0]).toMatchObject({
      modelId: 8,
      versionId: 81,
      baseModel: 'Anima',
      trainedWords: ['@anima_tag'],
      hashAutoV3: 'AV3-8-1',
    })

    // 不筛底模时还是默认版；别的版本的触发词也搜得到。
    const byTrigger = await search(db, { q: 'anima_tag' })
    expect(byTrigger.rows[0]).toMatchObject({
      modelId: 8,
      versionId: 80,
      baseModel: 'Krea 2',
      trainedWords: ['krea_tag'],
    })

    // 「其他」= 任一版本不属于具名家族。
    const other = await search(db, {
      excludeBaseModels: ['Illustrious', 'Pony', 'Anima'],
    })
    expect(other.rows.map((row) => row.modelId)).toEqual([8])
    expect(other.rows[0]?.baseModel).toBe('Krea 2')
  })

  it('filters by base model and pages through results with an exact total', async () => {
    expect(
      (await search(db, { baseModels: ['Pony'] })).rows.map(
        (row) => row.modelId,
      ),
    ).toEqual([2])
    expect(
      (await search(db, { excludeBaseModels: ['Illustrious'] })).rows.map(
        (row) => row.modelId,
      ),
    ).toEqual([2])

    const page2 = await search(db, { pageSize: 3, page: 2 })
    expect(page2.total).toBe(7)
    expect(page2.rows.map((row) => row.modelId)).toEqual([7, 6, 5])
  })

  it('combines a search word with base model, rating and content filters', async () => {
    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        {
          id: 8,
          name: 'Silver armor',
          tags: ['clothing'],
          nsfwLevel: [16],
          downloadCount: 800,
        },
        {
          id: 9,
          name: 'Silver dress',
          tags: ['clothing'],
          baseModel: 'Pony',
          otherVersions: [{ baseModel: 'Illustrious' }],
          downloadCount: 5,
        },
      ]),
    )
    const filters: Partial<SearchInput> = {
      q: 'silver',
      baseModels: ['Illustrious'],
      nsfw: { someImageAtMost: 2 },
      sort: 'relevance',
    }
    // 8 只有 NSFW 图、2 只有 Pony 版：筛掉。9 凭另一个版本进来，名字以词开头排第一。
    const result = await search(db, filters)
    expect(result.total).toBe(3)
    expect(result.rows.map((row) => row.modelId)).toEqual([9, 1, 3])
    expect(result.rows[0]?.baseModel).toBe('Illustrious')
    expect(
      (await search(db, { ...filters, pageSize: 2, page: 2 })).rows.map(
        (row) => row.modelId,
      ),
    ).toEqual([3])

    const clothing = await search(db, {
      q: 'silver',
      contentType: { tags: ['clothing'], nameKeywords: [] },
    })
    expect(clothing.total).toBe(2)
    expect(clothing.rows.map((row) => row.modelId)).toEqual([8, 9])
  })

  it('walks the sort index for large result sets and keeps the same order', async () => {
    const catalog = Array.from({ length: 2_600 }, (_, index) => ({
      id: 100 + index,
      name: `bulk ${index}`,
      baseModel: index % 2 === 0 ? 'Pony' : 'Illustrious',
      downloadCount: (index * 7919) % 5000,
      thumbsUpCount: (index * 104729) % 300,
    }))
    await syncAll(db, new FakeUpstream(catalog))

    const ponies = catalog.filter((model) => model.baseModel === 'Pony')
    const expected = [...catalog]
      .sort(
        (a, b) =>
          b.thumbsUpCount - a.thumbsUpCount ||
          b.downloadCount - a.downloadCount ||
          a.id - b.id,
      )
      .slice(24, 48)
      .map((model) => model.id)
    const page2 = await search(db, { sort: 'thumbs', page: 2, pageSize: 24 })
    expect(page2.total).toBeGreaterThanOrEqual(2_000)
    expect(page2.rows.map((row) => row.modelId)).toEqual(expected)

    // 少于切换线的结果集走另一条路，顺序规则不变。
    const smallPage = await search(db, {
      baseModels: ['Pony'],
      sort: 'downloads',
      pageSize: 5,
    })
    expect(smallPage.total).toBe(ponies.length)
    expect(smallPage.rows.map((row) => row.modelId)).toEqual(
      [...ponies]
        .sort((a, b) => b.downloadCount - a.downloadCount || a.id - b.id)
        .slice(0, 5)
        .map((model) => model.id),
    )
  })

  it('ranks relevance inside the most-downloaded pool, then continues by downloads', async () => {
    const catalog: FakeModel[] = Array.from({ length: 2_400 }, (_, index) => ({
      id: 100 + index,
      name: index % 3 === 0 ? `bulk ${index}` : `pack bulk ${index}`,
      downloadCount: 10_000 - index,
    }))
    await syncAll(db, new FakeUpstream(catalog))

    const byDownloads = [...catalog].sort(
      (a, b) => (b.downloadCount ?? 0) - (a.downloadCount ?? 0) || a.id - b.id,
    )
    const pool = byDownloads.slice(0, 1000)
    const expected = [
      // 名字以 bulk 开头（第 1 档）在前，含 bulk（第 2 档）在后。
      ...pool.filter((model) => model.name.startsWith('bulk')),
      ...pool.filter((model) => !model.name.startsWith('bulk')),
      ...byDownloads.slice(1000),
    ].map((model) => model.id)

    const first = await search(db, {
      q: 'bulk',
      sort: 'relevance',
      pageSize: 24,
    })
    expect(first.total).toBe(2_400)
    expect(first.rows.map((row) => row.modelId)).toEqual(expected.slice(0, 24))
    // 跨过候选池边界的那一页（offset 984–1008）。
    const straddle = await search(db, {
      q: 'bulk',
      sort: 'relevance',
      page: 42,
      pageSize: 24,
    })
    expect(straddle.rows.map((row) => row.modelId)).toEqual(
      expected.slice(984, 1008),
    )
  })

  it('stops counting at the cap', async () => {
    const catalog = Array.from({ length: TOTAL_CAP + 5 }, (_, index) => ({
      id: index + 1,
      name: `capped ${index}`,
    }))
    await syncAll(db, new FakeUpstream(catalog))
    const result = await search(db, { q: 'capped', pageSize: 1 })
    expect(result).toMatchObject({ total: TOTAL_CAP, totalCapped: true })
    expect((await search(db, { q: 'capped 1234' })).totalCapped).toBe(false)
  }, 60_000)

  it('reuses a browse total until the next completed sync, but never a search total', async () => {
    await recordSyncCompleted(db, 10)
    expect((await search(db, {})).total).toBe(7)
    expect((await search(db, { q: 'silver' })).total).toBe(3)

    // 同步跑到一半：浏览的总数还是上一轮的，搜索照实算。
    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        { id: 9, name: 'Silver extra', downloadCount: 1 },
      ]),
    )
    expect((await search(db, {})).total).toBe(7)
    expect((await search(db, { q: 'silver' })).total).toBe(4)

    await recordSyncCompleted(db, 20)
    expect((await search(db, {})).total).toBe(8)
  })

  it('serves a stale browse total right away and recounts it in the background', async () => {
    await recordSyncCompleted(db, 10)
    expect((await search(db, {})).total).toBe(7)

    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        { id: 9, name: 'Silver extra', downloadCount: 1 },
      ]),
    )
    await recordSyncCompleted(db, 20)

    const deferred: Promise<unknown>[] = []
    const input = SearchInputSchema.parse({ sort: 'downloads', pageSize: 50 })
    const stale = await searchIndex(db, input, {
      defer: (work) => deferred.push(work),
    })
    expect(stale.total).toBe(7)
    expect(deferred).toHaveLength(1)
    await Promise.all(deferred)

    const fresh = await searchIndex(db, input, {
      defer: (work) => deferred.push(work),
    })
    expect(fresh.total).toBe(8)
    expect(deferred).toHaveLength(1)
  })

  it('warms every cached browse total after a sync', async () => {
    await recordSyncCompleted(db, 10)
    await search(db, {})
    await search(db, { nsfw: { someImageAtMost: 2 } })

    await syncAll(
      db,
      new FakeUpstream([
        ...SEARCH_FIXTURE,
        { id: 9, name: 'Silver extra', downloadCount: 1 },
      ]),
    )
    await recordSyncCompleted(db, 20)
    expect(await warmBrowseCounts(db)).toBe(2)
    expect(await warmBrowseCounts(db)).toBe(0)

    const deferred: Promise<unknown>[] = []
    const result = await searchIndex(
      db,
      SearchInputSchema.parse({ sort: 'downloads', pageSize: 50 }),
      { defer: (work) => deferred.push(work) },
    )
    expect(result.total).toBe(8)
    expect(deferred).toHaveLength(0)
  })

  it('returns parsed arrays and the last sync time', async () => {
    await recordSyncCompleted(db, 1234)
    const result = await search(db, { q: 'lifestyle' })
    expect(result.syncedAt).toBe(1234)
    expect(result.rows[0]).toMatchObject({
      tags: ['lifestyle'],
      trainedWords: ['silverlight'],
      images: [{ id: 300, url: 'uuid-3', nsfwLevel: 1 }],
      hashAutoV3: 'AV3-3',
      baseModel: 'Illustrious',
      creatorImage: 'avatar-3',
      nsfw: false,
      permissions: {
        allowCommercialUse: ['Image'],
        allowDerivatives: true,
        allowNoCredit: false,
      },
    })
  })
})

/** 假的 semantic-index：记下存进来的文字；查询按事先给好的「这句话 → [id, 分数]」回。 */
function fakeSemantic(answers: Record<string, [number, number][]> = {}) {
  const stored = new Map<string, string>()
  const queries: string[] = []
  const binding: SemanticIndexBinding = {
    async upsert({ items }) {
      for (const item of items) stored.set(item.key, item.text)
      return items.length
    },
    async query({ text }) {
      queries.push(text)
      return (answers[text] ?? []).map(([id, score]) => ({
        key: String(id),
        score,
      }))
    },
  }
  return { binding, stored, queries }
}

describe('按意思搜', () => {
  beforeEach(async () => {
    clearMeaningCache()
    await syncAll(db, new FakeUpstream(SEARCH_FIXTURE))
  })

  it('embeds every row once, then only rows whose name / tags / versions changed', async () => {
    const semantic = fakeSemantic()
    expect(await embedPending(db, semantic.binding, 5)).toEqual({
      embedded: 5,
      done: false,
    })
    expect(await embedPending(db, semantic.binding, 5)).toEqual({
      embedded: 2,
      done: true,
    })
    expect(semantic.stored.size).toBe(SEARCH_FIXTURE.length)
    expect(semantic.stored.get('3')).toBe(
      'Lifestyle photo / tags: lifestyle / triggers: silverlight / base: Illustrious',
    )
    expect(await embedPending(db, semantic.binding)).toEqual({
      embedded: 0,
      done: true,
    })

    semantic.stored.clear()
    await syncAll(
      db,
      new FakeUpstream(
        SEARCH_FIXTURE.map((model) =>
          model.id === 2 ? { ...model, name: 'Silver watercolor' } : model,
        ),
      ),
    )
    expect(await embedPending(db, semantic.binding)).toEqual({
      embedded: 1,
      done: true,
    })
    expect([...semantic.stored.keys()]).toEqual(['2'])
  })

  it('caps the text and falls back when a model has no name', () => {
    const text = loraMeaningText({
      modelId: 9,
      name: ' ',
      tags: Array.from({ length: 30 }, (_, i) => `tag${i}`),
      trainedWords: ['x'.repeat(200), '', 'b', 'c', 'd', 'e', 'f'],
      baseModel: null,
    })
    expect(text.startsWith('LoRA 9 / tags: tag0, ')).toBe(true)
    expect(text).toContain('tag11')
    expect(text).not.toContain('tag12')
    expect(text).toContain(`triggers: ${'x'.repeat(60)}, b, c, d, e`)
    expect(text).not.toContain(', f')
  })

  it('puts meaning matches after the literal ones, skipping duplicates and weak scores', async () => {
    const { binding } = fakeSemantic({
      silver: [
        [2, 0.9],
        [6, 0.8],
        [5, 0.3],
      ],
    })
    const run = (page: number) =>
      searchIndex(
        db,
        SearchInputSchema.parse({
          q: 'Silver',
          sort: 'downloads',
          pageSize: 2,
          page,
        }),
        { semantic: binding },
      )
    const first = await run(1)
    expect(first.total).toBe(4)
    expect(first.rows.map((row) => row.modelId)).toEqual([1, 3])
    expect((await run(2)).rows.map((row) => row.modelId)).toEqual([2, 6])
    expect((await run(3)).rows).toEqual([])
  })

  it('finds by meaning alone when nothing matches literally, with the same filters', async () => {
    const { binding, queries } = fakeSemantic({
      水彩风: [
        [6, 0.7],
        [2, 0.66],
      ],
    })
    const run = (input: Partial<SearchInput>) =>
      searchIndex(
        db,
        SearchInputSchema.parse({ q: '水彩风', sort: 'relevance', ...input }),
        { semantic: binding },
      )
    const all = await run({})
    expect(all.rows.map((row) => row.modelId)).toEqual([6, 2])
    expect(all.total).toBe(2)
    const pony = await run({ baseModels: ['Pony'] })
    expect(pony.rows.map((row) => row.modelId)).toEqual([2])
    // 同一句话第二次不再查向量库。
    expect(queries).toEqual(['水彩风'])
  })

  it('does not hold a page of literal results for a slow semantic side, and uses it on the next page', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const deferred: Promise<unknown>[] = []
    const binding: SemanticIndexBinding = {
      upsert: async () => 0,
      query: async () => {
        await gate
        return [{ key: '6', score: 0.8 }]
      },
    }
    const run = (page: number) =>
      searchIndex(
        db,
        SearchInputSchema.parse({
          q: 'silver',
          sort: 'downloads',
          pageSize: 2,
          page,
        }),
        { semantic: binding, defer: (work) => deferred.push(work) },
      )
    const first = await run(1)
    expect(first.rows.map((row) => row.modelId)).toEqual([1, 3])
    expect(first.total).toBe(3)
    expect(deferred).toHaveLength(1)
    release()
    await Promise.all(deferred)
    // 排到字面最后一条的那一页照等，总数是真的。
    const second = await run(2)
    expect(second.rows.map((row) => row.modelId)).toEqual([2, 6])
    expect(second.total).toBe(4)
  })

  it('keeps the literal results when the semantic side fails', async () => {
    const binding: SemanticIndexBinding = {
      upsert: async () => 0,
      query: async () => {
        throw new Error('down')
      },
    }
    const result = await searchIndex(
      db,
      SearchInputSchema.parse({ q: 'silver', sort: 'downloads' }),
      { semantic: binding },
    )
    expect(result.rows.map((row) => row.modelId)).toEqual([1, 3, 2])
  })
})

describe('搜不到、被挡住时', () => {
  const ENDFIELD: FakeModel[] = [
    {
      id: 11,
      name: 'Endfield Perlica',
      baseModel: 'Anima',
      downloadCount: 900,
    },
    { id: 12, name: 'Endfield Chen', downloadCount: 800, nsfwLevel: [8] },
    { id: 13, name: 'Endfield screencap', downloadCount: 700 },
    { id: 14, name: 'Endfield squad', downloadCount: 600 },
    {
      id: 15,
      name: 'Pack',
      tags: ['endfield'],
      baseModel: 'Pony',
      downloadCount: 5000,
    },
  ]

  beforeEach(async () => {
    await syncAll(db, new FakeUpstream([...SEARCH_FIXTURE, ...ENDFIELD]))
    for (const first of WORD_SEGMENTS) await buildWordSegment(db, first)
    await finishWordDictionary(db)
  })

  const run = (input: Partial<SearchInput>, live?: () => Promise<unknown[]>) =>
    searchIndex(
      db,
      SearchInputSchema.parse({ sort: 'relevance', pageSize: 2, ...input }),
      live ? { live } : {},
    )

  it('counts adjacent swaps as one edit', () => {
    expect(editDistance('endfeild', 'endfield')).toBe(1)
    expect(editDistance('endfeld', 'endfield')).toBe(1)
    expect(editDistance('silver', 'sliver')).toBe(1)
  })

  it('shows strong name matches hidden by filters, and which filter hid them', async () => {
    const result = await run({
      q: 'endfield',
      baseModels: ['Illustrious'],
      nsfw: { someImageAtMost: 2 },
    })
    expect(result.literalTotal).toBe(2)
    expect(result.rows.map((row) => row.modelId)).toEqual([13, 14])
    // 去掉底模（分级照旧）：名字里有、又是安全的 3 个 + 只在标签里的 1 个。
    expect(result.hidden?.total).toBe(4)
    expect(
      result.hidden?.rows.map((row) => [row.modelId, row.blockedBy]),
    ).toEqual([
      [11, ['base']],
      [12, ['nsfw']],
    ])
    // 只在第 1 页给。
    expect(
      (await run({ q: 'endfield', baseModels: ['Illustrious'], page: 2 }))
        .hidden,
    ).toBeNull()
  })

  it('only lists rating-hidden matches, without a total, when rating is the only filter', async () => {
    const result = await run({ q: 'endfield', nsfw: { someImageAtMost: 2 } })
    expect(result.hidden).toEqual({
      total: null,
      totalCapped: false,
      rows: [expect.objectContaining({ modelId: 12, blockedBy: ['nsfw'] })],
    })
  })

  it('gives no hidden block without filters or when nothing is hidden', async () => {
    expect((await run({ q: 'endfield' })).hidden).toBeNull()
    expect(
      (await run({ q: 'silver', nsfw: { someImageAtMost: 2 } })).hidden,
    ).toBeNull()
  })

  it('searches the corrected word when a typo matches nothing', async () => {
    const result = await run({ q: 'endfeild squad' })
    expect(result.literalTotal).toBe(0)
    expect(result.fallback).toEqual({
      kind: 'corrected',
      query: 'endfield squad',
      total: 1,
    })
    expect(result.rows.map((row) => row.modelId)).toEqual([14])
    // 词表里本来就有的词不纠：一个都没有就是没有。
    expect((await run({ q: 'endfield zzzz' })).fallback).toBeNull()
  })

  it('looks Civitai up live when nothing matches, writes the hits back, and pages through them', async () => {
    const queries: string[] = []
    const live = async () => {
      queries.push('called')
      return [
        fullHit({ id: 21, name: '明日方舟：终末地 Rossi', downloadCount: 3 }),
        fullHit({ id: 22, name: '明日方舟：终末地 Yvonne', baseModel: 'Pony' }),
        fullHit({ id: 23, name: '明日方舟：终末地 Chen' }),
      ]
    }
    const first = await run({ q: '明日方舟终末地' }, live)
    expect(first.fallback).toEqual({ kind: 'live', total: 3 })
    expect(first.total).toBe(3)
    expect(first.rows.map((row) => row.modelId)).toEqual([21, 22])
    expect(
      (await run({ q: '明日方舟终末地', page: 2 }, live)).rows.map(
        (row) => row.modelId,
      ),
    ).toEqual([23])
    // 现查的照样过筛选。
    const pony = await run({ q: '明日方舟终末地', baseModels: ['Pony'] }, live)
    expect(pony.rows.map((row) => row.modelId)).toEqual([22])
    // 写回了索引：之后本地就搜得到。
    const local = await run({ q: 'Rossi' })
    expect(local.rows.map((row) => row.modelId)).toEqual([21])
    // 字面有结果时不现查。
    queries.length = 0
    await run({ q: 'endfield' }, live)
    expect(queries).toEqual([])
  })

  it('ignores a failing live lookup', async () => {
    const result = await run({ q: 'nothinghere' }, async () => {
      throw new Error('down')
    })
    expect(result.fallback).toBeNull()
    expect(result.rows).toEqual([])
  })
})
