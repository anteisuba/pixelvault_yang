/**
 * L2a 真库：LoRA 那一圈接口——Civitai token（/api/civitai-token）、收藏 / 取消收藏
 * （/api/lora-assets/favorite）、Civitai 库列表（走我们自己的索引）、按 hash / 版本号解析
 * （先查本地库）、来源页跳转、HF 搜索与 README 展示、训练图直传两步、定时任务心跳
 * （/api/health/crons）。只假边界：Clerk 登录、R2、外部服务（Civitai / 索引 / HF 的 fetch、
 * DNS、Upstash Redis）。服务与库全真：核库里的行、发给外部的请求与返回值。
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

/** 心跳存在 Upstash：换成内存里的一张表。 */
const redisStore = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  down: false,
}))
vi.mock('@upstash/redis', () => ({
  Redis: class {
    async mget(...keys: string[]) {
      if (redisStore.down) throw new Error('redis unreachable')
      return keys.map((key) => redisStore.values.get(key) ?? null)
    }
    async set(key: string, value: unknown) {
      redisStore.values.set(key, value)
      return 'OK'
    }
  },
}))

const bucket = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  presigned: [] as string[],
}))
vi.mock('@/services/storage/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/storage/r2')>()
  return {
    ...actual,
    createPresignedR2PutUrl: vi.fn(async ({ key }: { key: string }) => {
      bucket.presigned.push(key)
      return `https://r2.test/put/${key}`
    }),
    getR2ObjectBuffer: vi.fn(async ({ key }: { key: string }) => {
      const object = bucket.objects.get(key)
      if (!object) throw new Error(`R2 object not found: ${key}`)
      return { buffer: object }
    }),
    deleteFromR2: vi.fn(async (key: string) => {
      bucket.objects.delete(key)
    }),
  }
})

import {
  createDELETE,
  createGET,
  createPOST,
  createPUT,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { CRON_HEARTBEAT, CRON_JOB_NAMES } from '@/constants/cron'
import { CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL } from '@/constants/lora'
import {
  DELETE as DELETE_TOKEN,
  GET as GET_TOKEN,
  PUT as PUT_TOKEN,
} from '@/app/api/civitai-token/route'
import {
  DELETE as UNFAVORITE,
  POST as FAVORITE,
} from '@/app/api/lora-assets/favorite/route'
import { GET as LIST_CIVITAI } from '@/app/api/lora-assets/civitai/route'
import { GET as RESOLVE } from '@/app/api/lora-assets/civitai/resolve/route'
import { GET as SOURCE } from '@/app/api/lora-assets/civitai/source/route'
import { GET as SEARCH_HF } from '@/app/api/lora-assets/huggingface/route'
import { GET as HF_SHOWCASE } from '@/app/api/lora-assets/huggingface/showcase/route'
import { POST as TRAINING_UPLOAD } from '@/app/api/lora-training/uploads/route'
import { POST as TRAINING_COMPLETE } from '@/app/api/lora-training/uploads/complete/route'
import { GET as CRONS } from '@/app/api/health/crons/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

const INDEX_URL = 'https://civitai-index.test'
const HEALTH_TOKEN = 'health-token-test'

/** 假外部：按地址前缀分派，记下每一次请求（地址 + JSON 正文）。 */
type Call = { url: string; body?: unknown }
const external = {
  calls: [] as Call[],
  indexRows: [] as unknown[],
  indexStatus: { last_completed_at: Date.now(), last_error: null } as {
    last_completed_at: number | null
    last_error: string | null
  },
  civitaiVersions: new Map<string, unknown>(),
  hfReadme: new Map<string, string>(),
}
function stubExternal() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input)
      const body =
        typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      external.calls.push({ url, body })
      if (url.startsWith(`${INDEX_URL}/search`)) {
        return Response.json({
          rows: external.indexRows,
          total: external.indexRows.length,
        })
      }
      if (url.startsWith(`${INDEX_URL}/status`)) {
        return Response.json(external.indexStatus)
      }
      const version = /civitai\.com\/api\/v1\/model-versions\/(.+)$/.exec(url)
      if (version) {
        const payload = external.civitaiVersions.get(version[1]!)
        return payload
          ? Response.json(payload)
          : new Response('not found', { status: 404 })
      }
      const readme =
        /^https:\/\/huggingface\.co\/(.+?)\/resolve\/([^/]+)\/README\.md$/.exec(
          url,
        )
      if (readme) {
        const text = external.hfReadme.get(`${readme[1]}@${readme[2]}`)
        return text ? new Response(text) : new Response('', { status: 404 })
      }
      if (url.startsWith('https://huggingface.co/api/models?')) {
        return Response.json([])
      }
      const detail =
        /^https:\/\/huggingface\.co\/api\/models\/(.+)\?blobs=true$/.exec(url)
      if (detail) return Response.json({ id: decodeURIComponent(detail[1]!) })
      if (url.startsWith('https://civitai.com/')) {
        return new Response('not found', { status: 404 })
      }
      throw new Error(`unexpected fetch ${url}`)
    }),
  )
}

