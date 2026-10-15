import {
  matchesHostPattern,
  WEB_IMAGE_HOTLINK_PROXY,
} from '@/constants/web-image-sources'

/**
 * **第三方网图在面板里怎么取**（助手找图，2026-10-15 · 附录 I §3.4）。
 *
 * 两层：
 *  ① 一律 `referrerPolicy="no-referrer"` 直连 —— 大多数图床拒的是「别家站的 Referer」，
 *     空 Referer 放行；这一层在组件上（`useThirdPartyImage`），这里不管。
 *  ② 连空 Referer 也拒的那几家（`WEB_IMAGE_HOTLINK_PROXY.hosts`）先走自家图片代理的
 *     `/hotlink/` 那一支（Worker 带上它们站内的 Referer 去取），**取不到再退回直连**。
 *
 * ⚠ 代理的域名复用 `NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE`（同一个 Worker、同一个
 *   自定义域）。没配就不改写 —— 与 `proxyCivitaiImageUrl` 同一条回退。
 */

/** 走代理的地址；不在名单里、代理没配或地址不合规矩时是 `null`。 */
export function hotlinkProxyImageUrl(url: string): string | null {
  // 每次读 env（而非模块级常量）以便测试用 vi.stubEnv 覆写；客户端构建时内联。
  const rawBase = process.env.NEXT_PUBLIC_CIVITAI_IMAGE_PROXY_BASE
  const base = rawBase ? rawBase.replace(/\/+$/, '') : null
  if (!base || !url) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  // Worker 只认裸主机名（⛔ 端口、userinfo）—— 带了就别改写，改了也是 404。
  if (parsed.port || parsed.username || parsed.password) return null
  const host = parsed.hostname.toLowerCase()
  if (
    !WEB_IMAGE_HOTLINK_PROXY.hosts.some((pattern) =>
      matchesHostPattern(host, pattern),
    )
  ) {
    return null
  }
  return `${base}${WEB_IMAGE_HOTLINK_PROXY.pathPrefix}/${host}${parsed.pathname}${parsed.search}`
}

/**
 * 一张网图依次试哪几个地址：每个地址先代理（能走的话）再直连，按传入顺序排，去重。
 *
 * ⭐ 后面的参数是**退路**：灯箱传「原图, 缩略图」—— 原图三成取不到（附录 I 问题 4），
 *    取不到就先给看小图（ui-defaults §7.2「看大图」那一行）。
 */
export function thirdPartyImageSources(
  ...urls: readonly (string | null | undefined)[]
): string[] {
  const sources: string[] = []
  for (const url of urls) {
    if (!url) continue
    const proxied = hotlinkProxyImageUrl(url)
    for (const candidate of proxied ? [proxied, url] : [url]) {
      if (!sources.includes(candidate)) sources.push(candidate)
    }
  }
  return sources
}

/**
 * 来源卡上的**站点图标**：直接取那个站自己的 `https://<域名>/favicon.ico`
 * （调用方 `referrerPolicy="no-referrer"`，取不到退回地球图标）。
 *
 * ⛔ 不走第三方 favicon 服务（Google s2 / DuckDuckGo）—— 那等于把用户读过的每个域名
 *    报给另一家；直连的那一家本来就是用户要点开的站。
 */
export function siteFaviconUrl(
  pageUrl: string | null | undefined,
): string | null {
  if (!pageUrl) return null
  let parsed: URL
  try {
    parsed = new URL(pageUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  if (parsed.port || !parsed.hostname) return null
  return `https://${parsed.hostname.toLowerCase()}/favicon.ico`
}
