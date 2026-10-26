/* eslint-disable @typescript-eslint/ban-ts-comment -- This standalone Worker is type-checked by Wrangler. */
// @ts-nocheck — 本文件面向 Cloudflare Workers 运行时（caches.default /
// ExecutionContext / RequestInit.cf 等全局），由 wrangler(esbuild) 在部署时打包 +
// 类型检查。项目根 tsconfig 的 `**/*.ts` 会扫到这里，但它的 lib 是 dom/esnext，
// Worker 全局与 DOM 全局（如 CacheStorage）冲突；根 tsconfig 又对该文件名有写保护
// 无法加 exclude，故用 @ts-nocheck 让应用侧 tsc 跳过本文件（不影响 wrangler 部署）。
/**
 * pixelvault-civitai-image-proxy — Civitai 封面/来源图边缘缓存代理。
 *
 * 根因（诊断实测）：公开 LoRA 库封面、详情大图、来源图配方缩略图此前都从**浏览器
 * 直连** image.civitai.com。打开一页会一次性并发几十张 `<img>`，Civitai 的
 * Cloudflare 按单客户端限流，这波突发被回 HTTP 429/503 → 图全部加载失败（封面
 * 全黑；只有抢先挤过限流器的一两张能出）。同样的图**串行** curl 反而全 200——
 * 证明不是被墙 / 不是 URL 坏，纯粹是单客户端突发触发了 Civitai 的限流。
 *
 * 修复：浏览器不再直连 hotlink，改打这个自家 Worker（自定义域 img.anteisuba.com）。
 *   img.anteisuba.com/<bucket>/<uuid>/<transform>/<file>
 *     → https://image.civitai.com/<bucket>/<uuid>/<transform>/<file>
 * 命中 Cloudflare 边缘缓存直接回；未命中才由 Worker 服务端拉 Civitai（跟随
 * image.civitai.com → image-b2 的 301），Cloudflare→Cloudflare 非单客户端突发，
 * 不触发浏览器那种限流，然后长期缓存。封面在所有用户间共享，缓存很快焐热，绝大
 * 多数请求都是边缘命中，Civitai 只会看到零星的回源。
 *
 * 目标 host 硬编码为 image.civitai.com（不是开放代理，无 SSRF 面）；路径必须形如
 * `/<bucket>/<uuid>/<transform>/<file.ext>`，其余一律 404。
 *
 * ── 第二支：`/hotlink/<host>/<path>`（助手找图，2026-10-15）────────────────
 * 助手面板里的网图（联网候选、回答底下的媒体条、灯箱原图）浏览器直连时已经
 * 不带 Referer（`referrerPolicy="no-referrer"`），大多数图床就放行了；剩下几家
 * **只认自己站内的 Referer**（pixiv 的 pximg 最出名，空 Referer 也是 403）。这一支
 * 替浏览器去取，并带上**那一家自己的** Referer：
 *   img.anteisuba.com/hotlink/i.pximg.net/img-master/…/x.jpg
 *     → https://i.pximg.net/img-master/…/x.jpg   (Referer: https://www.pixiv.net/)
 * ⛔ 不是开放代理：host 只认 `HOTLINK_HOSTS` 那几家图床（及其子域），跳转也只跟到
 * 同一张名单里；回来的必须是图（魔数判型，同上面那一支），否则 415。
 * 标签库的 Danbooru 样图（cdn.donmai.us）也走这一支，见 `HOTLINK_HOSTS` 里那一条。
 * 前端改写在 `src/lib/third-party-image-url.ts`（名单 = `WEB_IMAGE_HOTLINK_PROXY`，
 * 与这里的 `HOTLINK_HOSTS` 两处要一起改）。
 */

const CIVITAI_IMAGE_HOST = 'image.civitai.com'

/** 热链那一支的路径前缀（前端 `WEB_IMAGE_HOTLINK_PROXY.pathPrefix` 同一个值）。 */
const HOTLINK_PREFIX = '/hotlink/'

/**
 * 只认站内 Referer 的图床 → 取图时带上的那一家 Referer。
 * ⚠ 按**注册域**认（`host === suffix` 或 `*.suffix`）：外人造不出这几个域的子域，
 * 所以后缀匹配在这里是安全的；`evilpximg.net` / `i.pximg.net.evil.com` 都不命中。
 */
