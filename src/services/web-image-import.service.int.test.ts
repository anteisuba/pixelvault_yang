/**
 * L2a 真库：联网搜图转存（用户点中一张候选 → 进自己的桶 → 落一行素材）。
 * 只假边界：DNS（`node:dns`，一律解析成公网地址）、站外网站与执行 Worker（fetch）、R2 上传。
 * 取字节（真 `fetchAsBuffer` + `safeFetch`）、sharp 判型、幂等查库、落库全真：核库里的行与发出去的请求。
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
// 只替上传：取字节照用真的（站外请求在 fetch 边界上替）。
vi.mock('@/services/storage/r2', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/storage/r2')>()
  const { fakeR2Module } = await import('@/test/int/fake-r2')
  return { ...fakeR2Module(real), fetchAsBuffer: real.fetchAsBuffer }
})

import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import {
  WEB_IMAGE_IMPORT_MAX_BYTES,
  WEB_IMAGE_IMPORT_SOURCE_IDS,
  WEB_IMAGE_IMPORT_USER_AGENT,
} from '@/constants/web-image-import'
import { db } from '@/lib/db'
import { encodePng } from '@/lib/image-pixels'
import { importWebImage } from '@/services/web-image-import.service'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { installFakeExecutionWorker } from '@/test/int/execution-worker'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'

const IMAGE = 'https://cdn.example.com/figure.png'
const REQUEST = {
  imageUrl: IMAGE,
  pageUrl: 'https://example.com/post/a',
  domain: 'example.com',
  title: 'PVC figure studio shot',
}

type Site = (headers: Headers) => Response | Promise<Response>

let me: Awaited<ReturnType<typeof createTestUser>>
/** 站外网站：地址 → 回什么。没登记的 404。 */
let sites: Map<string, Site>
let siteRequests: Array<{ url: string; headers: Headers }>
let picture: Buffer

const servesImage =
  (buffer = picture, mimeType = 'image/png'): Site =>
  () =>
    new Response(new Uint8Array(buffer), {
      headers: { 'content-type': mimeType },
    })
const servesStatus =
  (status: number): Site =>
  () =>
    new Response('nope', { status })
const servesHtml =
  (html: string): Site =>
  () =>
    new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })

const myRows = () =>
  db.generation.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: 'asc' },
  })
