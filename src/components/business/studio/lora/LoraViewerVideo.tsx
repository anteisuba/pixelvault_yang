'use client'

import { useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { Pause, Play } from '@/components/icons'
import { rewriteCivitaiImageUrl } from '@/lib/civitai-image-url'
import { CIVITAI_PREVIEW_WIDTH } from '@/lib/civitai-library-item'

interface LoraViewerVideoProps {
  /** 片段地址（任意宽度档，这里换成大图那一档）。 */
  src: string
  /** 静帧：开播前、减少动态效果时停在它。 */
  poster: string
  label: string
  /** 读到片段的宽高后报给查看器（补出来的样例条目不带宽高）。 */
  onRatio?: (ratio: number) => void
}

function formatTime(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.floor(seconds) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * 样例查看器里的视频（lora-library.md §5）：自动播放、静音循环，底部一条控件
 * —— 播放 / 暂停 · 进度（可拖）· 时长。系统「减少动态效果」时不自动播，停在
 * 静帧等你点。没有声音（作者样例几乎都是无声片段），⛔ 音量键。
 */
export function LoraViewerVideo({
  src,
  poster,
  label,
  onRatio,
}: LoraViewerVideoProps) {
  const t = useTranslations('LoraWorkbench.viewer')
  const reducedMotion = useReducedMotion()
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState({ current: 0, duration: 0 })

  const toggle = () => {
    const video = ref.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }

  return (
    <div className="relative size-full bg-foreground">
      <video
        ref={ref}
        src={rewriteCivitaiImageUrl(src, { width: CIVITAI_PREVIEW_WIDTH })}
        poster={poster}
        autoPlay={!reducedMotion}
        muted
        loop
        playsInline
        aria-label={label}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          const { duration, videoWidth, videoHeight } = event.currentTarget
          setTime({ current: 0, duration })
          if (videoWidth > 0 && videoHeight > 0) {
            onRatio?.(videoWidth / videoHeight)
          }
        }}
        onTimeUpdate={(event) =>
          setTime({
            current: event.currentTarget.currentTime,
            duration: event.currentTarget.duration,
          })
        }
        className="size-full animate-in object-contain fade-in-0 duration-base motion-reduce:animate-none"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-linear-to-t from-foreground/60 to-transparent px-3 pb-2.5 pt-6 text-background">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t('pause') : t('play')}
          className="grid size-7 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
        >
          {playing ? (
            <Pause weight="fill" className="size-3.5" aria-hidden />
          ) : (
            <Play weight="fill" className="size-3.5" aria-hidden />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={time.duration || 0}
          step={0.05}
          value={time.current}
          aria-label={t('seek')}
          onChange={(event) => {
            const video = ref.current
            if (video) video.currentTime = Number(event.currentTarget.value)
          }}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-background"
        />
        <span className="shrink-0 font-mono text-2xs tabular-nums">
          {formatTime(time.current)} / {formatTime(time.duration)}
        </span>
      </div>
    </div>
  )
}
