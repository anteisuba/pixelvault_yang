import {
  VIDEO_FRAME_CAPTURE_REASONS,
  VIDEO_FRAME_LIMITS,
  type VideoFrameCaptureReason,
} from '@/constants/video-analysis'
import { planVideoFrames, type VideoFramePlan } from '@/lib/video-frame-plan'

/**
 * 浏览器里按计划抽帧（AI 导演内核 · 切片 2 · §4.3「抽帧管线」）。
 *
 * **为什么是客户端**（选型，2026-08-21）：任务包原文写的「worker ffmpeg」不成立 ——
 * `workers/execution` 是 Cloudflare Worker，跑不了原生二进制；而服务端 ffmpeg 要往
 * Vercel 包里塞几十 MB 的 `ffmpeg-static`，仓里从来没有过这个依赖。项目里**已经有**
 * 一份 `<video>` + `canvas.drawImage` 的实现在跑（`lib/video-thumbnail.ts` 抓封面），
 * 零新依赖、视频本来就在用户浏览器里 —— 抽 8 帧和抽 1 帧是同一件事的 N 次。
 *
 * 🔬 **R2 CORS 已实测（只读探针，2026-08-21）**：`cdn.anteisuba.com` 与
 * `pub-…​.r2.dev` 对带 `Origin` 的 GET 都回
 * `Access-Control-Allow-Origin`，允许名单实测含 `http://localhost:3000` /
 * `https://anteisuba.com` / `https://www.anteisuba.com`，不含随便一个第三方 origin。
 * 所以 `crossOrigin="anonymous"` 拿得到干净的画布。
 * ⚠ **但预览部署（`*.vercel.app`）不在名单里** —— 那里抽帧会因画布污染而失败，
 * 表现是 `toBlob` 抛 SecurityError。本模块把它当普通失败处理并如实报出来，
 * ⛔ 不静默返回半组帧。
 *
 * **覆盖面**（选型时就说清楚，别让人以为它什么都能抽）：只覆盖**用户自己上传 /
 * 已经在我们 R2 里**的视频。YouTube 等平台链接抽不了（也不需要）—— 那条走既有的
 * Gemini `fileData.fileUri` 原生路。
 */

export interface CapturedVideoFrame {
  index: number
  timestampSeconds: number
  /** `data:image/webp;base64,…`，直接进 `POST /api/vision/frames`。 */
  dataUrl: string
}

export interface VideoFrameCaptureSuccess {
  ok: true
  plan: VideoFramePlan
  durationSeconds: number
  width: number
  height: number
  frames: CapturedVideoFrame[]
}

export interface VideoFrameCaptureFailure {
  ok: false
  /**
   * 机器可读的失败原因 —— UI 要能分辨「读不出视频」和「跨域被挡」。
   * 枚举住在 `constants/video-analysis.ts`，因为 UI 那边要按它穷举文案。
   */
  reason: VideoFrameCaptureReason
  message: string
}

export type VideoFrameCaptureResult =
  | VideoFrameCaptureSuccess
  | VideoFrameCaptureFailure

function failure(
  reason: VideoFrameCaptureReason,
  message: string,
): VideoFrameCaptureFailure {
  return { ok: false, reason, message }
}