const HOTLINK_HOSTS = [
  { suffix: 'pximg.net', referer: 'https://www.pixiv.net/' },
  { suffix: 'hdslb.com', referer: 'https://www.bilibili.com/' },
  { suffix: 'sinaimg.cn', referer: 'https://weibo.com/' },
  // Danbooru 的 cdn.donmai.us 不看 Referer，看的是「像不像机器人」：Cloudflare 判可疑
  // （无头浏览器、部分机房 / VPN 出口）就回 403 质询页，那一页带
  // `Cross-Origin-Resource-Policy: same-origin`，浏览器报 NotSameOrigin、样图空白。
  // Worker 服务端取不吃这一套，还能把标签库样图在所有用户间共享缓存（2026-10-26）。
  { suffix: 'donmai.us', referer: 'https://danbooru.donmai.us/' },
] as const

/** 合法主机名：小写字母数字与连字符组成的点分标签（⛔ 端口、userinfo、百分号转义）。 */
const HOSTNAME_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/** 一张网图的上限（声明了长度才拦得住；没声明的照常流式回）。 */
const HOTLINK_MAX_BYTES = 20 * 1024 * 1024

/** 跟几次跳转（只跟到同一张名单里）。 */
const HOTLINK_MAX_REDIRECTS = 3

/**
 * 只认自家页面来的请求（防别人拿它当免费的 pixiv 图床）：面板打这一支时
 * `referrerPolicy="origin"`，带着 `https://www.anteisuba.com`。⛔ 不带 Referer / Origin
 * 的一律 403 —— 命令行能伪造头，但别的网站嵌我们的地址、`no-referrer` 偷用都挡得住。
 */
const HOTLINK_PAGE_HOSTS = ['anteisuba.com', 'localhost', '127.0.0.1'] as const

function hotlinkRule(host: string) {
  return HOTLINK_HOSTS.find(
    (rule) => host === rule.suffix || host.endsWith(`.${rule.suffix}`),
  )
}

/** `/hotlink/<host>/<path>` → 目标地址 + 该带的 Referer；不合规矩就是 `null`（404）。 */
function parseHotlinkTarget(url: URL): { target: URL; referer: string } | null {
  const rest = url.pathname.slice(HOTLINK_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  const host = rest.slice(0, slash).toLowerCase()
  const path = rest.slice(slash)
  if (path.length < 2 || !HOSTNAME_RE.test(host)) return null
  const rule = hotlinkRule(host)
  if (!rule) return null
  let target: URL
  try {
    target = new URL(`https://${host}${path}${url.search}`)
  } catch {
    return null
  }
  // 拼出来的主机名必须原样是名单里那一个（防路径里的奇怪字符把主机挤掉）。
  if (target.hostname !== host) return null
  return { target, referer: rule.referer }
}

function fromAllowedPage(request: Request): boolean {
  const value = request.headers.get('Referer') ?? request.headers.get('Origin')
  if (!value) return false
  try {
    const host = new URL(value).hostname.toLowerCase()
    return HOTLINK_PAGE_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    )
  } catch {
    return false
  }
}

// 封面按 transform 分档（thumb/card/cover/original 各自的路径即缓存键），内容不可变。
const EDGE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30 // 边缘缓存 30 天
const BROWSER_CACHE_CONTROL = 'public, max-age=604800, immutable' // 浏览器缓存 7 天

// /<bucket>/<uuid>/<transform>/<file.ext>：4 段、末段带图片扩展名。挡掉探测/垃圾路径。
const CIVITAI_IMAGE_PATH_RE =
  /^\/[^/]+\/[^/]+\/[^/]+\/[^/]+\.(?:jpe?g|png|webp|gif|avif)$/i

