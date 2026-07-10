/**
 * Civitai 把所有图片托管在 image.civitai.com（Cloudflare Images delivery），
 * URL 结构：
 *
 *   https://image.civitai.com/<bucket>/<uuid>/<transform>/<filename>
 *
 * `<transform>` 段可以是 `original=true` 或 `anim=false,width=N,optimized=true`
 * 等组合。改 transform 不需要鉴权、不限流，是免费的图像缩放。
 *
 * Civitai 上游默认给我们的 cover URL 都是 `original=true`，单图 1–5 MB。
 * 40×40 的列表缩略图也下原图 → 我们 rewrite 成尺寸合适的 transform。
 *
 * 不匹配的 URL（非 Civitai、旧资源、奇怪格式）原样返回，不破坏调用方。
 */

const CIVITAI_IMAGE_HOST = 'image.civitai.com'

/**
 * Civitai 图片 transform 段语法的关键字。匹配到任意一个就认为 segment 是
 * transform 段，可以替换。未来 Civitai 加新关键字时把它加到这里。
 */
const TRANSFORM_KEYWORDS = [
  'original=',
  'width=',
  'height=',
  'anim=',
  'optimized=',
  'quality=',
  'fit=',
  'format=',
  'blur=',
]

export interface RewriteOptions {
  /** 目标宽度像素。Civitai 会按比例缩 height。 */
  width: number
  /** Civitai 的 "optimized" flag — 走 WebP / 更激进压缩。默认 true。 */
  optimized?: boolean
  /**
   * 是否强制静态化（去掉 gif/webm 动图）。默认 **false**：jpg/png cover
   * 不是动图，加 `anim=false` 没收益，反而踩到过 Civitai CDN 的一个缓存
   * 怪 bug —— 部分 (anim=false, width=N, optimized=true) 组合的缓存条目
   * 被回源成原图 4MB。仅在你确认源是 gif/webm 时显式传 true。
   */
  staticFrame?: boolean
}

/**
 * 重写 Civitai 图片 URL 的 transform 段为指定尺寸。
 *
 * 输入：`https://image.civitai.com/.../original=true/1234.jpeg`
 * 输出：`https://image.civitai.com/.../anim=false,width=96,optimized=true/1234.jpeg`
 *
 * 对于非 Civitai URL 或无法解析的 URL，原样返回（fallback safe）。
 */
export function rewriteCivitaiImageUrl(
  url: string,
  options: RewriteOptions,
): string {
  if (!url) return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (parsed.hostname !== CIVITAI_IMAGE_HOST) return url

  // pathname 形如 `/bucket/uuid/original=true/filename.jpeg`
  // split('/') → ['', 'bucket', 'uuid', 'original=true', 'filename.jpeg']
  const segments = parsed.pathname.split('/')
  if (segments.length < 4) return url

  // 找 transform segment：从后往前扫，跳过最后一段（文件名）
  let transformIndex = -1
  for (let i = segments.length - 2; i >= 1; i -= 1) {
    const segment = segments[i] ?? ''
    if (TRANSFORM_KEYWORDS.some((kw) => segment.includes(kw))) {
      transformIndex = i
      break
    }
  }

  const transformParts: string[] = []
  if (options.staticFrame === true) transformParts.push('anim=false')
  transformParts.push(`width=${options.width}`)
  if (options.optimized ?? true) transformParts.push('optimized=true')
  const transformSegment = transformParts.join(',')

  if (transformIndex === -1) {
    // 没有 transform 段（罕见，可能是 Civitai 给的非标准 URL）。在文件名前
    // 插一段。这样最坏情况是 Civitai 不识别新格式 → 直接 404，但保留原行为
    // 不会更糟（原本就是大图）。
    segments.splice(segments.length - 1, 0, transformSegment)
  } else {
    segments[transformIndex] = transformSegment
  }

  parsed.pathname = segments.join('/')
  return parsed.toString()
}

/**
 * 把 image.civitai.com 的图 URL 改写成走自家边缘缓存代理。
 *
 * 根因：公开 LoRA 库封面此前从浏览器**直连** image.civitai.com，整页一次性并发
 * 几十张 → Civitai 的 Cloudflare 按单客户端限流，突发请求被回 429/503 → 封面
 * 全部加载失败（黑格；串行请求反而全 200，实测见诊断）。
 *
 * 修复：不再从浏览器 hotlink，改走 Cloudflare Worker 边缘缓存代理
 * （`workers/civitai-image-proxy/`）。浏览器只打自家源，命中边缘缓存；未命中才由
 * Worker 服务端拉 Civitai（Cloudflare→Cloudflare，非单客户端突发）并长期缓存，
 * 其他用户直接吃缓存 —— 单客户端不再产生突发直连，绕开限流。
 *
 * 代理只接管 image.civitai.com 的图；R2 / 其它源 / 非法 URL 一律原样放行。
 * `NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE` 未配置时**原样返回**（回退直连），所以这
 * 段改动可以先合，Worker 部署 + 配好 env 后自动生效，无需二次改代码。
 *
 * 传入路径原样透传给代理（`<base>/<bucket>/<uuid>/<transform>/<file>`），路径本身
 * 即缓存键，天然按 transform 分档缓存。已经是代理域的 URL 会原样返回（幂等），可安全
 * 叠加在 {@link rewriteCivitaiImageUrl} 之后调用。
 */
export function proxyCivitaiImageUrl(url: string): string {
  // 每次读 env（而非模块级常量）以便测试用 vi.stubEnv 覆写；客户端构建时
  // Next 会把 process.env.NEXT_PUBLIC_* 内联成字面量，无运行时开销。
  const rawBase = process.env.NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE
  const proxyBase = rawBase ? rawBase.replace(/\/+$/, '') : null
  if (!url || !proxyBase) return url

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  if (parsed.hostname !== CIVITAI_IMAGE_HOST) return url

  return `${proxyBase}${parsed.pathname}${parsed.search}`
}