const ENV_KEYS = [
  'CIVITAI_INDEX_URL',
  'CIVITAI_INDEX_TOKEN',
  'CIVITAI_TOKEN_SECRET',
  'HEALTH_CHECK_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const
const previousEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  external.calls.length = 0
  external.indexRows = []
  external.indexStatus = { last_completed_at: Date.now(), last_error: null }
  external.civitaiVersions.clear()
  external.hfReadme.clear()
  bucket.objects.clear()
  bucket.presigned.length = 0
  redisStore.values.clear()
  redisStore.down = false
  vi.unstubAllGlobals()
  stubExternal()
  process.env.CIVITAI_INDEX_URL = INDEX_URL
  process.env.CIVITAI_INDEX_TOKEN = 'index-token-test'
  process.env.CIVITAI_TOKEN_SECRET = 'b'.repeat(64)
  process.env.HEALTH_CHECK_TOKEN = HEALTH_TOKEN
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-token-test'
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of ENV_KEYS) {
    if (previousEnv[key] === undefined) delete process.env[key]
    else process.env[key] = previousEnv[key]
  }
})

// ─── Civitai token ─────────────────────────────────────────────────

describe('/api/civitai-token（真库）', () => {
  it('没登录 401，不读不写', async () => {
    mockUnauthenticated()
    expect((await GET_TOKEN(createGET('/api/civitai-token'))).status).toBe(401)
    expect((await DELETE_TOKEN()).status).toBe(401)
    expect(
      (await PUT_TOKEN(createPUT('/api/civitai-token', { token: 'abc' })))
        .status,
    ).toBe(401)
  })

  it('存：加密落库（不是明文）、GET 报有；删：清空、GET 报没有', async () => {
    const read = async () =>
      (
        await parseJSON<Envelope<{ hasToken: boolean }>>(
          await GET_TOKEN(createGET('/api/civitai-token')),
        )
      ).data
    expect(await read()).toEqual({ hasToken: false })

    expect(
      (
        await PUT_TOKEN(
          createPUT('/api/civitai-token', { token: 'civitai-secret-123' }),
        )
      ).status,
    ).toBe(200)
    const stored = (await db.user.findUniqueOrThrow({ where: { id: me.id } }))
      .civitaiToken
    expect(stored).toBeTruthy()
    expect(stored).not.toContain('civitai-secret-123')
    expect(await read()).toEqual({ hasToken: true })
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: other.id } }))
        .civitaiToken,
    ).toBeNull()

    expect((await DELETE_TOKEN()).status).toBe(200)
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: me.id } })).civitaiToken,
    ).toBeNull()
    expect(await read()).toEqual({ hasToken: false })
  })

  it('空 token 400 不落库', async () => {
    expect(
      (await PUT_TOKEN(createPUT('/api/civitai-token', { token: '' }))).status,
    ).toBe(400)
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: me.id } })).civitaiToken,
    ).toBeNull()
  })
})

// ─── 收藏 ─────────────────────────────────────────────────────────

