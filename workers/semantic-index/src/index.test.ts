import worker, { type Env } from './index'
import { DIMENSIONS, EMBEDDING_MODEL, truncate, vectorId } from './semantic'

/** 假模型：每个字算一维（1024 维），同字多的两段就相近；记下每次调用。 */
function fakeAi() {
  const calls: { model: string; side: string; size: number }[] = []
  const ai: Ai = {
    async run(model, input) {
      const side = input.queries ? 'queries' : 'documents'
      const texts = input.queries ?? input.documents ?? []
      calls.push({ model, side, size: texts.length })
      return {
        data: texts.map((text) => {
          const vector = new Array<number>(1024).fill(0)
          for (const char of text)
            vector[char.codePointAt(0)! % DIMENSIONS] += 1
          return vector
        }),
      }
    },
  }
  return { ai, calls }
}

/** 假向量库：按 namespace 与 kind / category 过滤后算 cosine。 */
function fakeVectors() {
  const store = new Map<string, VectorizeVector>()
  const index: VectorizeIndex = {
    async upsert(vectors) {
      for (const vector of vectors) store.set(vector.id, vector)
    },
    async deleteByIds(ids) {
      for (const id of ids) store.delete(id)
    },
    async query(vector, options) {
      const filter = options.filter as {
        kind: string
        category?: { $in: number[] }
      }
      const matches = [...store.values()]
        .filter(
          (item) =>
            item.namespace === options.namespace &&
            item.metadata?.kind === filter.kind &&
            (!filter.category ||
              filter.category.$in.includes(Number(item.metadata?.category))),
        )
        .map((item) => ({
          id: item.id,
          score: item.values.reduce((sum, v, i) => sum + v * vector[i], 0),
          metadata: item.metadata,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, options.topK)
      return { matches, count: matches.length }
    },
  }
  return { index, store }
}

function setup() {
  const { ai, calls } = fakeAi()
  const { index, store } = fakeVectors()
  const env: Env = { AI: ai, VECTORS: index, INDEX_TOKEN: 'secret' }
  const call = (path: string, body: unknown, token = 'secret') =>
    worker.fetch(
      new Request(`https://index.test${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
      env,
    )
  return { call, calls, store }
}

const tag = (key: string, text: string, category: number) => ({
  kind: 'danbooru-tag',
  key,
  text,
  meta: { category, count: 10 },
})

describe('semantic index worker', () => {
  it('rejects a wrong token', async () => {
    const { call } = setup()
    expect((await call('/query', {}, 'nope')).status).toBe(401)
  })

  it('rejects invalid input', async () => {
    const { call } = setup()
    expect(
      (await call('/upsert', { namespace: 'public', items: [] })).status,
    ).toBe(400)
    expect(
      (
        await call('/query', {
          namespace: 'a b',
          text: 'x',
          kind: 'danbooru-tag',
        })
      ).status,
    ).toBe(400)
  })

  it('stores documents and finds them by meaning, filtered by namespace, kind and category', async () => {
    const { call, calls } = setup()
    await call('/upsert', {
      namespace: 'public',
      items: [
        tag('cat_ears', 'cat ears / 猫耳', 0),
        tag('wlop', 'wlop / 画师', 1),
        tag('dog_ears', 'dog ears / 犬耳', 0),
      ],
    })
    await call('/upsert', {
      namespace: 'u:someone',
      items: [tag('cat_ears', 'cat ears / 猫耳', 0)],
    })

    const response = await call('/query', {
      namespace: 'public',
      text: '猫耳',
      kind: 'danbooru-tag',
      categories: [0],
      topK: 5,
    })
    const { matches } = (await response.json()) as {
      matches: { key: string; meta: Record<string, unknown> }[]
    }
    expect(matches.map((match) => match.key)).toEqual(['cat_ears', 'dog_ears'])
    expect(matches[0].meta).toEqual({ category: 0, count: 10 })
    expect(calls.map((c) => [c.model, c.side])).toEqual([
      [EMBEDDING_MODEL, 'documents'],
      [EMBEDDING_MODEL, 'documents'],
      [EMBEDDING_MODEL, 'queries'],
    ])
  })

  it('splits documents into model batches of 32', async () => {
    const { call, calls, store } = setup()
    const items = Array.from({ length: 70 }, (_, i) =>
      tag(`t${i}`, `tag ${i}`, 0),
    )
    const response = await call('/upsert', { namespace: 'public', items })
    expect(await response.json()).toEqual({ upserted: 70 })
    expect(calls.map((c) => c.size)).toEqual([32, 32, 6])
    expect(store.size).toBe(70)
  })

  it('upserting the same kind + key replaces it, and delete removes it', async () => {
    const { call, store } = setup()
    await call('/upsert', { namespace: 'public', items: [tag('a', 'one', 0)] })
    await call('/upsert', { namespace: 'public', items: [tag('a', 'two', 0)] })
    expect(store.size).toBe(1)
    await call('/delete', {
      namespace: 'public',
      items: [{ kind: 'danbooru-tag', key: 'a' }],
    })
    expect(store.size).toBe(0)
  })
})

describe('vector helpers', () => {
  it('truncates to the stored size and renormalizes', () => {
    const vector = truncate([3, 4, ...new Array(1022).fill(0)])
    expect(vector).toHaveLength(DIMENSIONS)
    expect(vector.slice(0, 2)).toEqual([0.6, 0.8])
  })

  it('makes ids that fit the 64-byte limit', async () => {
    const id = await vectorId('public', 'danbooru-tag', 'x'.repeat(500))
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(await vectorId('public', 'danbooru-tag', 'a')).not.toBe(
      await vectorId('public', 'lora', 'a'),
    )
    expect(await vectorId('public', 'danbooru-tag', 'a')).not.toBe(
      await vectorId('u:someone', 'danbooru-tag', 'a'),
    )
  })
})
