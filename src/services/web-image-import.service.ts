import 'server-only'

import {
  WEB_IMAGE_IMPORT_HTML_MIME_PREFIXES,
  WEB_IMAGE_IMPORT_HTML_SCAN_BYTES,
  WEB_IMAGE_IMPORT_MAX_BYTES,
  WEB_IMAGE_IMPORT_SOURCE_IDS,
  WEB_IMAGE_IMPORT_USER_AGENT,
} from '@/constants/web-image-import'
import {
  USER_UPLOAD_ACCEPTED_SHARP_FORMATS,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { ApiRequestError } from '@/lib/errors'
import { assertSafeUrl } from '@/lib/url-guard'
import { logger } from '@/lib/logger'
import { createGeneration } from '@/services/generation.service'
import {
  createImageThumbnailAsset,
  detectTrustedImageMime,
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type { GenerationRecord } from '@/types'
import type { WebImageImportRequest } from '@/types/web-image-import'

/**
 * 联网搜图的**第二条腿**：用户在助手日志条上点中一张预览候选，把它转存进自己的
 * R2 并落成一条 Generation（P3-B，`docs/plans/web-search-import-source-eval-2026-08-30.md`
 * 的 owner 拍板段）。
 *
 * ── ⛔ 这条链与助手的工具环没有任何关系 ────────────────────────────
 * 助手**自己永远不落库**。它的工具环只能搜出预览候选（`search_web_images`），
 * 转存是用户点出来的一次普通 API 调用。两条腿分开是结构性的：工具环那边有一份
 * import 白名单（`assistant-operator.money-gate.test.ts`）挡着 r2 / upload /
 * generation 这类模块，让它顺手 import 一下这个文件，那份白名单当场作废。
 *
 * ── 三条硬闸 ──────────────────────────────────────────────────────
 * ① **不花积分**：这里没有任何 provider 调用、没有扣费、`requestCount: 0`。
 *    导入只花存储，不是一次 generation 提交。
 * ② **`isPublic` 强制 false**（选型报告 §四）：通用图搜的图没有任何人给过许可，
 *    ⛔ 不进公开画廊。这里**不接受调用方传值** —— 写死是唯一守得住的方式。
 * ③ **来源快照必写**（策略 C，导演内核边界 7）：来源 / 页面 / 域名 / 抓取时间
 *    进现有的 `Generation.snapshot Json?` 字段，⛔ 零迁移、零 schema 改动。
 *
 * ── ⚠ 为什么不是 `uploadFromHttpToR2` ──────────────────────────────
 * 施工单点名的是那条流式转存，但它对**第三方域名**这一档缺三样东西，而这三样
 * 正是这条链上会出事的地方：
 *   · **没有字节上限** —— 一个 500MB 的地址就能吃掉函数时间和 R2 账单；
 *   · **不验类型，只抄 `content-type`** —— 一个 200 的 HTML 反爬页会被原样存成
 *     一条「图片」素材，网格里是碎图而库里已经有了那一行（最难查的那种）；
 *   · **拿不到宽高，也没有缩略图** —— 落库会得到 0×0 的行和一张按原图渲染的瓦片。
 * 所以这里走**与 `upload-image.service` 逐条相同**的那条路（取字节 → `sharp` 魔数
 * 判型 → 传原图 + 缩略图 → 落库）：施工单本来就要求「照 upload-image 的先例」，
 * 这条路径是那个先例本身。UA 照样带上（`fetchAsBuffer` 收 headers）——
 * 🔬 空 UA 会被 wikimedia 403。
 */

/** 取字节这一步的失败**要说人话**：用户看到的是自己刚点的那张图为什么没进来。 */
function importFailed(
  code: string,
  status: number,
  i18nKey: string,
  message: string,
): ApiRequestError {
  return new ApiRequestError(code, status, i18nKey, message)
}

function isHtmlResponse(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase()
  return WEB_IMAGE_IMPORT_HTML_MIME_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  )
}

/**
 * 从一张**网页**里取出它自称的主图（P3-D，拍板 22）。
 *
 * ── 为什么是正则而不是 DOM ────────────────────────────────────────
 * 全仓唯一的 HTML 解析器是 `jsdom`，而它在 **devDependencies** 里 —— 为两个 meta
 * 标签把一个解析器提上生产依赖不划算（Engineering Principle 2）。这里要的不是
 * 「解析这张网页」，是「把 `<head>` 里那一行的 content 抠出来」。
 * ⚠ 属性顺序两种都要认（`property` 在前 / `content` 在前）：真实页面两种都有，
 * 只写一种的表现是「某些站永远提不出图」，而那是最难复现的一类。
 *
 * ── 取哪一个 ──────────────────────────────────────────────────────
 * `og:image` 优先（OpenGraph 是事实标准），退到 `twitter:image`。
 * ⛔ 不去扫正文里的 `<img>`：那会把广告位、头像、间隔用的 1×1 都当成候选，
 * 而用户递链接的意思是「这一页上那张主图」。提不出来就明说提不出来。
 */
function extractPageImageUrl(html: string, pageUrl: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["'][^>]*\scontent=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*\s(?:property|name)=["'](?:og:image(?::secure_url|:url)?|twitter:image(?::src)?)["']/i,
  ]
  for (const pattern of patterns) {
    const found = html.match(pattern)?.[1]?.trim()
    if (!found) continue
    try {
      // ⚠ 相对地址是常态（`/media/cover.jpg`）—— 按页面地址补全，⛔ 别原样喂给
      //    fetch（那会得到一句意义不明的 "Invalid URL"）。
      return new URL(found, pageUrl).toString()
    } catch {
      continue
    }
  }
  return null
}

