/**
 * L2a 真库：查资料 / 标签那一圈零散接口——Danbooru 资料（catalog）、收藏、样图代取、
 * NovelAI 标签联想、model-keyword 触发词、标签堆、用量汇总、图片代理。
 * 只假边界：Clerk 登录、限流、外部服务（fetch、DNS）。服务与库全真：核库里的行、
 * 发给外部的请求与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// safeFetch 先解析域名防 SSRF：测试里一律解析成一个公网地址，⛔ 不真查 DNS。
vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>()
  return {
    ...actual,
    promises: {
      ...actual.promises,
      lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
    },
  }
})

import {
  createGET,
  createPOST,
  createPUT,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { MODEL_KEYWORD_LORA_KEYWORD_RAW_URL } from '@/constants/lora'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { GET as GET_CATALOG } from '@/app/api/danbooru/catalog/route'
import {
  GET as LIST_FAVORITES,
  POST as ADD_FAVORITE,
} from '@/app/api/danbooru/favorites/route'
import { GET as GET_DANBOORU_IMAGE } from '@/app/api/danbooru/image/route'
import { GET as GET_NAI_TAGS } from '@/app/api/novelai/tag-suggestions/route'
import { GET as GET_MODEL_KEYWORD } from '@/app/api/prompt-tags/model-keyword/route'
import {
  GET as GET_STACK,
  PUT as PUT_STACK,
} from '@/app/api/prompt-tags/stack/route'
import { GET as GET_USAGE } from '@/app/api/usage-summary/route'
import { GET as GET_PROXY } from '@/app/api/image/proxy/route'
import { db } from '@/lib/db'
import { __resetModelKeywordCacheForTests } from '@/services/model-keyword.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

/** 外部服务：按地址回假响应，记下发出去的每个请求。 */
type Responder = (url: URL, init?: RequestInit) => Response | undefined
let responders: Responder[] = []
let sent: Array<{ url: URL; init?: RequestInit }> = []

