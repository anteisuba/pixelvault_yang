import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { searchIndex, SearchInputSchema, type SearchInput } from './search'
import { recordSyncCompleted, syncPages } from './sync'
import { createTestDb } from './test/d1'
import { LIGHT_PAGE_SIZE, type Upstream } from './upstream'

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
}

function fullHit(model: FakeModel) {
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
    version: model.noVersion
      ? null
      : {
          id: model.id * 10,
          name: 'v1.0',
          baseModel: model.baseModel ?? 'Illustrious',
          trainedWords: model.trainedWords ?? [],
          hashData: [{ hash: `AV3-${model.id}`, type: 'AutoV3' }],
        },
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
    // 两个字的中文词不够 trigram，退回 LIKE。
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
