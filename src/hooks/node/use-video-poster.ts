'use client'

/**
 * 「这段视频长什么样」——一张封面帧的地址（剪辑台左栏 / 时间线段 / 右栏来源 /
 * 预览 poster）。
 *
 * 三级，**越靠前越便宜**：
 * 1. `videoThumbnailUrl` —— 生成路本来就带一张，零成本；
 * 2. `getVideoPosterUrl()` —— Cloudflare Media Transformations 在边缘抽帧，
 *    纯函数、不解码；只对自家 CDN 域下的视频有效；
 * 3. 客户端抓首帧（`captureVideoFirstFrame`，按 url 缓存，同一条地址只解一次）
 *    —— 兜住 provider 临时地址与第三方域。
 *
 * ⚠ 三级都拿不到就返回 `null`，调用方退回图标占位 —— ⛔ 不显示一块转圈的骨架：
 * 一格 64px 的缩略图不值得让人盯着等，而且失败是常态（预览部署不在 R2 CORS 名单里）。
 *
 * ── 为什么渲染期直接读那张模块缓存 ──────────────────────────────────────
 * 它是**外部存储**（按 url 分键、只写一次），渲染期读它是纯读取；state 里只留
 * 一个「缓存已经有答案了，重读一遍」的计数，⛔ 不把帧本身再往组件里抄一份 ——
 * 抄一份就要在 effect 体里同步 setState（cascading render，eslint 也拦），而且
 * 同一条地址在三处各存一份。
 */

import { useEffect, useMemo, useState } from 'react'

import {
  captureVideoFirstFrame,
  readCachedVideoFirstFrame,
} from '@/lib/video-first-frame'
import { getVideoPosterUrl } from '@/lib/video-poster'

export function useVideoPoster(
  url: string | undefined,
  thumbnailUrl?: string,
): string | null {
  const edgePoster = useMemo(
    () => (thumbnailUrl ? null : getVideoPosterUrl(url)),
    [url, thumbnailUrl],
  )
  const needsCapture = Boolean(url) && !thumbnailUrl && !edgePoster
  /** 只是一记「重读缓存」的敲门声，⛔ 不承载数据。 */
  const [resolvedTick, setResolvedTick] = useState(0)

  useEffect(() => {
    if (!needsCapture || !url) return
    if (readCachedVideoFirstFrame(url) !== undefined) return
    let active = true
    void captureVideoFirstFrame(url).then(() => {
      if (active) setResolvedTick((tick) => tick + 1)
    })
    return () => {
      active = false
    }
  }, [url, needsCapture])

  const captured = useMemo(
    () =>
      needsCapture && url ? (readCachedVideoFirstFrame(url) ?? null) : null,
    // `resolvedTick` 是**故意**的依赖：缓存写完之后要重读一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上一行
    [url, needsCapture, resolvedTick],
  )

  return thumbnailUrl ?? edgePoster ?? captured
}
