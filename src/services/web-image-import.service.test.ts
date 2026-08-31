import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FAKE_DB_USER, FAKE_GENERATION } from '@/test/api-helpers'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import {
  WEB_IMAGE_IMPORT_MAX_BYTES,
  WEB_IMAGE_IMPORT_SOURCE_IDS,
  WEB_IMAGE_IMPORT_USER_AGENT,
} from '@/constants/web-image-import'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/generation.service', () => ({
  createGeneration: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => ({
  detectTrustedImageMime: vi.fn(),
  generateStorageKey: vi.fn(
    () => 'generations/db_user_123/image/2026-08-30_x.png',
  ),
  uploadToR2: vi.fn(),
  createImageThumbnailAsset: vi.fn(),
  fetchAsBuffer: vi.fn(),
}))

import { ensureUser } from '@/services/user.service'
import { createGeneration } from '@/services/generation.service'
import {
  createImageThumbnailAsset,
  detectTrustedImageMime,
  fetchAsBuffer,
  uploadToR2,
} from '@/services/storage/r2'
import { importWebImage } from '@/services/web-image-import.service'

const REQUEST = {
  imageUrl: 'https://cdn.example.com/figure.jpg',
  pageUrl: 'https://example.com/post/a',
  domain: 'example.com',
  title: 'PVC figure studio shot',
}

function createdInput(): Record<string, unknown> {
  return vi.mocked(createGeneration).mock.calls[0][0] as unknown as Record<
    string,
    unknown
  >
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ensureUser).mockResolvedValue(
    FAKE_DB_USER as unknown as Awaited<ReturnType<typeof ensureUser>>,
  )
  vi.mocked(fetchAsBuffer).mockResolvedValue({
    buffer: Buffer.from('bytes'),
    mimeType: 'image/jpeg',
  })
  vi.mocked(detectTrustedImageMime).mockResolvedValue({
    format: 'jpeg',
    mimeType: 'image/jpeg',
    width: 1600,
    height: 1200,
  })
  vi.mocked(uploadToR2).mockResolvedValue('https://cdn.pixelvault.test/a.jpg')
  vi.mocked(createImageThumbnailAsset).mockResolvedValue({
    thumbnailUrl: 'https://cdn.pixelvault.test/a.thumbnail.webp',
    thumbnailStorageKey: 'generations/db_user_123/image/a.thumbnail.webp',
  })
  vi.mocked(createGeneration).mockResolvedValue(
    FAKE_GENERATION as unknown as Awaited<ReturnType<typeof createGeneration>>,
  )
})