function respond(responder: Responder) {
  responders.push(responder)
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  responders = []
  sent = []
  __resetModelKeywordCacheForTests()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input)
      sent.push({ url, init })
      for (const responder of responders) {
        const res = responder(url, init)
        if (res) return res
      }
      return new Response('not found', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('GET /api/danbooru/catalog（真服务）', () => {
  const catalog = (query: Record<string, string>) =>
    GET_CATALOG(createGET('/api/danbooru/catalog', query))

  it('没登录 401，不碰 Danbooru', async () => {
    mockUnauthenticated()
    expect((await catalog({ query: 'denia', kind: 'character' })).status).toBe(
      401,
    )
    expect(sent).toHaveLength(0)
  })

  it('tag 里夹带元标签 / 少了 kind 一律 400，不碰 Danbooru', async () => {
    for (const query of [
      { query: 'denia', kind: 'character', tag: 'denia rating:e' },
      { kind: 'character', tag: '-denia' },
      { kind: 'character', tag: '~denia' },
      { kind: 'character', tag: 'denia,rating:e' },
      { kind: 'artist' },
      { random: '1' },
    ] as Record<string, string>[]) {
      expect((await catalog(query)).status).toBe(400)
    }
    expect(sent).toHaveLength(0)
  })

  it('搜名字：去问 Danbooru，查不到回空候选，响应不进共享缓存', async () => {
    respond((url) =>
      url.hostname === 'danbooru.donmai.us' ? Response.json([]) : undefined,
    )
    const res = await catalog({ query: 'denia', kind: 'character' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(
      (await parseJSON<Envelope<{ candidates: unknown[] }>>(res)).data,
    ).toMatchObject({ candidates: [], crossHint: null })
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((r) => r.url.hostname === 'danbooru.donmai.us')).toBe(
      true,
    )
  })
})

describe('/api/danbooru/favorites（真库）', () => {
  const favorite = {
    kind: 'copyright',
    name: 'princess_connect!',
    count: 28000,
    previews: ['https://cdn.donmai.us/180x180/9b/67/a.jpg'],
  }

  it('收藏落库，列表只列我的', async () => {
    const res = await ADD_FAVORITE(
      createPOST('/api/danbooru/favorites', favorite),
    )
    expect(res.status).toBe(200)
    await db.danbooruFavorite.create({
      data: { userId: other.id, kind: 'character', name: 'theirs', count: 1 },
    })
    expect(
      await db.danbooruFavorite.findMany({ where: { userId: me.id } }),
    ).toEqual([
      expect.objectContaining({
        kind: 'copyright',
        name: 'princess_connect!',
        count: 28000,
        previews: favorite.previews,
      }),
    ])

    const list = await parseJSON<Envelope<Array<{ name: string }>>>(
      await LIST_FAVORITES(createGET('/api/danbooru/favorites')),
    )
    expect(list.data!.map((f) => f.name)).toEqual(['princess_connect!'])
  })

  it('缩略图不是 Danbooru 自家 CDN 400 不落库；没登录 401', async () => {
    expect(
      (
        await ADD_FAVORITE(
          createPOST('/api/danbooru/favorites', {
            ...favorite,
            previews: ['https://evil.example.com/a.jpg'],
          }),
        )
      ).status,
    ).toBe(400)
    mockUnauthenticated()
    expect(
      (await ADD_FAVORITE(createPOST('/api/danbooru/favorites', favorite)))
        .status,
    ).toBe(401)
    expect(await db.danbooruFavorite.count()).toBe(0)
  })
})

describe('GET /api/danbooru/image（真服务）', () => {
  const image = (path: string) =>
    GET_DANBOORU_IMAGE(createGET('/api/danbooru/image', { path }))

  it('从 Danbooru CDN 取图原样回，浏览器私有缓存', async () => {
    respond((url) =>
      url.hostname === 'cdn.donmai.us'
        ? new Response(PNG, { headers: { 'content-type': 'image/png' } })
        : undefined,
    )
    const res = await image('/180x180/9b/67/abc.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toContain('private')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG)
    expect(sent.map((r) => r.url.href)).toEqual([
      'https://cdn.donmai.us/180x180/9b/67/abc.png',
    ])
  })

  it('上游回的不是图 / 不成功 502', async () => {
    respond((url) =>
      url.pathname.endsWith('page.jpg')
        ? new Response('<html>', { headers: { 'content-type': 'text/html' } })
        : undefined,
    )
    expect((await image('/180x180/page.jpg')).status).toBe(502)
    expect((await image('/180x180/missing.jpg')).status).toBe(502)
  })

  it('路径不像样图 400 不发请求；限流 429；没登录 401', async () => {
    for (const path of [
      '/../secret.jpg',
      '/180x180/a.jpg?x=1',
      '//evil.com/a.jpg',
      '/posts.json',
      '180x180/a.jpg',
    ]) {
      expect((await image(path)).status).toBe(400)
    }
    mockRateLimitExceeded()
    expect((await image('/180x180/a.jpg')).status).toBe(429)
    mockUnauthenticated()
    expect((await image('/180x180/a.jpg')).status).toBe(401)
    expect(sent).toHaveLength(0)
  })
})

describe('GET /api/novelai/tag-suggestions（真库存 key）', () => {
  const suggest = (query: Record<string, string>) =>
    GET_NAI_TAGS(createGET('/api/novelai/tag-suggestions', query))
  const query = { model: 'nai-diffusion-4-5-curated', prompt: 'denia' }

  it('拿我存的 NovelAI key 去问联想，回标签', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.NOVELAI)
    respond((url) =>
      url.pathname === '/ai/generate-image/suggest-tags'
        ? Response.json({ tags: [{ tag: 'denia_(fire_emblem)', count: 120 }] })
        : undefined,
    )
    const res = await suggest(query)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await parseJSON<Envelope<unknown>>(res)).data).toEqual({
      tags: [{ tag: 'denia_(fire_emblem)', count: 120 }],
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].url.origin).toBe(
      new URL(AI_PROVIDER_ENDPOINTS.NOVELAI).origin,
    )
    expect(sent[0].url.searchParams.get('prompt')).toBe('denia')
    expect(sent[0].url.searchParams.get('model')).toBe(query.model)
    expect(new Headers(sent[0].init?.headers).get('Authorization')).toBe(
      'Bearer sk-test-not-a-real-key',
    )
  })

  it('没存 key 400 MISSING_API_KEY；上游限流 429', async () => {
    const missing = await suggest(query)
    expect(missing.status).toBe(400)
    expect((await parseJSON<Envelope<unknown>>(missing)).errorCode).toBe(
      'MISSING_API_KEY',
    )
    expect(sent).toHaveLength(0)

    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.NOVELAI)
    respond(() => new Response('slow down', { status: 429 }))
    expect((await suggest(query)).status).toBe(429)
  })

  it('不认识的模型 400；没登录 401', async () => {
    expect((await suggest({ ...query, model: 'gpt-image-1' })).status).toBe(400)
    mockUnauthenticated()
    expect((await suggest(query)).status).toBe(401)
    expect(sent).toHaveLength(0)
  })
})

