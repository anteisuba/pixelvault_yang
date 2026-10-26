import 'server-only'

import { DANBOORU_REQUEST, RESEARCH_USER_AGENT } from '@/constants/research'
import type { DanbooruImageQuery } from '@/types/danbooru-catalog'

/** 代取一张样图的上限：样图最大是 720 档，几十 KB；留足余量。 */
const DANBOORU_IMAGE_TIMEOUT_MS = 10_000

/**
 * 服务端代取一张 Danbooru 样图（标签库，2026-10-26）。
 *
 * 浏览器直连 `cdn.donmai.us` 时，被 Cloudflare 判为可疑的客户端会拿到 403 质询页
 * （带 CORP `same-origin`，浏览器报 NotSameOrigin）；服务端带自己的 UA 去取放行。
 * 前端只在直连失败后才打这里（`WEB_IMAGE_SERVER_FALLBACK`）。
 *
 * 返回上游响应（已确认是图）；取不到或不是图时是 `null`。
 */
export async function fetchDanbooruImage({
  path,
}: DanbooruImageQuery): Promise<Response | null> {
  const upstream = await fetch(`${DANBOORU_REQUEST.imageCdnUrl}${path}`, {
    headers: { 'User-Agent': RESEARCH_USER_AGENT },
    redirect: 'error',
    signal: AbortSignal.timeout(DANBOORU_IMAGE_TIMEOUT_MS),
  })
  const contentType = upstream.headers.get('content-type') ?? ''
  if (!upstream.ok || !contentType.startsWith('image/')) {
    await upstream.body?.cancel()
    return null
  }
  return upstream
}