async function resolveImageContentType(
  upstream: Response,
  ctx: ExecutionContext,
): Promise<string | null> {
  const declared = upstream.headers
    .get('content-type')
    ?.split(';')[0]
    .trim()
    .toLowerCase()
  if (declared?.startsWith('image/')) return declared
  if (
    declared &&
    declared !== 'application/octet-stream' &&
    declared !== 'binary/octet-stream'
  ) {
    return null
  }
  if (!upstream.body) return null

  const reader = upstream.clone().body!.getReader()
  const prefix = new Uint8Array(16)
  let length = 0
  try {
    while (length < prefix.length) {
      const { done, value } = await reader.read()
      if (done) break
      const part = value.subarray(0, prefix.length - length)
      prefix.set(part, length)
      length += part.length
    }
  } finally {
    ctx.waitUntil(reader.cancel())
  }

  const matches = (bytes: number[], offset = 0) =>
    length >= offset + bytes.length &&
    bytes.every((byte, i) => prefix[offset + i] === byte)
  if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png'
  if (matches([0xff, 0xd8, 0xff])) return 'image/jpeg'
  const text = String.fromCharCode(...prefix.subarray(0, length))
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'image/gif'
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')
    return 'image/webp'
  if (
    text.slice(4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(text.slice(8, 12))
  )
    return 'image/avif'
  return null
}

/**
 * 热链那一支回源：带上那一家的 Referer，跳转**手动**跟 —— 只跟到同一张名单里。
 * 返回 `null` = 跳出了名单或跳太多次（⛔ 不替别的站当跳板）。
 */
async function fetchHotlink(
  target: URL,
  referer: string,
): Promise<Response | null> {
  let current = target
  for (let hop = 0; hop <= HOTLINK_MAX_REDIRECTS; hop += 1) {
    const upstream = await fetch(current.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; anteisuba-image-proxy/1.0; +https://www.anteisuba.com)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: referer,
      },
      redirect: 'manual',
      cf: { cacheEverything: true, cacheTtl: EDGE_CACHE_TTL_SECONDS },
    })
    if (upstream.status < 300 || upstream.status >= 400) return upstream
    const location = upstream.headers.get('Location')
    await upstream.body?.cancel()
    if (!location) return null
    let next: URL
    try {
      next = new URL(location, current)
    } catch {
      return null
    }
    if (next.protocol !== 'https:' || !hotlinkRule(next.hostname)) return null
    current = next
  }
  return null
}

export default {
  async fetch(request, _env, ctx): Promise<Response> {
    // HEAD 也放行 —— README 的验证命令用 `curl -sI`，且 Workers runtime 会自动
    // 为 HEAD 剥掉响应 body，逻辑与 GET 完全共用。
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      })
    }

    const url = new URL(request.url)
    const hotlink = url.pathname.startsWith(HOTLINK_PREFIX)
    if (hotlink && !fromAllowedPage(request)) {
      return new Response('Forbidden', { status: 403 })
    }
    const hotlinkTarget = hotlink ? parseHotlinkTarget(url) : null
    if (hotlink ? !hotlinkTarget : !CIVITAI_IMAGE_PATH_RE.test(url.pathname)) {
      return new Response('Not Found', { status: 404 })
    }

    // 缓存键只按路径 + query（transform 在路径里），与请求方 / referer 无关，
    // 让所有用户共享同一份缓存条目。
    const cache = caches.default
    const cacheKey = new Request(
      `https://${url.host}${url.pathname}${url.search}`,
      { method: 'GET' },
    )
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    let upstream: Response | null
    try {
      upstream = hotlinkTarget
        ? await fetchHotlink(hotlinkTarget.target, hotlinkTarget.referer)
        : await fetch(
            `https://${CIVITAI_IMAGE_HOST}${url.pathname}${url.search}`,
            {
              // 贴近真实浏览器抓图，避开对可疑 UA 的处置；跟随 301 → image-b2。
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (compatible; anteisuba-image-proxy/1.0; +https://www.anteisuba.com)',
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
              },
              redirect: 'follow',
              // 让 Cloudflare 也缓存回源结果，进一步摊薄对 Civitai 的回源。
              cf: { cacheEverything: true, cacheTtl: EDGE_CACHE_TTL_SECONDS },
            },
          )
    } catch {
      return new Response('Bad Gateway', { status: 502 })
    }
    if (!upstream) {
      return new Response('Bad Gateway', { status: 502 })
    }

    if (!upstream.ok) {
      // 透传上游失败信息便于诊断；不缓存失败响应，下次自然重试。
      await upstream.body?.cancel()
      return new Response(`Upstream ${upstream.status}`, {
        status: upstream.status === 404 ? 404 : 502,
      })
    }

    if (hotlinkTarget) {
      const declared = Number(upstream.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > HOTLINK_MAX_BYTES) {
        await upstream.body?.cancel()
        return new Response('Payload Too Large', { status: 413 })
      }
    }

    const contentType = await resolveImageContentType(upstream, ctx)
    if (!contentType) {
      await upstream.body?.cancel()
      return new Response('Unsupported Media Type', { status: 415 })
    }

    const response = new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': BROWSER_CACHE_CONTROL,
        // 图片被跨源 <img> 使用；允许跨源读取（对 <img> 非必需但无害）。
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
      },
    })

    // 写边缘缓存（clone：body 只能消费一次，一份进缓存一份回客户端）。
    ctx.waitUntil(cache.put(cacheKey, response.clone()))
    return response
  },
} satisfies ExportedHandler
