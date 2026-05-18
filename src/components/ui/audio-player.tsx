'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, FastForward, Pause, Play, Rewind } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const
const SKIP_SECONDS = 5
const WAVEFORM_BAR_COUNT = 36
const MIN_WAVEFORM_PEAK = 0.12
const FALLBACK_WAVEFORM_PEAKS = [
  0.28, 0.42, 0.36, 0.62, 0.48, 0.78, 0.54, 0.4, 0.68, 0.88, 0.46, 0.58, 0.74,
  0.5, 0.34, 0.56, 0.82, 0.66, 0.44, 0.76, 0.6, 0.38, 0.7, 0.92, 0.52, 0.64,
  0.86, 0.48, 0.3, 0.58, 0.72, 0.42, 0.68, 0.5, 0.36, 0.6,
] as const

export interface AudioPlayerSegment {
  text: string
  start: number
  end: number
}

interface AudioPlayerProps {
  src: string
  className?: string
  compact?: boolean
  segments?: AudioPlayerSegment[]
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

function clampTime(value: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.max(0, value)
  }
  return Math.max(0, Math.min(duration, value))
}

function buildWaveformPeaks(
  audioBuffer: AudioBuffer,
  barCount: number,
): number[] {
  const sampleCount = audioBuffer.length
  const samplesPerBar = Math.max(1, Math.floor(sampleCount / barCount))
  const channelData = Array.from(
    { length: audioBuffer.numberOfChannels },
    (_, channel) => audioBuffer.getChannelData(channel),
  )

  const peaks = Array.from({ length: barCount }, (_, barIndex) => {
    const start = barIndex * samplesPerBar
    const end =
      barIndex === barCount - 1
        ? sampleCount
        : Math.min(sampleCount, start + samplesPerBar)
    let peak = 0

    for (const data of channelData) {
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(data[index] ?? 0))
      }
    }

    return peak
  })
  const maxPeak = Math.max(...peaks, MIN_WAVEFORM_PEAK)

  return peaks.map((peak) =>
    Math.max(MIN_WAVEFORM_PEAK, Math.min(1, peak / maxPeak)),
  )
}