export async function importWebImage(
  clerkId: string,
  input: WebImageImportRequest,
): Promise<GenerationRecord> {
  const dbUser = await ensureUser(clerkId)

  // SSRF：候选地址来自搜索引擎，也就是来自整个互联网 —— 内网地址同样是合法 URL。
  let sourceUrl: string
  try {
    sourceUrl = assertSafeUrl(input.imageUrl, {
      allowedProtocols: ['http:', 'https:'],
    }).toString()
  } catch {
    throw importFailed(
      'WEB_IMAGE_IMPORT_UNSAFE_URL',
      400,
      'errors.webImageImport.unreachable',
      'That image address is not allowed.',
    )
  }

  let buffer: Buffer
  /**
   * 真正落库的那条图片地址。
   *
   * ⚠ 与 `sourceUrl` 分开：用户递来的可能是一张**网页**（拍板 22），那时
   * 「图从哪来」是 og:image，「这是哪一页」才是 sourceUrl —— 来源快照要的是
   * 两条都记下来（策略 C）。合成一个的表现是库里那张图指回一个 HTML 地址。
   */
  let imageUrl = sourceUrl
  let followedFromPage: string | null = null
  try {
    // 🔬 礼仪 UA 是硬要求（wikimedia 空 UA 403）。⛔ 不伪装浏览器。
    const fetched = await fetchAsBuffer(sourceUrl, {
      headers: { 'User-Agent': WEB_IMAGE_IMPORT_USER_AGENT },
      maxBytes: WEB_IMAGE_IMPORT_MAX_BYTES,
    })
    buffer = fetched.buffer

    /**
     * 拿回来的是一张网页 → 提它的 og:image 再取一次（拍板 22）。
     *
     * ⚠ 只跟一跳：og:image 指向的**必须**是一张图，它再是网页就是这条链在骗人，
     * 那时按「提不出图」失败。⛔ 不做递归跟随 —— 那是一个爬虫，不是一次导入。
     */
    if (isHtmlResponse(fetched.mimeType)) {
      const html = buffer
        .subarray(0, WEB_IMAGE_IMPORT_HTML_SCAN_BYTES)
        .toString('utf8')
      const found = extractPageImageUrl(html, sourceUrl)
      if (!found) {
        throw importFailed(
          'WEB_IMAGE_IMPORT_NO_IMAGE_ON_PAGE',
          422,
          'errors.webImageImport.noImageOnPage',
          'That page does not declare a main image (no og:image).',
        )
      }
      // SSRF 再来一道：这条地址是**那张网页说了算**的，比搜索结果还不可信。
      imageUrl = assertSafeUrl(found, {
        allowedProtocols: ['http:', 'https:'],
      }).toString()
      followedFromPage = sourceUrl
      const followed = await fetchAsBuffer(imageUrl, {
        headers: { 'User-Agent': WEB_IMAGE_IMPORT_USER_AGENT },
        maxBytes: WEB_IMAGE_IMPORT_MAX_BYTES,
      })
      buffer = followed.buffer
    }
  } catch (error) {
    // 「这一页没有主图」是已经说清楚的失败，⛔ 别被下面那条笼统的 502 盖掉。
    if (error instanceof ApiRequestError) throw error
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('web image import fetch failed', {
      userId: dbUser.id,
      domain: input.domain,
      error: message,
    })
    // 🔬 选型报告：通用网图直链约三成 403（Cloudflare JS challenge，补 Referer
    //    无效）。这不是 bug，是这条来源的常态 —— 所以文案说「换一张」，
    //    ⛔ 别做自动换下一张：点哪张是用户的决定。
    throw importFailed(
      message.includes('exceeds maximum size')
        ? 'WEB_IMAGE_IMPORT_TOO_LARGE'
        : 'WEB_IMAGE_IMPORT_UNREACHABLE',
      502,
      message.includes('exceeds maximum size')
        ? 'errors.webImageImport.tooLarge'
        : 'errors.webImageImport.unreachable',
      message,
    )
  }

  // ⛔ 不信 content-type：判型走 libvips 的魔数（SVG 有意不在允许集里 —— 它能带脚本）。
  let trustedMimeType: string
  let width: number
  let height: number
  try {
    const detected = await detectTrustedImageMime(
      buffer,
      USER_UPLOAD_ACCEPTED_SHARP_FORMATS,
    )
    trustedMimeType = detected.mimeType
    width = detected.width
    height = detected.height
  } catch (error) {
    throw importFailed(
      'WEB_IMAGE_IMPORT_UNSUPPORTED',
      415,
      'errors.webImageImport.unsupported',
      error instanceof Error ? error.message : 'Unsupported image file',
    )
  }

  const storageKey = generateStorageKey('IMAGE', dbUser.id)
  const [publicUrl, thumbnail] = await Promise.all([
    uploadToR2({ data: buffer, key: storageKey, mimeType: trustedMimeType }),
    createImageThumbnailAsset({
      sourceBuffer: buffer,
      sourceStorageKey: storageKey,
    }),
  ])

  const generation = await createGeneration({
    url: publicUrl,
    storageKey,
    mimeType: trustedMimeType,
    thumbnailUrl: thumbnail.thumbnailUrl,
    thumbnailStorageKey: thumbnail.thumbnailStorageKey,
    width,
    height,
    prompt: input.title ?? '',
    /**
     * ⚠ 复用 `USER_UPLOAD_PROVIDER` 而不是新造一个 provider 值：素材库按 `model`
     * 分桶（「本地素材」那一栏），新值会落进一个没人认得的桶里，而这张图对用户
     * 来说就是「我从网上拿进来的一张素材」，与上传同一类。**真正的来源写在
     * `snapshot` 里** —— 那才是策略 C 要的那份记录。
     */
    model: USER_UPLOAD_PROVIDER,
    provider: USER_UPLOAD_PROVIDER,
    // 一次导入不是一次生成：没调 provider、没扣积分。
    requestCount: 0,
    outputType: 'IMAGE',
    isFreeGeneration: true,
    /**
     * ⛔ 硬闸，不接受调用方传值（选型报告 §四）：通用图搜的图没有任何人给过许可。
     * `createGeneration` 的默认值也是 false，这里显式写出来是为了让「有人加了一个
     * `isPublic` 参数」这件事在这一行就看得见。
     */
    isPublic: false,
    userId: dbUser.id,
    // 策略 C 的那份记录 —— 现有 `Json?` 字段，零迁移。
    snapshot: {
      source: WEB_IMAGE_IMPORT_SOURCE_IDS.serper,
      // ⚠ 记**真正取到字节的那条地址**：跟过一跳时它是 og:image，不是用户粘的
      //    那张网页 —— 后者记在 `pageUrl` 里。两条都留着才叫来源记录（策略 C）。
      imageUrl,
      ...(input.pageUrl || followedFromPage
        ? { pageUrl: input.pageUrl ?? followedFromPage ?? '' }
        : {}),
      ...(input.domain ? { domain: input.domain } : {}),
      retrievedAt: new Date().toISOString(),
    },
  })

  logger.info('web image imported', {
    userId: dbUser.id,
    generationId: generation.id,
    domain: input.domain,
    bytes: buffer.byteLength,
    // 跟过一跳的那些单独看得出来 —— 拍板 22 的两条路在日志里也该分得开。
    followedPage: followedFromPage !== null,
  })

  return generation
}