describe('/api/lora-assets/favorite（真库）', () => {
  const LONG_TRIGGER = Array.from({ length: 180 }, (_, i) => `tag_${i}`).join(
    ',',
  )
  const BODY = {
    name: 'Wuthering Waves Daniya',
    triggerWord: LONG_TRIGGER,
    loraUrl: 'https://civitai.com/api/download/models/12345',
    type: 'subject',
    baseModelFamily: 'NoobAI',
    provider: 'civitai',
    coverImageUrl: 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/model.jpg',
  }
  const favorite = async (body: unknown) => {
    const res = await FAVORITE(createPOST('/api/lora-assets/favorite', body))
    return {
      status: res.status,
      body: await parseJSON<Envelope<{ id: string; triggerWord: string }>>(res),
    }
  }

  it('没登录 401，不落行', async () => {
    mockUnauthenticated()
    expect((await favorite(BODY)).status).toBe(401)
    expect(await db.loraAsset.count()).toBe(0)
  })

  it('收进我的库：长触发词、超 120 字的名字照收；收两次只落一行', async () => {
    const longName = `绝区零 Zenless Zone Zero｜${'爱芮 Aria「Cuteness Loading」× '.repeat(5)}`
    expect(longName.length).toBeGreaterThan(120)
    const first = await favorite({ ...BODY, name: longName })
    expect(first.status).toBe(200)
    expect(first.body.data!.triggerWord).toBe(LONG_TRIGGER)
    expect(
      await db.loraAsset.findUniqueOrThrow({
        where: { id: first.body.data!.id },
      }),
    ).toMatchObject({
      userId: me.id,
      source: 'imported',
      inLibrary: true,
      isPublic: false,
      name: longName.trim(),
      loraUrl: BODY.loraUrl,
    })

    const again = await favorite({ ...BODY, name: longName })
    expect(again.body.data!.id).toBe(first.body.data!.id)
    expect(await db.loraAsset.count()).toBe(1)
  })

  it('触发词超长 400 带 INVALID_BODY，不落行', async () => {
    const res = await favorite({ ...BODY, triggerWord: 'x'.repeat(20_000) })
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('INVALID_BODY')
    expect(await db.loraAsset.count()).toBe(0)
  })

  it('取消：删掉我的；缺 assetId 400；别人的不动（removed=false）', async () => {
    const mine = (await favorite(BODY)).body.data!
    mockAuthenticated(other.clerkId)
    const theirs = (await favorite(BODY)).body.data!
    mockAuthenticated(me.clerkId)

    const missing = await UNFAVORITE(createDELETE('/api/lora-assets/favorite'))
    expect(missing.status).toBe(400)
    expect((await parseJSON<Envelope<unknown>>(missing)).errorCode).toBe(
      'INVALID_BODY',
    )

    const notMine = await UNFAVORITE(
      createDELETE(`/api/lora-assets/favorite?assetId=${theirs.id}`),
    )
    expect(await parseJSON(notMine)).toEqual({
      success: true,
      data: { removed: false },
    })

    const res = await UNFAVORITE(
      createDELETE(`/api/lora-assets/favorite?assetId=${mine.id}`),
    )
    expect(await parseJSON(res)).toEqual({
      success: true,
      data: { removed: true },
    })
    expect((await db.loraAsset.findMany()).map((r) => r.id)).toEqual([
      theirs.id,
    ])
  })
})

// ─── Civitai 库列表（索引） ─────────────────────────────────────────

describe('GET /api/lora-assets/civitai（假索引）', () => {
  const list = (query: Record<string, string> = {}) =>
    LIST_CIVITAI(createGET('/api/lora-assets/civitai', query))
  const sentToIndex = () =>
    external.calls.find((c) => c.url.startsWith(`${INDEX_URL}/search`))
      ?.body as Record<string, unknown> | undefined

  it('默认只要安全图、全部类型；边缘缓存一小时', async () => {
    const res = await list()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600')
    expect(res.headers.get('Server-Timing')).toMatch(/total;dur=\d+/)
    expect(sentToIndex()).toMatchObject({
      nsfw: { someImageAtMost: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL },
      contentType: null,
      page: 1,
    })
  })

  it.each(['0', '1', 'true', 'garbage', 'safe'])(
    'nsfw=%s 一律按安全图',
    async (value) => {
      await list({ nsfw: value })
      expect(sentToIndex()).toMatchObject({
        nsfw: { someImageAtMost: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL },
      })
    },
  )

  it('nsfw=nsfwOnly 只要成人图；type=clothing 带上该类的标签', async () => {
    await list({ nsfw: 'nsfwOnly', type: 'clothing', search: 'dress' })
    const sent = sentToIndex()!
    expect(sent).toMatchObject({
      nsfw: { someImageAbove: CIVITAI_MODEL_VERSION_IMAGE_MAX_NSFW_LEVEL },
      q: 'dress',
    })
    expect(sent.nsfw).not.toHaveProperty('someImageAtMost')
    expect(sent.contentType).toMatchObject({ tags: expect.any(Array) })
  })

  it('底模 / 类型 / 排序不在词表里 400，不问索引', async () => {
    for (const query of [
      { baseModel: 'not-a-model' },
      { type: 'not-a-type' },
      { sort: 'x' },
    ] as Record<string, string>[]) {
      expect((await list(query)).status).toBe(400)
    }
    expect(external.calls).toEqual([])
  })
})

