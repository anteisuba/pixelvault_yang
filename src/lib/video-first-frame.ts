/**
 * 从**一条视频地址**在浏览器里抓一张首帧（剪辑台的最后一条封面来路）。
 *
 * ── 与相邻三支的分工，⛔ 别再造第五支 ──────────────────────────────────
 * - `video-poster.ts` 的 `getVideoPosterUrl()` 是**首选**：Cloudflare Media
 *   Transformations 在边缘抽帧，纯函数、零解码 —— 但它只认自家 CDN 域下的视频；
 * - `video-thumbnail.ts` 抓的是**用户刚选中的 `File`**（上传前，还没有地址）；
 * - `video-frame-capture.ts` 抓的是**一组**帧（视觉模型要 8 帧 / 3 帧，按计划走）；
 * - 本模块只在前两条都不适用时兜底：provider 的临时地址、第三方域，抓**一张**。
 *
 * ── 为什么必须缓存 ──────────────────────────────────────────────────────
 * 同一张卡会同时出现在左栏素材格、时间线上的若干段、右栏来源缩略里；时间线每
 * 拖一次手柄就重渲一次。不缓存 = 每帧重开一只 `<video>` 去 seek 同一秒，页面
 * 直接卡死。缓存按 **url** 分键（同一张卡换了版本就是另一条地址，自然失效），
 * 在飞的那一次也记着 —— 三处同时问同一条地址只解码一次。
 *
 * best-effort：任何失败（跨域污染 / 解码不了 / 隐藏标签页收不到事件）都记一条
 * `null` 并**不再重试**，调用方退回图标占位。⛔ 不重试：失败的原因（CORS、编码）
 * 换一次渲染不会变，重试只是把卡顿摊长。
 */

import { MEDIA_PROBE_TIMEOUT_MS } from '@/constants/media-probe'
import { VIDEO_FRAME_LIMITS } from '@/constants/video-analysis'

/** 抓哪一刻：稍微过一点点开头（躲开黑场引导帧），但不越过极短片的中点。 */
function pickSeekTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(0.1, duration / 2)
}

/** 首帧长边上限 —— 它只会显示在 64px 高的格子与 52px 高的段里。 */
const FIRST_FRAME_MAX_EDGE_PX = 320

function scaledSize(width: number, height: number) {
  if (!width || !height) return { w: 0, h: 0 }
  const scale = Math.min(1, FIRST_FRAME_MAX_EDGE_PX / Math.max(width, height))
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  }
}

/** 已经问出结果的地址（`null` = 抓不到，⛔ 不再重试）。 */
const frameCache = new Map<string, string | null>()
/** 正在抓的那一批 —— 三处同时问只解码一次。 */
const inFlight = new Map<string, Promise<string | null>>()

/** 已经缓存的那一张（同步读，渲染时用它避免第一帧空白）。 */
export function readCachedVideoFirstFrame(
  url: string,
): string | null | undefined {
  return frameCache.get(url)
}

/** 测试用：清空两张表。⛔ 生产代码不调它。 */
export function resetVideoFirstFrameCache(): void {
  frameCache.clear()
  inFlight.clear()
}

function capture(url: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const video = document.createElement('video')
    let settled = false

    const finish = (result: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      video.remove()
      resolve(result)
    }

    // 预算落在**函数内部**：标签页隐藏时 `loadedmetadata` / `seeked` / `error`
    // 一个都不派发（`MEDIA_PROBE_TIMEOUT_MS` 头注），在外面 race 只会漏掉这只元素。
    const timer = setTimeout(() => finish(null), MEDIA_PROBE_TIMEOUT_MS)

    const draw = () => {
      const { w, h } = scaledSize(video.videoWidth, video.videoHeight)
      if (!w || !h) return finish(null)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return finish(null)
      try {
        ctx.drawImage(video, 0, 0, w, h)
        finish(
          canvas.toDataURL(
            VIDEO_FRAME_LIMITS.encodeMimeType,
            VIDEO_FRAME_LIMITS.encodeQuality,
          ),
        )
      } catch {
        // 跨域没带 CORS 头 → 画布被污染 → `toDataURL` 抛 SecurityError。
        finish(null)
      }
    }

    video.onerror = () => finish(null)
    video.onseeked = draw
    video.onloadeddata = () => {
      const target = pickSeekTime(video.duration)
      if (target <= 0) {
        draw()
        return
      }
      video.currentTime = target
    }

    // ⚠ `crossOrigin` 必须在 `src` **之前**打，否则请求不带 `Origin`，
    // 回来的响应没有 CORS 头，画布照样被污染。
    video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = url
  })
}

/**
 * 抓这条地址的首帧（`data:image/webp;base64,…`）。抓不到给 `null`。
 *
 * ⚠ 同一条地址只解码一次 —— 结果与失败都记进缓存。
 */
export function captureVideoFirstFrame(url: string): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  if (!url) return Promise.resolve(null)
  const cached = frameCache.get(url)
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = inFlight.get(url)
  if (pending) return pending
  const task = capture(url).then((result) => {
    frameCache.set(url, result)
    inFlight.delete(url)
    return result
  })
  inFlight.set(url, task)
  return task
}