function waitForEvent(
  video: HTMLVideoElement,
  event: 'loadedmetadata' | 'seeked',
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for video "${event}"`))
    }, timeoutMs)
    const onDone = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(`Video error while waiting for "${event}"`))
    }
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(event, onDone)
      video.removeEventListener('error', onError)
    }
    video.addEventListener(event, onDone, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

/** 长边压到 `maxEdgePixels` 以内。视觉模型自己也会缩，多传的像素纯烧带宽。 */
function scaledSize(width: number, height: number): { w: number; h: number } {
  const longest = Math.max(width, height)
  if (longest <= VIDEO_FRAME_LIMITS.maxEdgePixels)
    return { w: width, h: height }
  const ratio = VIDEO_FRAME_LIMITS.maxEdgePixels / longest
  return {
    w: Math.max(1, Math.round(width * ratio)),
    h: Math.max(1, Math.round(height * ratio)),
  }
}

/**
 * 按 `planVideoFrames` 的时间戳逐帧抽。
 *
 * ⚠ **一帧失败 = 整组失败**。半组帧看起来还能分析，但它已经不是那个计划的产物了
 * —— 复跑时对不上，而「对得上」正是这条线存在的理由。
 *
 * @param source 已经在 R2 / 同源的视频 URL，或者用户刚选的 `File`。
 */
export async function captureVideoFrames(
  source: string | File,
): Promise<VideoFrameCaptureResult> {
  if (typeof document === 'undefined') {
    return failure(
      VIDEO_FRAME_CAPTURE_REASONS.unsupportedEnvironment,
      'No DOM available',
    )
  }

  const video = document.createElement('video')
  const objectUrl =
    typeof source === 'string' ? null : URL.createObjectURL(source)
  const cleanup = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    video.removeAttribute('src')
    video.load()
    video.remove()
  }

  const deadline = Date.now() + VIDEO_FRAME_LIMITS.captureTimeoutMs
  const remaining = () =>
    Math.min(
      VIDEO_FRAME_LIMITS.seekTimeoutMs,
      Math.max(0, deadline - Date.now()),
    )

  try {
    // ⚠ 必须在设置 src **之前**打 crossOrigin，否则请求发出去时不带
    // `Origin`，回来的响应没有 CORS 头，画布照样被污染。
    if (typeof source === 'string') video.crossOrigin = 'anonymous'
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl ?? (source as string)

    await waitForEvent(video, 'loadedmetadata', remaining())

    const duration = video.duration
    const plan = planVideoFrames(duration)
    if (plan.entries.length === 0) {
      return failure(
        VIDEO_FRAME_CAPTURE_REASONS.unreadableDuration,
        `Video duration is not usable (${String(duration)})`,
      )
    }

    const { w, h } = scaledSize(video.videoWidth, video.videoHeight)
    if (!w || !h) {
      return failure(
        VIDEO_FRAME_CAPTURE_REASONS.loadFailed,
        'Video has no decodable dimensions',
      )
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return failure(
        VIDEO_FRAME_CAPTURE_REASONS.encodeFailed,
        'Canvas 2D context unavailable',
      )

    const frames: CapturedVideoFrame[] = []
    for (const entry of plan.entries) {
      if (remaining() <= 0) {
        return failure(
          VIDEO_FRAME_CAPTURE_REASONS.timeout,
          `Frame capture exceeded ${VIDEO_FRAME_LIMITS.captureTimeoutMs}ms`,
        )
      }
      video.currentTime = entry.timestampSeconds
      await waitForEvent(video, 'seeked', remaining())
      ctx.drawImage(video, 0, 0, w, h)

      let dataUrl: string
      try {
        dataUrl = canvas.toDataURL(
          VIDEO_FRAME_LIMITS.encodeMimeType,
          VIDEO_FRAME_LIMITS.encodeQuality,
        )
      } catch (error) {
        // 跨域视频没带 CORS 头 → 画布被污染 → `toDataURL` 抛 SecurityError。
        // 这条要单独认出来：它的修法是配 R2 CORS，不是换个视频重试。
        return failure(
          VIDEO_FRAME_CAPTURE_REASONS.taintedCanvas,
          error instanceof Error ? error.message : 'Canvas is tainted',
        )
      }

      frames.push({
        index: entry.index,
        // 报**实际落点**而不是回声计划值：服务端要核对的就是「你真的抽到了计划附近」。
        timestampSeconds: video.currentTime,
        dataUrl,
      })
    }

    return {
      ok: true,
      plan,
      durationSeconds: duration,
      width: w,
      height: h,
      frames,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failure(
      message.includes('Timed out')
        ? VIDEO_FRAME_CAPTURE_REASONS.timeout
        : VIDEO_FRAME_CAPTURE_REASONS.loadFailed,
      message,
    )
  } finally {
    cleanup()
  }
}