// ─── 解析 / 来源页 ────────────────────────────────────────────────

describe('GET /api/lora-assets/civitai/resolve（真库 + 假 Civitai）', () => {
  const resolve = async (query: Record<string, string>) => {
    const res = await RESOLVE(
      createGET('/api/lora-assets/civitai/resolve', query),
    )
    return {
      res,
      body: await parseJSON<Envelope<{ id: string; name: string }>>(res),
    }
  }
  const civitaiCalls = () =>
    external.calls.filter((c) => c.url.includes('civitai.com'))

  async function seedLora(
    userId: string | null,
    extra: Record<string, unknown>,
  ) {
    return db.loraAsset.create({
      data: {
        userId,
        name: 'My Trained LoRA',
        styleCode: `pv-${Math.random().toString(36).slice(2, 10)}`,
        triggerWord: 'mylora',
        loraUrl: `https://cdn.test/${Math.random()}.safetensors`,
        ...extra,
      },
    })
  }

  it('本地库命中（我的）优先，⛔ 不问 Civitai，且不进共享缓存', async () => {
    const mine = await seedLora(me.id, {
      civitaiFileHashAutoV3: '9c783c8ce46c',
    })
    const { res, body } = await resolve({ hash: '9C783C8CE46C' })
    expect(res.status).toBe(200)
    expect(body.data!.id).toBe(mine.id)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(civitaiCalls()).toEqual([])
  })

  it('别人的私有 LoRA 不算本地命中；按版本号去 Civitai 解析，长缓存', async () => {
    await seedLora(other.id, { civitaiModelVersionId: 135867 })
    external.civitaiVersions.set('135867', {
      id: 135867,
      name: 'v1.0',
      modelId: 122359,
      model: { name: 'Detail Tweaker XL', type: 'LORA' },
      baseModel: 'SDXL 1.0',
      downloadUrl: 'https://civitai.com/api/download/models/135867',
      files: [],
      images: [],
    })
    const { res, body } = await resolve({ modelVersionId: '135867' })
    expect(res.status).toBe(200)
    expect(body.data!.name).toBe('Detail Tweaker XL')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400')
    expect(civitaiCalls().map((c) => c.url)).toEqual([
      'https://civitai.com/api/v1/model-versions/135867',
    ])
  })

  it('本地和 Civitai 都没有：404', async () => {
    const { res } = await resolve({ hash: 'deadbeefcafe' })
    expect(res.status).toBe(404)
  })

  it('什么都没给 / hash 不像 hash：400，不问外面', async () => {
    expect((await resolve({})).res.status).toBe(400)
    expect((await resolve({ hash: 'not-a-hash!' })).res.status).toBe(400)
    expect(civitaiCalls()).toEqual([])
  })

  it('hash 不合法但给了名字：按名字在本地库找到', async () => {
    const mine = await seedLora(me.id, { name: 'Detail Tweaker' })
    const { res, body } = await resolve({
      hash: 'zz',
      name: 'loras/Detail Tweaker',
    })
    expect(res.status).toBe(200)
    expect(body.data!.id).toBe(mine.id)
  })
})

