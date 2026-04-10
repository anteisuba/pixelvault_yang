'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Pause, Play } from 'lucide-react'

import { cn } from '@/lib/utils'

interface AudioPlayerProps {
  src: string
  className?: string
  compact?: boolean
}

function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

export function AudioPlayer({ src, className, compact }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoadedMetadata = () => setDuration(audio.duration)
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => setIsPlaying(false)

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current
      if (!audio || !duration) return

      const rect = e.currentTarget.getBoundingClientRect()
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      )
      audio.currentTime = ratio * duration
    },
    [duration],
  )

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border border-border bg-white p-3',
        compact && 'p-2 gap-2',
        className,
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm shadow-primary/20 transition-transform hover:scale-105',
          compact ? 'size-8' : 'size-10',
        )}
      >
        {isPlaying ? (
          <Pause className={compact ? 'size-3.5' : 'size-4'} />
        ) : (
          <Play className={cn(compact ? 'size-3.5' : 'size-4', 'ml-0.5')} />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div
          className="group relative h-1 cursor-pointer rounded-full bg-border"
          onClick={handleSeek}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between font-display text-[10px] text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      {!compact && (
        <a
          href={src}
          download
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-foreground transition-colors hover:bg-border"
        >
          <Download className="size-3.5" />
        </a>
      )}
    </div>
  )
}
