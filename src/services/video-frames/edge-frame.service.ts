import 'server-only'

import { LOOK_FRAME_FETCH_TIMEOUT_MS } from '@/constants/media-transformations'

/**
 * 取一张**边缘截帧**（`getVideoFrameUrl` / `getImagePreviewUrl` 拼好的地址）——
 * MCP `look_at` 与站内助手 `canvas_look_at` 共用这一条腿。
 *
 * ⚠ 只读：一次 GET 自家 CDN，字节只在内存里转一手（MCP 直接回给 Claude，站内交给
 *   视觉补全），⛔ 不落 R2、不读写库。
 * ⚠ 每一帧各自成败，⛔ 一帧失败不连累同批其它帧。
 */

export interface EdgeFramePlan {
  readonly label: string
  readonly url: string | null
  /** 截不了的原因（时间落在段外等），有它就不去取。 */
  readonly reason?: string
}

export type EdgeFrame =
  | {
      readonly label: string
      readonly ok: true
      readonly mimeType: string
      readonly base64: string
    }
  | { readonly label: string; readonly ok: false; readonly reason: string }

export const EDGE_FRAME_NOT_ON_CDN =
  'this media is not a PixelVault-hosted MP4/image, so no frame can be taken'

export function formatFrameSec(seconds: number): string {
  return `${Math.round(seconds * 1000) / 1000}s`
}

export async function fetchEdgeFrame(plan: EdgeFramePlan): Promise<EdgeFrame> {
  if (!plan.url) {
    return {
      label: plan.label,
      ok: false,
      reason: plan.reason ?? EDGE_FRAME_NOT_ON_CDN,
    }
  }
  try {
    const response = await fetch(plan.url, {
      signal: AbortSignal.timeout(LOOK_FRAME_FETCH_TIMEOUT_MS),
    })
    const mimeType = response.headers.get('content-type') ?? ''
    if (!response.ok || !mimeType.startsWith('image/')) {
      // 边缘截帧的失败多半是源不合格（>100MB / >10 分钟 / 时间点超出片长）。
      return {
        label: plan.label,
        ok: false,
        reason: `the CDN could not extract this frame (HTTP ${response.status}); the time may be past the end of the video`,
      }
    }
    const base64 = Buffer.from(await response.arrayBuffer()).toString('base64')
    return { label: plan.label, ok: true, mimeType, base64 }
  } catch {
    return {
      label: plan.label,
      ok: false,
      reason: 'timed out fetching this frame',
    }
  }
}
