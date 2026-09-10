'use client'

/**
 * 视频节点的**大播放器**（spec §5，画板 `VideoExpanded.dc.html` 上半 /
 * `VideoQuickLook.dc.html`）。
 *
 * 一块 16:9 的画面 + 居中的播放圆钮 + 底部一条：进度 · 时钟 · 一组玻璃图标钮
 * （声音 / 抽帧 / 下载 —— 有哪几颗由调用方给）。
 *
 * ⛔ 不用原生 `controls`：画布在 CSS transform 里，原生控件条的热区在缩放下会漂，
 * 它自带的全屏 / 画中画在框里是误触源（legacy 的同一条结论）。
 * ⛔ 这里不抓帧、不下载：两件都只发回调 —— 抓帧要拿到这只 `<video>` 的 `currentTime`
 * （所以 `videoRef` 透出去），下载走 `<a download>` 由调用方发。
 */

import { useCallback, useImperativeHandle, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Download,
  Pause,
  Play,
  Scissors,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { formatVideoClock } from './video-node-model'

export interface VideoPlayerProps {
  readonly url: string
  readonly posterUrl?: string
  readonly title: string
  /** 抓当前帧的钮 —— 不给就不渲染（快速看里没有它）。 */
  onExtractFrame?: (video: HTMLVideoElement) => void
  readonly extracting?: boolean
  /** 下载钮 —— 不给就不渲染（快速看的下载在 `QuickLook` 自己的那一行）。 */
  onDownload?: () => void
  /** 把这只 `<video>` 透给调用方（抓帧要它的 `currentTime`）。 */
  readonly videoRef?: React.Ref<HTMLVideoElement | null>
  readonly className?: string
}

function GlassButton({
  icon: Icon,
  label,
  disabled,
  testId,
  onClick,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly disabled?: boolean
  readonly testId: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      data-video-action={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        'nodrag nopan flex size-6.5 items-center justify-center rounded-lg text-foreground',
        'transition-colors duration-fast ease-standard hover:bg-surface-fill-hover',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
    </button>
  )
}

export function VideoPlayer({
  url,
  posterUrl,
  title,
  onExtractFrame,
  extracting = false,
  onDownload,
  videoRef,
  className,
}: VideoPlayerProps) {
  const t = useTranslations('StudioNode.v4.player')
  const innerRef = useRef<HTMLVideoElement | null>(null)
  // ⚠ 透出去的是「现在挂着的那一只」，可能是 null（还没挂上 / 已卸载）——
  // 调用方（抽帧）本来就要先判空，⛔ 不在这里断言成非空。
  useImperativeHandle<HTMLVideoElement | null, HTMLVideoElement | null>(
    videoRef,
    () => innerRef.current,
    [],
  )
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [clock, setClock] = useState({ current: 0, total: 0 })

  const togglePlay = useCallback(() => {
    const video = innerRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => setPlaying(false))
    else video.pause()
  }, [])

  const progress = clock.total > 0 ? clock.current / clock.total : 0

  return (
    <div
      data-video-player="ready"
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-node bg-surface-sunken corner-squircle',
        className,
      )}
    >
      <video
        ref={innerRef}
        src={url}
        poster={posterUrl}
        muted={muted}
        playsInline
        preload="metadata"
        aria-label={title}
        className="size-full object-cover"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) =>
          setClock({
            current: 0,
            total: Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0,
          })
        }
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          const element = event.currentTarget
          setClock({
            current: element.currentTime,
            total: Number.isFinite(element.duration) ? element.duration : 0,
          })
        }}
      />

      {/* 居中大播放钮：只在暂停时出现（画板上放着的时候画面是干净的）。 */}
      {playing ? null : (
        <button
          type="button"
          data-video-play
          aria-label={t('play')}
          onClick={togglePlay}
          className="nodrag nopan absolute top-1/2 left-1/2 flex size-13 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full surface-glass shadow-node-chrome focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Play aria-hidden className="size-5" />
        </button>
      )}

      <div className="absolute right-3.5 bottom-3 left-3.5 flex items-center gap-2.5">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          data-video-progress
          aria-label={t('progress')}
          className="nodrag nopan h-0.75 min-w-0 flex-1 accent-primary"
          onChange={(event) => {
            const video = innerRef.current
            const next = Number(event.target.value)
            if (video && video.duration > 0) {
              video.currentTime = next * video.duration
            }
          }}
        />
        {/* 时钟走等宽 tabular，⛔ 不让秒数跳动时把进度条推来推去。 */}
        <span
          data-video-clock
          className="shrink-0 rounded-full px-1.75 py-0.5 text-3xs tabular-nums surface-glass"
        >
          {formatVideoClock(clock.current)} / {formatVideoClock(clock.total)}
        </span>
        <span className="flex shrink-0 items-center gap-0 rounded-lg p-0.5 surface-glass">
          <GlassButton
            testId="mute"
            icon={muted ? VolumeX : Volume2}
            label={muted ? t('unmute') : t('mute')}
            onClick={() => {
              const video = innerRef.current
              const next = !muted
              setMuted(next)
              if (video) video.muted = next
            }}
          />
          {onExtractFrame ? (
            <GlassButton
              testId="extract"
              icon={Scissors}
              label={t('captureFrames')}
              disabled={extracting}
              onClick={() => {
                const video = innerRef.current
                if (video) onExtractFrame(video)
              }}
            />
          ) : null}
          {onDownload ? (
            <GlassButton
              testId="download"
              icon={Download}
              label={t('download')}
              onClick={onDownload}
            />
          ) : null}
          {playing ? (
            <GlassButton
              testId="pause"
              icon={Pause}
              label={t('pause')}
              onClick={togglePlay}
            />
          ) : null}
        </span>
      </div>
    </div>
  )
}