describe('GET /api/prompt-tags/model-keyword（真服务）', () => {
  const search = (query: Record<string, string>) =>
    GET_MODEL_KEYWORD(createGET('/api/prompt-tags/model-keyword', query))

  it('读触发词表、按名字搜，只取一次表', async () => {
    respond((url) =>
      url.href === MODEL_KEYWORD_LORA_KEYWORD_RAW_URL
        ? new Response(
            [
              '# comment',
              'a1b2c3d4,ghibli style|ghibli,ghibli_v2.safetensors',
              'deadbeef,pixel art,pixel.safetensors',
              'nothex!,ghibli fake',
            ].join('\n'),
          )
        : undefined,
    )
    const res = await search({ query: 'ghibli' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400')
    const body = await parseJSON<Envelope<Array<{ promptText: string }>>>(res)
    expect(body.data!.map((t) => t.promptText)).toEqual([
      'ghibli style',
      'ghibli',
    ])

    await search({ query: 'pixel' })
    expect(sent).toHaveLength(1)
  })

  it('词太短 400 不取表', async () => {
    expect((await search({ query: 'g' })).status).toBe(400)
    expect(sent).toHaveLength(0)
  })
})

describe('/api/prompt-tags/stack（真库）', () => {
  const selection = {
    id: 's1',
    tagId: 'danbooru:smile',
    promptText: 'smile',
    label: 'smile',
    polarity: 'positive',
    source: 'danbooru',
    type: 'character_trait',
    enabled: true,
    orderIndex: 0,
    insertedAt: '2026-10-01T00:00:00.000Z',
  }
  const getStack = async () =>
    (
      await parseJSON<Envelope<{ stack: unknown }>>(
        await GET_STACK(createGET('/api/prompt-tags/stack')),
      )
    ).data!.stack

  it('没存过回 null；整份覆盖落库再读回', async () => {
    expect(await getStack()).toBeNull()
    const put = (body: unknown) =>
      PUT_STACK(createPUT('/api/prompt-tags/stack', body))
    expect((await put({ positive: [selection], negative: [] })).status).toBe(
      200,
    )
    expect((await put({ positive: [], negative: [selection] })).status).toBe(
      200,
    )

    expect(await db.promptTagStack.count()).toBe(1)
    expect(await getStack()).toEqual({ positive: [], negative: [selection] })
  })

  it('超过上限 / 坏的 polarity 400 不落库；没登录 401', async () => {
    const put = (body: unknown) =>
      PUT_STACK(createPUT('/api/prompt-tags/stack', body))
    const many = Array.from({ length: 201 }, (_, i) => ({
      ...selection,
      id: `s${i}`,
    }))
    expect((await put({ positive: many, negative: [] })).status).toBe(400)
    expect(
      (
        await put({
          positive: [{ ...selection, polarity: 'up' }],
          negative: [],
        })
      ).status,
    ).toBe(400)
    mockUnauthenticated()
    expect((await put({ positive: [], negative: [] })).status).toBe(401)
    expect(await db.promptTagStack.count()).toBe(0)
  })
})

describe('GET /api/usage-summary（真库）', () => {
  it('按我的用量账汇总，别人的不算', async () => {
    const row = {
      adapterType: 'OPENAI',
      provider: 'openai',
      modelId: 'gpt-image-1',
    }
    const old = new Date(Date.now() - 90 * 24 * 3600 * 1000)
    await db.apiUsageLedger.createMany({
      data: [
        { ...row, userId: me.id, requestCount: 2 },
        { ...row, userId: me.id, wasSuccessful: false },
        { ...row, userId: me.id, createdAt: old },
        { ...row, userId: other.id, requestCount: 50 },
      ],
    })
    const summary = await parseJSON<Record<string, unknown>>(await GET_USAGE())
    expect(summary).toMatchObject({
      totalRequests: 4,
      successfulRequests: 3,
      failedRequests: 1,
      last30DaysRequests: 3,
    })
    expect(typeof summary.lastRequestAt).toBe('string')
  })

  it('一条都没有全是 0；没登录 401', async () => {
    expect(await parseJSON(await GET_USAGE())).toEqual({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      last30DaysRequests: 0,
      lastRequestAt: null,
    })
    mockUnauthenticated()
    expect((await GET_USAGE()).status).toBe(401)
  })
})

describe('GET /api/image/proxy（真服务）', () => {
  const proxy = (url: string) =>
    GET_PROXY(createGET('/api/image/proxy', { url }))

  it('外站图代取原样回', async () => {
    respond((url) =>
      url.hostname === 'images.example.com'
        ? new Response(PNG, { headers: { 'content-type': 'image/png' } })
        : undefined,
    )
    const res = await proxy('https://images.example.com/a.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG)
  })

  it('我们自己桶里的图直接 302 过去，不代取', async () => {
    const owned = 'https://pub-5346558f8dc549f9ba5217489fe5395e.r2.dev/a.png'
    const res = await proxy(owned)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(owned)
    expect(sent).toHaveLength(0)
  })

  it('上游失败 502；不是图 400；内网 / 非 http 400 不发请求', async () => {
    respond((url) =>
      url.pathname === '/page'
        ? new Response('<html>', { headers: { 'content-type': 'text/html' } })
        : undefined,
    )
    expect((await proxy('https://images.example.com/missing.png')).status).toBe(
      502,
    )
    expect((await proxy('https://images.example.com/page')).status).toBe(400)

    sent = []
    for (const url of [
      'http://127.0.0.1/a.png',
      'file:///etc/passwd',
      'nope',
    ]) {
      expect((await proxy(url)).status).toBe(400)
    }
    expect(sent).toHaveLength(0)
  })

  it('限流 429；没登录 401', async () => {
    mockRateLimitExceeded()
    expect((await proxy('https://images.example.com/a.png')).status).toBe(429)
    mockUnauthenticated()
    expect((await proxy('https://images.example.com/a.png')).status).toBe(401)
    expect(sent).toHaveLength(0)
  })
})
