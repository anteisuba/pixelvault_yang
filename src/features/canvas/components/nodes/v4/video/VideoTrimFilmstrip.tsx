'use client'

/**
 * 视频裁剪条轨道里的**胶片**（node-canvas-v2 §4 shot：「与音频裁剪同款，整条淡、
 * 两端手柄」——音频那条画波形，这条画画面）。
 *
 * 帧取法与剪辑台时间线的胶片同一套（`getVideoFrameUrl` 边缘截帧，按 `stepSec` 取整
 * 秒数，同一刻同一个缓存键）；自家 CDN 之外的片子截不了帧，就整条铺封面。
 *
 * ⚠ 淡 / 亮两层用的是**同一组地址**（裁剪条把亮的那层平移后裁进选区窗）：⛔ 不给
 * 选区单独取帧，两层对不齐，拖窗时窗里的画面会跳。
 */

import { EDIT_TIMELINE_FILMSTRIP } from '@/constants/edit-desk'
import { NODE_V4_AUDIO_TRIM } from '@/constants/node-studio'
import { getVideoFrameUrl } from '@/lib/video-poster'
import { cn } from '@/lib/utils'

import type { TrimTone } from '../audio/AudioTrimPanel'

/** 轨道高下一帧按 16:9 铺多宽 —— 帧数就是边缘截帧的请求数，⛔ 不按更细铺。 */
const FRAME_ASPECT = 16 / 9

export function videoTrimFrameUrls(
  url: string,
  durationSec: number,
  posterUrl: string | undefined,
): readonly (string | null)[] {
  const frameWidth = NODE_V4_AUDIO_TRIM.trackHeight * FRAME_ASPECT
  const count = Math.max(
    1,
    Math.ceil(NODE_V4_AUDIO_TRIM.trackWidth / frameWidth),
  )
  const step = EDIT_TIMELINE_FILMSTRIP.stepSec
  const total = Math.max(0, durationSec)
  return Array.from({ length: count }, (_, index) => {
    const at = ((index + 0.5) / count) * total
    const sec = Math.min(
      Math.max(0, Math.round(at / step) * step),
      Math.max(0, total - step / 2),
    )
    return (
      getVideoFrameUrl(url, sec, EDIT_TIMELINE_FILMSTRIP.frameWidthPx) ??
      posterUrl ??
      null
    )
  })
}

export function VideoTrimFilmstrip({
  frames,
  tone,
}: {
  readonly frames: readonly (string | null)[]
  readonly tone: TrimTone
}) {
  return (
    <div
      data-video-trim-filmstrip={tone}
      className={cn(
        'flex size-full overflow-hidden rounded-sm bg-surface-fill-hover',
        // 整条变淡，选区那扇窗里是原色（与音频的淡波形 / 黑波形同一层次）。
        tone === 'faint' && 'opacity-35',
      )}
    >
      {frames.map((frame, index) => (
        <span
          key={index}
          className="min-w-0 flex-1 border-r border-neutral-950/20 bg-cover bg-center last:border-r-0"
          style={frame ? { backgroundImage: `url(${frame})` } : undefined}
        />
      ))}
    </div>
  )
}
