/**
 * Video generation utility functions.
 * Extracted from VideoGenerateForm to reduce component size.
 */

import { IMAGE_SIZES } from '@/constants/config'

export function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

/** HH:MM:SS timecode for the video monitor's REC readout (§4 C4). */
export function formatTimecode(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = clamped % 60
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

/**
 * 存进 `Generation` 的视频宽高。有「480p」这类档位时短边就是它、长边按比例推
 * （取偶数，编码器出片也是偶数）；没有档位才回落到比例默认尺寸。
 * ⚠ 09-24 真机：9:16 · 480p 的片子按图片尺寸表记成 1024×1792，预览角标写 1792p。
 */
export function getVideoOutputSize(
  aspectRatio: string,
  resolution?: string | null,
): { width: number; height: number } {
  const fallback =
    IMAGE_SIZES[aspectRatio as keyof typeof IMAGE_SIZES] ?? IMAGE_SIZES['16:9']
  const short = Number(resolution?.match(/^(\d+)p$/i)?.[1])
  const [w, h] = aspectRatio.split(':').map(Number)
  if (!short || !w || !h)
    return { width: fallback.width, height: fallback.height }
  const long = Math.round((short * Math.max(w, h)) / Math.min(w, h) / 2) * 2
  return w >= h
    ? { width: long, height: short }
    : { width: short, height: long }
}

/** Video size lookup matching OpenAI Sora's expected sizes */
export const VIDEO_SIZES: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
}

/** Resize a base64 data-URL image to exact dimensions using Canvas */
export function resizeImageToDataUrl(
  dataUrl: string,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img')
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = () => reject(new Error('Failed to load image for resize'))
    img.src = dataUrl
  })
}