describe('联网图片转存 · 硬闸', () => {
  it('⛔ isPublic 强制 false —— 通用图搜的图不进公开画廊', async () => {
    await importWebImage('clerk_test_user', REQUEST)
    expect(createdInput().isPublic).toBe(false)
  })

  it('⛔ 不花积分：requestCount 为 0，且这条链上没有任何 provider 调用', async () => {
    await importWebImage('clerk_test_user', REQUEST)
    expect(createdInput().requestCount).toBe(0)
    expect(createdInput().isFreeGeneration).toBe(true)
  })

  it('⭐ 来源快照写进现有 snapshot 字段（零迁移）：来源 / 原图 / 页面 / 域名 / 抓取时间', async () => {
    await importWebImage('clerk_test_user', REQUEST)
    const snapshot = createdInput().snapshot as Record<string, string>
    expect(snapshot.source).toBe(WEB_IMAGE_IMPORT_SOURCE_IDS.serper)
    expect(snapshot.imageUrl).toBe(REQUEST.imageUrl)
    expect(snapshot.pageUrl).toBe(REQUEST.pageUrl)
    expect(snapshot.domain).toBe(REQUEST.domain)
    expect(Number.isNaN(Date.parse(snapshot.retrievedAt))).toBe(false)
  })

  it('🔬 礼仪 UA 必须发出去（空 UA 会被 wikimedia 403），且带字节上限', async () => {
    await importWebImage('clerk_test_user', REQUEST)
    expect(fetchAsBuffer).toHaveBeenCalledWith(REQUEST.imageUrl, {
      headers: { 'User-Agent': WEB_IMAGE_IMPORT_USER_AGENT },
      maxBytes: WEB_IMAGE_IMPORT_MAX_BYTES,
    })
    // ⛔ 不伪装浏览器：UA 里不许出现 Mozilla/Chrome 这类字样。
    expect(WEB_IMAGE_IMPORT_USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari/)
  })

  it('落库的宽高来自 sharp 实测，不是调用方说的数', async () => {
    await importWebImage('clerk_test_user', REQUEST)
    expect(createdInput().width).toBe(1600)
    expect(createdInput().height).toBe(1200)
    expect(createdInput().mimeType).toBe('image/jpeg')
    expect(createdInput().model).toBe(USER_UPLOAD_PROVIDER)
  })

  it('⛔ 内网地址在取字节之前就被拦下（SSRF）', async () => {
    await expect(
      importWebImage('clerk_test_user', {
        imageUrl: 'http://169.254.169.254/latest/meta-data/',
      }),
    ).rejects.toMatchObject({ errorCode: 'WEB_IMAGE_IMPORT_UNSAFE_URL' })
    expect(fetchAsBuffer).not.toHaveBeenCalled()
    expect(createGeneration).not.toHaveBeenCalled()
  })

  it('取不到图（🔬 通用网图约三成 403）→ 报 unreachable，且不落任何库', async () => {
    vi.mocked(fetchAsBuffer).mockRejectedValue(
      new Error(
        'Failed to fetch image (403): https://cdn.example.com/figure.jpg',
      ),
    )
    await expect(
      importWebImage('clerk_test_user', REQUEST),
    ).rejects.toMatchObject({
      errorCode: 'WEB_IMAGE_IMPORT_UNREACHABLE',
      i18nKey: 'errors.webImageImport.unreachable',
    })
    expect(createGeneration).not.toHaveBeenCalled()
  })

  it('超过字节上限时报 tooLarge（与「取不到」分开，两者的下一步不同）', async () => {
    vi.mocked(fetchAsBuffer).mockRejectedValue(
      new Error('Image exceeds maximum size of 20971520 bytes (got 41943040).'),
    )
    await expect(
      importWebImage('clerk_test_user', REQUEST),
    ).rejects.toMatchObject({ errorCode: 'WEB_IMAGE_IMPORT_TOO_LARGE' })
  })

  it('⛔ 一个 200 的 HTML 反爬页不会被存成「图片」—— 判型走 sharp 魔数', async () => {
    vi.mocked(detectTrustedImageMime).mockRejectedValue(
      new Error('Unsupported or corrupted image file'),
    )
    await expect(
      importWebImage('clerk_test_user', REQUEST),
    ).rejects.toMatchObject({ errorCode: 'WEB_IMAGE_IMPORT_UNSUPPORTED' })
    expect(uploadToR2).not.toHaveBeenCalled()
    expect(createGeneration).not.toHaveBeenCalled()
  })

  it('没给标题时 prompt 落空串，不编一个出来', async () => {
    await importWebImage('clerk_test_user', {
      imageUrl: REQUEST.imageUrl,
    })
    expect(createdInput().prompt).toBe('')
    const snapshot = createdInput().snapshot as Record<string, string>
    expect(snapshot).not.toHaveProperty('pageUrl')
    expect(snapshot).not.toHaveProperty('domain')
  })
})

/**
 * ⭐ P3-D（拍板 22）：用户递来的地址十有八九是一张**作品页**，不是原图直链。
 *
 * ⚠ 判据是 **content-type**，⛔ 不是扩展名（台账 BH）：那些页面的地址常常长得
 * 像图片（`.../photo/12345`）。
 */
