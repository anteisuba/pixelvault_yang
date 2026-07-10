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
 */

const CIVITAI_IMAGE_HOST = 'image.civitai.com'

// 封面按 transform 分档（thumb/card/cover/original 各自的路径即缓存键），内容不可变。
const EDGE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30 // 边缘缓存 30 天
const BROWSER_CACHE_CONTROL = 'public, max-age=604800, immutable' // 浏览器缓存 7 天

// /<bucket>/<uuid>/<transform>/<file.ext>：4 段、末段带图片扩展名。挡掉探测/垃圾路径。
const CIVITAI_IMAGE_PATH_RE =
  /^\/[^/]+\/[^/]+\/[^/]+\/[^/]+\.(?:jpe?g|png|webp|gif|avif)$/i

export default {
  async fetch(request, _env, ctx): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET' },
      })
    }

    const url = new URL(request.url)
    if (!CIVITAI_IMAGE_PATH_RE.test(url.pathname)) {
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

    const target = `https://${CIVITAI_IMAGE_HOST}${url.pathname}${url.search}`

    let upstream: Response
    try {
      upstream = await fetch(target, {
        // 贴近真实浏览器抓图，避开对可疑 UA 的处置；跟随 301 → image-b2。
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; anteisuba-image-proxy/1.0; +https://www.anteisuba.com)',
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
        // 让 Cloudflare 也缓存回源结果，进一步摊薄对 Civitai 的回源。
        cf: { cacheEverything: true, cacheTtl: EDGE_CACHE_TTL_SECONDS },
      })
    } catch {
      return new Response('Bad Gateway', { status: 502 })
    }

    if (!upstream.ok) {
      // 透传上游失败信息便于诊断；不缓存失败响应，下次自然重试。
      return new Response(`Upstream ${upstream.status}`, {
        status: upstream.status === 404 ? 404 : 502,
      })
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
    if (!contentType.startsWith('image/')) {
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