export function AudioPlayer({
  src,
  className,
  compact,
  segments = [],
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const t = useTranslations('AudioPlayer')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState<number>(1)
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([
    ...FALLBACK_WAVEFORM_PEAKS,
  ])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
      setCurrentTime(audio.currentTime)
    }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.playbackRate = playbackRate
  }, [playbackRate])

  useEffect(() => {
    if (compact) return

    let cancelled = false
    let audioContext: AudioContext | null = null
    const controller = new AbortController()
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext

    if (!AudioContextCtor) return

    async function loadWaveform() {
      try {
        const response = await fetch(src, { signal: controller.signal })
        if (!response.ok) return

        const arrayBuffer = await response.arrayBuffer()
        audioContext = new AudioContextCtor()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        if (!cancelled) {
          setWaveformPeaks(buildWaveformPeaks(audioBuffer, WAVEFORM_BAR_COUNT))
        }
      } catch {
        if (!cancelled) {
          setWaveformPeaks([...FALLBACK_WAVEFORM_PEAKS])
        }
      } finally {
        if (audioContext) {
          void audioContext.close()
        }
      }
    }

    void loadWaveform()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [src, compact])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      void audio.play().catch(() => {
        setIsPlaying(false)
      })
    }
  }, [isPlaying])

  const seekToTime = useCallback(
    (nextTime: number) => {
      const audio = audioRef.current
      if (!audio) return

      const clamped = clampTime(nextTime, duration || audio.duration)
      audio.currentTime = clamped
      setCurrentTime(clamped)
    },
    [duration],
  )

  const skipBy = useCallback(
    (delta: number) => {
      seekToTime(currentTime + delta)
    },
    [currentTime, seekToTime],
  )

  const handleSeek = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const audio = audioRef.current
      if (!audio || !duration) return

      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = Math.max(
        0,
        Math.min(1, (event.clientX - rect.left) / rect.width),
      )
      seekToTime(ratio * duration)
    },
    [duration, seekToTime],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) return

      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        togglePlay()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        skipBy(-SKIP_SECONDS)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        skipBy(SKIP_SECONDS)
      }
    },
    [skipBy, togglePlay],
  )

  const activeSegmentIndex = useMemo(() => {
    if (segments.length === 0) return -1
    return segments.findIndex(
      (segment) => currentTime >= segment.start && currentTime <= segment.end,
    )
  }, [currentTime, segments])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      role="group"
      aria-label={t('player')}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-xl border border-border bg-card outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/40',
        compact ? 'flex items-center gap-2 p-2' : 'space-y-3 p-3',
        className,
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {!compact && (
        <button
          type="button"
          onClick={handleSeek}
          aria-label={t('waveform')}
          className="group flex h-12 w-full items-center gap-1 rounded-lg bg-muted/30 px-2 outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {waveformPeaks.map((peak, index) => {
            const barProgress = ((index + 1) / waveformPeaks.length) * 100
            return (
              <span
                key={`${index}-${peak}`}
                className={cn(
                  'flex-1 rounded-full transition-colors',
                  barProgress <= progress
                    ? 'bg-primary'
                    : 'bg-muted-foreground/25 group-hover:bg-muted-foreground/35',
                )}
                style={{ height: `${Math.round(peak * 100)}%` }}
              />
            )
          })}
        </button>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? t('pause') : t('play')}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm shadow-primary/20 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'size-8' : 'size-10',
          )}
        >
          {isPlaying ? (
            <Pause className={compact ? 'size-3.5' : 'size-4'} />
          ) : (
            <Play className={cn(compact ? 'size-3.5' : 'size-4', 'ml-0.5')} />
          )}
        </button>

        {!compact && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => skipBy(-SKIP_SECONDS)}
              aria-label={t('rewind', { seconds: SKIP_SECONDS })}
              className="flex size-8 items-center justify-center rounded-lg bg-background text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Rewind className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => skipBy(SKIP_SECONDS)}
              aria-label={t('forward', { seconds: SKIP_SECONDS })}
              className="flex size-8 items-center justify-center rounded-lg bg-background text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FastForward className="size-3.5" />
            </button>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {compact ? (
            <button
              type="button"
              className="group relative h-2 cursor-pointer rounded-full bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={handleSeek}
              aria-label={t('seek')}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </button>
          ) : (
            // Non-interactive thin indicator — seek interaction lives on the
            // waveform above so users don't see two redundant scrubbers.
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, Math.round(duration))}
              aria-valuenow={Math.max(0, Math.round(currentTime))}
              className="relative h-1 rounded-full bg-border"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <div className="flex justify-between font-display text-[10px] text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
          </div>
        </div>

        {!compact && (
          <select
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
            aria-label={t('playbackRate')}
            className="h-8 shrink-0 rounded-lg border border-border/60 bg-background px-2 font-display text-xs text-foreground outline-none transition-colors hover:bg-border/45 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        )}

        {!compact && (
          <a
            href={src}
            download
            aria-label={t('download')}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-3.5" />
          </a>
        )}
      </div>

      {!compact && segments.length > 0 && (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/50 bg-background/40 p-2">
          {segments.map((segment, index) => (
            <button
              key={`${segment.start}-${segment.end}-${segment.text}`}
              type="button"
              onClick={() => seekToTime(segment.start)}
              aria-current={activeSegmentIndex === index ? 'true' : undefined}
              className={cn(
                'block w-full rounded-md px-2 py-1 text-left text-xs leading-5 transition-colors',
                activeSegmentIndex === index
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <span className="mr-2 font-mono text-2xs text-muted-foreground">
                {formatTime(segment.start)}
              </span>
              {segment.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
