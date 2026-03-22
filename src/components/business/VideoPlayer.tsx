'use client'

import { useState, useRef, useCallback } from 'react'
import { Play, Pause, Download, Maximize2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface VideoPlayerProps {
  src: string
  poster?: string
  width?: number
  height?: number
  className?: string
}

export default function VideoPlayer({
  src,
  poster,
  width,
  height,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hasError, setHasError] = useState(false)
  const t = useTranslations('VideoPlayer')

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

  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = src
    a.download = 'pixelvault-video.mp4'
    a.click()
  }, [src])

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center rounded-3xl border border-destructive/35 bg-destructive/8 p-8 ${className ?? ''}`}
      >
        <p className="font-serif text-sm text-destructive">
          {t('errorPlayback')}
        </p>
      </div>
    )
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border border-border/75 bg-foreground/5 ${className ?? ''}`}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        width={width}
        height={height}
        className="w-full"
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
          <span className="flex size-14 items-center justify-center rounded-full bg-foreground/70 text-background backdrop-blur-sm transition-transform hover:scale-110">
            <Play className="ml-1 size-6" fill="currentColor" />
          </span>
        </button>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-foreground/60 to-transparent px-3 pb-3 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
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
          onClick={handleFullscreen}
          className="flex size-8 items-center justify-center rounded-full text-background/90 hover:text-background"
          aria-label={t('fullscreen')}
        >
          <Maximize2 className="size-4" />
        </button>
        <button
          onClick={handleDownload}
          className="flex size-8 items-center justify-center rounded-full text-background/90 hover:text-background"
          aria-label={t('download')}
        >
          <Download className="size-4" />
        </button>
      </div>
    </div>
  )
}