const snapshotOf = (row: { snapshot: unknown }) =>
  row.snapshot as Record<string, string>

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  picture = await encodePng({
    width: 16,
    height: 12,
    data: new Uint8Array(16 * 12 * 4).fill(200),
  })
  sites = new Map([[IMAGE, servesImage()]])
  siteRequests = []
  installFakeExecutionWorker({
    other: async (url, init) => {
      const headers = new Headers(init?.headers)
      siteRequests.push({ url, headers })
      const site = sites.get(url)
      return site ? site(headers) : new Response('not found', { status: 404 })
    },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('联网图片转存 · 硬闸', () => {
  it('落一行私有素材：不花积分、宽高按实测、来源快照齐全、原图进自己的桶', async () => {
    const result = await importWebImage(me.clerkId, REQUEST)

    expect(result.reused).toBe(false)
    const [row] = await myRows()
    expect(result.generation.id).toBe(row!.id)
    expect(row).toMatchObject({
      isPublic: false,
      requestCount: 0,
      isFreeGeneration: true,
      width: 16,
      height: 12,
      mimeType: 'image/png',
      model: USER_UPLOAD_PROVIDER,
      provider: USER_UPLOAD_PROVIDER,
      prompt: REQUEST.title,
      thumbnailStorageKey: expect.stringContaining('thumbnail'),
    })
    expect(row!.url).toBe(`${FAKE_CDN}/${row!.storageKey}`)
    expect(fakeBucket.objects.get(row!.storageKey)).toEqual(picture)
    const snapshot = snapshotOf(row!)
    expect(snapshot).toMatchObject({
      source: WEB_IMAGE_IMPORT_SOURCE_IDS.serper,
      imageUrl: IMAGE,
      pageUrl: REQUEST.pageUrl,
      domain: REQUEST.domain,
    })
    expect(Number.isNaN(Date.parse(snapshot.retrievedAt!))).toBe(false)
  })

  it('🔬 礼仪 UA 必须发出去，⛔ 不伪装浏览器', async () => {
    await importWebImage(me.clerkId, REQUEST)

    const site = siteRequests.find((r) => r.url === IMAGE)!
    expect(site.headers.get('user-agent')).toBe(WEB_IMAGE_IMPORT_USER_AGENT)
    expect(site.headers.has('referer')).toBe(false)
    expect(WEB_IMAGE_IMPORT_USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari/)
  })

  it('没给标题：提示词落空串；没给页面 / 域名：快照里也没有', async () => {
    await importWebImage(me.clerkId, { imageUrl: IMAGE })

    const [row] = await myRows()
    expect(row!.prompt).toBe('')
    expect(snapshotOf(row!)).not.toHaveProperty('pageUrl')
    expect(snapshotOf(row!)).not.toHaveProperty('domain')
  })

  it('⛔ 内网地址在取字节之前就被拦下（SSRF）', async () => {
    await expect(
      importWebImage(me.clerkId, {
        imageUrl: 'http://169.254.169.254/latest/meta-data/',
      }),
    ).rejects.toMatchObject({ errorCode: 'WEB_IMAGE_IMPORT_UNSAFE_URL' })
    expect(siteRequests).toEqual([])
    expect(await myRows()).toEqual([])
  })

  it('⛔ 200 的反爬页 / 不是图的字节：判型走魔数，拒 415，⛔ 进桶', async () => {
    sites.set(
      IMAGE,
      servesImage(Buffer.from('not an image at all'), 'image/png'),
    )

    await expect(importWebImage(me.clerkId, REQUEST)).rejects.toMatchObject({
      errorCode: 'WEB_IMAGE_IMPORT_UNSUPPORTED',
    })
    expect(fakeBucket.uploads).toEqual([])
    expect(await myRows()).toEqual([])
  })
})

describe('联网图片转存 · 取不到图时说清原因', () => {
  it.each([
    [403, 'WEB_IMAGE_IMPORT_FORBIDDEN', 'errors.webImageImport.forbidden'],
    [404, 'WEB_IMAGE_IMPORT_NOT_FOUND', 'errors.webImageImport.notFound'],
    [429, 'WEB_IMAGE_IMPORT_RATE_LIMITED', 'errors.webImageImport.rateLimited'],
    [503, 'WEB_IMAGE_IMPORT_SERVER_ERROR', 'errors.webImageImport.serverError'],
  ])('站点回 %s → %s', async (status, code, i18nKey) => {
    sites.set(IMAGE, servesStatus(status))

    await expect(importWebImage(me.clerkId, REQUEST)).rejects.toMatchObject({
      errorCode: code,
      i18nKey,
    })
    expect(await myRows()).toEqual([])
  })

  it.each([
    [
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
      'WEB_IMAGE_IMPORT_TIMEOUT',
    ],
    [new TypeError('fetch failed'), 'WEB_IMAGE_IMPORT_UNREACHABLE'],
  ])('网络层出错（%s）→ %s', async (error, code) => {
    sites.set(IMAGE, () => {
      throw error
    })

    await expect(importWebImage(me.clerkId, REQUEST)).rejects.toMatchObject({
      errorCode: code,
    })
  })

  it('超过字节上限：tooLarge（与「取不到」分开）', async () => {
    sites.set(
      IMAGE,
      () =>
        new Response(new Uint8Array(picture), {
          headers: {
            'content-type': 'image/png',
            'content-length': String(WEB_IMAGE_IMPORT_MAX_BYTES * 2),
          },
        }),
    )

    await expect(importWebImage(me.clerkId, REQUEST)).rejects.toMatchObject({
      errorCode: 'WEB_IMAGE_IMPORT_TOO_LARGE',
    })
  })

  it('403 时带 Referer（作品页地址）重试一次，通了就照常落库', async () => {
    sites.set(IMAGE, (headers) =>
      headers.get('referer') === REQUEST.pageUrl
        ? servesImage()(headers)
        : servesStatus(403)(headers),
    )

    await importWebImage(me.clerkId, REQUEST)

    expect(siteRequests.filter((r) => r.url === IMAGE)).toHaveLength(2)
    expect(await myRows()).toHaveLength(1)
  })

  it('没有作品页时 Referer 回落到图自己的 origin', async () => {
    sites.set(IMAGE, (headers) =>
      headers.get('referer') === 'https://cdn.example.com'
        ? servesImage()(headers)
        : servesStatus(403)(headers),
    )

    await importWebImage(me.clerkId, { imageUrl: IMAGE })

    expect(await myRows()).toHaveLength(1)
  })

  it('⛔ 只对 403 重试，且只重试一次', async () => {
    sites.set(IMAGE, servesStatus(404))
    await expect(importWebImage(me.clerkId, REQUEST)).rejects.toMatchObject({
      errorCode: 'WEB_IMAGE_IMPORT_NOT_FOUND',
    })
    expect(siteRequests.filter((r) => r.url === IMAGE)).toHaveLength(1)

    siteRequests = []
    sites.set(IMAGE, servesStatus(403))
    await expect(importWebImage(me.clerkId, REQUEST)).rejects.toMatchObject({
      errorCode: 'WEB_IMAGE_IMPORT_FORBIDDEN',
    })
    expect(siteRequests.filter((r) => r.url === IMAGE)).toHaveLength(2)
  })
})

/** ⭐ 拍板 22：用户递来的地址十有八九是一张作品页；判据是 content-type，⛔ 不是扩展名。 */
describe('联网图片转存 · 网页 → og:image', () => {
  const PAGE = 'https://example.com/artwork/12345'
  const DIRECT = 'https://cdn.example.com/artwork/12345/full.png'

  beforeEach(() => {
    sites.set(DIRECT, servesImage())
  })

  it.each([
    ['og:image', `<meta property="og:image" content="${DIRECT}">`],
    ['content 在前', `<meta content="${DIRECT}" property="og:image"/>`],
    ['退到 twitter:image', `<meta name="twitter:image" content="${DIRECT}">`],
  ])('%s：提出直链再取一次，快照两条都记', async (_label, meta) => {
    sites.set(
      PAGE,
      servesHtml(`<html><head>${meta}</head><body>x</body></html>`),
    )

    await importWebImage(me.clerkId, { imageUrl: PAGE })

    const followed = siteRequests.find((r) => r.url === DIRECT)!
    expect(followed.headers.get('user-agent')).toBe(WEB_IMAGE_IMPORT_USER_AGENT)
    const [row] = await myRows()
    expect(snapshotOf(row!)).toMatchObject({ imageUrl: DIRECT, pageUrl: PAGE })
    expect(row!.width).toBe(16)
  })

  it('相对地址按页面地址补全', async () => {
    const relative = 'https://example.com/media/cover.jpg'
    sites.set(relative, servesImage())
    sites.set(
      PAGE,
      servesHtml(
        '<html><head><meta property="og:image" content="/media/cover.jpg"></head></html>',
      ),
    )

    await importWebImage(me.clerkId, { imageUrl: PAGE })

    const [row] = await myRows()
    expect(snapshotOf(row!).imageUrl).toBe(relative)
  })

  it('⛔ 提不出图就明说，不去扫正文里的 <img>', async () => {
    sites.set(
      PAGE,
      servesHtml(
        '<html><head><title>x</title></head><body><img src="https://ads.example.com/1x1.gif"></body></html>',
      ),
    )

    await expect(
      importWebImage(me.clerkId, { imageUrl: PAGE }),
    ).rejects.toMatchObject({
      errorCode: 'WEB_IMAGE_IMPORT_NO_IMAGE_ON_PAGE',
      i18nKey: 'errors.webImageImport.noImageOnPage',
    })
    expect(siteRequests.map((r) => r.url)).toEqual([PAGE])
    expect(await myRows()).toEqual([])
  })
})

/** 🔬 2026-09-07：同一张候选有两条导入路，各调一次这条服务 —— 幂等只能落在这里。 */
describe('联网图片转存 · 幂等', () => {
  it('同一 URL 连着来两次只落一条；第二次 ⛔ 打站外下载', async () => {
    const first = await importWebImage(me.clerkId, REQUEST)
    siteRequests = []
    const second = await importWebImage(me.clerkId, REQUEST)

    expect(first.reused).toBe(false)
    expect(second).toMatchObject({
      reused: true,
      generation: { id: first.generation.id },
    })
    expect(siteRequests.filter((r) => r.url === IMAGE)).toEqual([])
    expect(await myRows()).toHaveLength(1)
  })

  it('别人库里有同一张：照样给我新落一条（只认自己的库）', async () => {
    const other = await createTestUser()
    await importWebImage(other.clerkId, REQUEST)

    const mine = await importWebImage(me.clerkId, REQUEST)

    expect(mine.reused).toBe(false)
    expect(await myRows()).toHaveLength(1)
  })

  it('取图那几秒里被另一条路抢先落库 → 落库前再查一道接住，⛔ 写第二条', async () => {
    let raced: string | null = null
    sites.set(IMAGE, async (headers) => {
      // 另一条导入路在这次下载期间落好了同一张。
      const row = await db.generation.create({
        data: {
          userId: me.id,
          url: `${FAKE_CDN}/raced.png`,
          storageKey: 'raced.png',
          prompt: '',
          model: USER_UPLOAD_PROVIDER,
          provider: USER_UPLOAD_PROVIDER,
          snapshot: { imageUrl: IMAGE },
        },
      })
      raced = row.id
      return servesImage()(headers)
    })

    const result = await importWebImage(me.clerkId, REQUEST)

    expect(result).toMatchObject({ reused: true, generation: { id: raced } })
    expect(await myRows()).toHaveLength(1)
    expect(fakeBucket.uploads).toEqual([])
  })

  it('⭐ 只按这张图自己的地址认，⛔ 按页面地址（同一页的第二张不能被认成第一张）', async () => {
    const second = 'https://cdn.example.com/figure-2.png'
    sites.set(second, servesImage())

    await importWebImage(me.clerkId, REQUEST)
    const result = await importWebImage(me.clerkId, {
      ...REQUEST,
      imageUrl: second,
    })

    expect(result.reused).toBe(false)
    expect((await myRows()).map((row) => snapshotOf(row).imageUrl)).toEqual([
      IMAGE,
      second,
    ])
  })
})
