'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  Download,
  Maximize2,
  Volume2,
  VolumeX,
} from '@/components/icons'
import { useTranslations } from 'next-intl'

import { downloadRemoteAsset } from '@/lib/api-client/shared'

interface VideoPlayerProps {
  src: string
  poster?: string
  width?: number
  height?: number
  className?: string
  /**
   * - `fill`（默认）：按容器宽度铺开，高随片子。
   * - `contain`：按片子自身尺寸，最高到 `--studio-generation-media-max-height`（按视口）。
   * - `box`：**撑满宿主给的框**，片子在框里等比放到最大、⛔ 裁切。宿主框高度确定时用
   *   （工作台舞台的 `studio-fit-box`）—— `contain` 按视口封顶，在比视口矮的舞台里会
   *   冲出框、被 overflow 切掉上下沿连同底部控件（2026-11-17 真机）。
   */
  fit?: 'fill' | 'contain' | 'box'
}

const ROOT_FIT_CLASS = {
  fill: '',
  contain: 'video-player--contain',
  box: 'size-full',
} as const

const MEDIA_FIT_CLASS = {
  fill: 'w-full',
  contain: 'video-player-media--contain',
  box: 'block size-full object-contain',
} as const

export default function VideoPlayer({
  src,
  poster,
  width,
  height,
  className,
  fit = 'fill',
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const t = useTranslations('VideoPlayer')

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setIsMuted(video.muted)
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.duration) return
    setProgress((video.currentTime / video.duration) * 100)
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    setProgress(0)
  }, [])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video || !video.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    video.currentTime = ratio * video.duration
  }, [])

  const handleFullscreen = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.requestFullscreen) {
      video.requestFullscreen()
    }
  }, [])

  const handleDownload = useCallback(async () => {
    const result = await downloadRemoteAsset(src, 'antei-video.mp4')
    if (!result.success) {
      window.open(src, '_blank', 'noopener,noreferrer')
    }
  }, [src])

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center rounded-3xl border border-status-risk/35 bg-status-risk-surface p-8 ${className ?? ''}`}
      >
        <p className="text-sm text-destructive">{t('errorPlayback')}</p>
      </div>
    )
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border border-border/75 bg-foreground/5 ${ROOT_FIT_CLASS[fit]} ${className ?? ''}`}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        width={width}
        height={height}
        className={MEDIA_FIT_CLASS[fit]}
        preload="metadata"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={() => setHasError(true)}
        onClick={togglePlay}
      />

      {/* Center play button (shown when paused) */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center transition-opacity"
          aria-label={t('play')}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-sm transition-transform hover:scale-110">
            <Play className="ml-1 size-6" fill="currentColor" />
          </span>
        </button>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-foreground/60 to-transparent px-3 pb-3 pt-8 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        {/* Progress bar */}
        <div
          className="h-1 flex-1 cursor-pointer rounded-full bg-background/30"
          onClick={handleSeek}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Action buttons */}
        <button
          onClick={togglePlay}
          className="flex size-8 items-center justify-center rounded-full text-background/90 hover:text-background"
          aria-label={isPlaying ? t('pause') : t('play')}
        >
          {isPlaying ? (
            <Pause className="size-4" fill="currentColor" />
          ) : (
            <Play className="size-4" fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          className="touch-target flex size-8 items-center justify-center rounded-full text-background/90 hover:text-background"
          aria-label={isMuted ? t('unmute') : t('mute')}
          aria-pressed={isMuted}
        >
          {isMuted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </button>
        <button
          onClick={handleFullscreen}
          className="flex size-8 items-center justify-center rounded-full text-background/90 hover:text-background"
          aria-label={t('fullscreen')}
        >
          <Maximize2 className="size-4" />
        </button>
        <button
          onClick={() => {
            void handleDownload()
          }}
          className="flex size-8 items-center justify-center rounded-full text-background/90 hover:text-background"
          aria-label={t('download')}
        >
          <Download className="size-4" />
        </button>
      </div>
    </div>
  )
}