describe('联网图片转存 · 网页 → og:image（拍板 22）', () => {
  const PAGE = 'https://example.com/artwork/12345'
  const DIRECT = 'https://cdn.example.com/artwork/12345/full.jpg'

  function servePage(html: string): void {
    vi.mocked(fetchAsBuffer)
      .mockResolvedValueOnce({
        buffer: Buffer.from(html, 'utf8'),
        mimeType: 'text/html; charset=utf-8',
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from('bytes'),
        mimeType: 'image/jpeg',
      })
  }

  it('拿回来的是网页就提 og:image 再取一次，落库的是那条直链', async () => {
    servePage(
      `<html><head><meta property="og:image" content="${DIRECT}"></head><body>x</body></html>`,
    )

    await importWebImage('clerk_test_user', { imageUrl: PAGE })

    expect(vi.mocked(fetchAsBuffer).mock.calls[1][0]).toBe(DIRECT)
    // 每一跳都带礼仪 UA（🔬 wikimedia 空 UA 403）。
    expect(vi.mocked(fetchAsBuffer).mock.calls[1][1]).toMatchObject({
      headers: { 'User-Agent': WEB_IMAGE_IMPORT_USER_AGENT },
    })
    const snapshot = createdInput().snapshot as Record<string, string>
    // ⭐ 两条都记：字节从哪来（直链）、这是哪一页（用户粘的那条）。
    expect(snapshot.imageUrl).toBe(DIRECT)
    expect(snapshot.pageUrl).toBe(PAGE)
  })

  it('属性顺序反过来（content 在前）照样认得出来', async () => {
    servePage(
      `<html><head><meta content="${DIRECT}" property="og:image"/></head></html>`,
    )
    await importWebImage('clerk_test_user', { imageUrl: PAGE })
    expect(vi.mocked(fetchAsBuffer).mock.calls[1][0]).toBe(DIRECT)
  })

  it('没有 og:image 时退到 twitter:image', async () => {
    servePage(
      `<html><head><meta name="twitter:image" content="${DIRECT}"></head></html>`,
    )
    await importWebImage('clerk_test_user', { imageUrl: PAGE })
    expect(vi.mocked(fetchAsBuffer).mock.calls[1][0]).toBe(DIRECT)
  })

  it('相对地址按页面地址补全（⛔ 别原样喂给 fetch）', async () => {
    servePage(
      '<html><head><meta property="og:image" content="/media/cover.jpg"></head></html>',
    )
    await importWebImage('clerk_test_user', { imageUrl: PAGE })
    expect(vi.mocked(fetchAsBuffer).mock.calls[1][0]).toBe(
      'https://example.com/media/cover.jpg',
    )
  })

  it('⛔ 提不出图就明说，不去扫正文里的 <img>（广告位不是用户要的那张）', async () => {
    vi.mocked(fetchAsBuffer).mockResolvedValueOnce({
      buffer: Buffer.from(
        '<html><head><title>x</title></head><body><img src="https://ads.example.com/1x1.gif"></body></html>',
        'utf8',
      ),
      mimeType: 'text/html',
    })

    await expect(
      importWebImage('clerk_test_user', { imageUrl: PAGE }),
    ).rejects.toMatchObject({
      errorCode: 'WEB_IMAGE_IMPORT_NO_IMAGE_ON_PAGE',
      i18nKey: 'errors.webImageImport.noImageOnPage',
    })
    // ⛔ 只取了一次就停了，库里一个字都没落。
    expect(fetchAsBuffer).toHaveBeenCalledTimes(1)
    expect(createGeneration).not.toHaveBeenCalled()
  })

  it('直链照旧只取一次 —— 网页那条路不该拖慢正常导入', async () => {
    await importWebImage('clerk_test_user', REQUEST)
    expect(fetchAsBuffer).toHaveBeenCalledTimes(1)
    const snapshot = createdInput().snapshot as Record<string, string>
    expect(snapshot.imageUrl).toBe(REQUEST.imageUrl)
  })
})