describe('GET /api/lora-assets/civitai/source（假 Civitai）', () => {
  it('版本号 → 302 到它所属模型的页面', async () => {
    external.civitaiVersions.set('2266398', {
      id: 2266398,
      name: 'v1',
      modelId: 1999,
    })
    const res = await SOURCE(
      createGET('/api/lora-assets/civitai/source', {
        modelVersionId: '2266398',
      }),
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'https://civitai.com/models/1999?modelVersionId=2266398',
    )
  })

  it('版本号非法 400；Civitai 回的里没有模型 id 404', async () => {
    expect(
      (
        await SOURCE(
          createGET('/api/lora-assets/civitai/source', {
            modelVersionId: 'abc',
          }),
        )
      ).status,
    ).toBe(400)
    external.civitaiVersions.set('7', { id: 7, name: 'v1' })
    expect(
      (
        await SOURCE(
          createGET('/api/lora-assets/civitai/source', { modelVersionId: '7' }),
        )
      ).status,
    ).toBe(404)
  })
})

// ─── Hugging Face ─────────────────────────────────────────────────

describe('Hugging Face LoRA（假 HF）', () => {
  it('搜索：公开、短缓存，按默认条件去 Hub 列表查', async () => {
    mockUnauthenticated()
    const res = await SEARCH_HF(
      createGET('/api/lora-assets/huggingface', { search: 'style' }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
    expect(await parseJSON(res)).toMatchObject({
      success: true,
      data: { items: [], page: 1, limit: 12 },
    })
    const listCall = external.calls.find((c) =>
      c.url.startsWith('https://huggingface.co/api/models?'),
    )
    expect(new URL(listCall!.url).searchParams.get('sort')).toBe('downloads')
  })

  it('搜索：每页超限 / 类型不在词表里 400，不问 Hub', async () => {
    expect(
      (
        await SEARCH_HF(
          createGET('/api/lora-assets/huggingface', { limit: '999' }),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await SEARCH_HF(
          createGET('/api/lora-assets/huggingface', { type: 'not-a-type' }),
        )
      ).status,
    ).toBe(400)
    expect(external.calls).toEqual([])
  })

  it('README 展示：公开，按仓库 + 版本（缺省 main）抓 README、抽出图', async () => {
    external.hfReadme.set(
      'author/repo@main',
      '# Demo\n\n![sample](https://cdn-uploads.huggingface.co/production/uploads/a.png)\n',
    )
    const res = await HF_SHOWCASE(
      createGET('/api/lora-assets/huggingface/showcase', {
        repoId: 'author/repo',
      }),
    )
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
    const body = await parseJSON<Envelope<{ images: string[] }>>(res)
    expect(body.data!.images).toEqual([
      'https://cdn-uploads.huggingface.co/production/uploads/a.png',
    ])
    expect(external.calls.map((c) => c.url)).toEqual([
      'https://huggingface.co/author/repo/resolve/main/README.md',
    ])
  })

  it('README 展示：缺 repoId 400，不问 HF', async () => {
    expect(
      (
        await HF_SHOWCASE(
          createGET('/api/lora-assets/huggingface/showcase', {}),
        )
      ).status,
    ).toBe(400)
    expect(external.calls).toEqual([])
  })
})

// ─── 训练图直传 ─────────────────────────────────────────────────────

describe('LoRA 训练图直传（真库 + 内存 R2）', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJrMbxgi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgteuuE8uE1jwAAAAABJRU5ErkJggg==',
    'base64',
  )
  type Prepared = {
    uploadUrl: string
    storageKey: string
    headers: Record<string, string>
  }

  it('没登录 401；格式不收 / 大小非正 400；都不发签名', async () => {
    mockUnauthenticated()
    expect(
      (
        await TRAINING_UPLOAD(
          createPOST('/api/lora-training/uploads', {
            mimeType: 'image/png',
            sizeBytes: 10,
          }),
        )
      ).status,
    ).toBe(401)
    mockAuthenticated(me.clerkId)
    for (const body of [
      { mimeType: 'image/svg+xml', sizeBytes: 10 },
      { mimeType: 'image/png', sizeBytes: 0 },
    ]) {
      expect(
        (await TRAINING_UPLOAD(createPOST('/api/lora-training/uploads', body)))
          .status,
      ).toBe(400)
    }
    expect(bucket.presigned).toEqual([])
  })

  it('两步走通：签到我名下的键 → 放进桶 → 收尾按文件头认出格式与尺寸', async () => {
    const prepared = await parseJSON<Envelope<Prepared>>(
      await TRAINING_UPLOAD(
        createPOST('/api/lora-training/uploads', {
          mimeType: 'image/png',
          sizeBytes: PNG.byteLength,
        }),
      ),
    )
    const key = prepared.data!.storageKey
    expect(key.startsWith(`lora-training/${me.id}/`)).toBe(true)
    expect(prepared.data!.headers).toEqual({
      'Content-Type': 'image/png',
      'If-None-Match': '*',
    })

    bucket.objects.set(key, PNG)
    const done = await parseJSON<
      Envelope<{ storageKey: string; mimeType: string; width: number }>
    >(
      await TRAINING_COMPLETE(
        createPOST('/api/lora-training/uploads/complete', {
          storageKey: key,
          sizeBytes: PNG.byteLength,
        }),
      ),
    )
    expect(done.data).toMatchObject({
      storageKey: key,
      mimeType: 'image/png',
      width: 64,
      height: 64,
    })
    expect(bucket.objects.has(key)).toBe(true)
  })

  it('收尾：缺键 400；不是图则失败并把桶里那份清掉', async () => {
    expect(
      (
        await TRAINING_COMPLETE(
          createPOST('/api/lora-training/uploads/complete', { sizeBytes: 4 }),
        )
      ).status,
    ).toBe(400)
    const key = `lora-training/${me.id}/bad.png`
    bucket.objects.set(key, Buffer.from('nope'))
    const res = await TRAINING_COMPLETE(
      createPOST('/api/lora-training/uploads/complete', {
        storageKey: key,
        sizeBytes: 4,
      }),
    )
    expect(res.status).not.toBe(200)
    expect((await parseJSON<Envelope<unknown>>(res)).success).toBe(false)
    expect(bucket.objects.has(key)).toBe(false)
  })
})

// ─── 定时任务心跳 ───────────────────────────────────────────────────

describe('GET /api/health/crons（假 Redis + 假索引）', () => {
  const request = (token?: string) =>
    CRONS(
      new Request('http://localhost:3000/api/health/crons', {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      }),
    )
  type Body = {
    healthy: boolean
    summary: { total: number; healthy: number; stale: number; failed: number }
  }
  const beat = (name: string, ok: boolean, finishedAt = new Date()) =>
    redisStore.values.set(`${CRON_HEARTBEAT.KEY_PREFIX}:${name}`, {
      ok,
      detail: ok ? null : 'boom',
      finishedAt: finishedAt.toISOString(),
    })

  it('没配令牌 503；令牌不对 / 缺 401', async () => {
    delete process.env.HEALTH_CHECK_TOKEN
    expect((await request(HEALTH_TOKEN)).status).toBe(503)
    process.env.HEALTH_CHECK_TOKEN = HEALTH_TOKEN
    expect((await request('wrong')).status).toBe(401)
    expect((await request()).status).toBe(401)
  })

  it('Vercel cron 与索引同步都按时打了卡：健康', async () => {
    for (const name of CRON_JOB_NAMES) beat(name, true)
    const body = await parseJSON<Body>(await request(HEALTH_TOKEN))
    expect(body.healthy).toBe(true)
    expect(body.summary).toEqual({
      total: CRON_JOB_NAMES.length + 1,
      healthy: CRON_JOB_NAMES.length + 1,
      stale: 0,
      failed: 0,
    })
  })

  it('有一条从没打卡：200 但不健康，记 stale', async () => {
    const res = await request(HEALTH_TOKEN)
    expect(res.status).toBe(200)
    const body = await parseJSON<Body>(res)
    expect(body.healthy).toBe(false)
    expect(body.summary.stale).toBe(CRON_JOB_NAMES.length)
  })

  it('按时跑了但失败的，和漏跑的分开数', async () => {
    const [first, ...rest] = CRON_JOB_NAMES
    beat(first!, false)
    for (const name of rest) beat(name, true)
    external.indexStatus = {
      last_completed_at: Date.now() - 30 * 60 * 60 * 1000,
      last_error: null,
    }
    const body = await parseJSON<Body>(await request(HEALTH_TOKEN))
    expect(body.summary).toMatchObject({ failed: 1, stale: 1 })
  })

  it('心跳存储连不上：503', async () => {
    redisStore.down = true
    expect((await request(HEALTH_TOKEN)).status).toBe(503)
  })
})
