'use client'

import { useEffect, useRef, useState } from 'react'

interface HomepageTtsPlayerProps {
  src?: string
  label: string
  caption: string
  playLabel: string
  pauseLabel: string
}

const BAR_COUNT = 60
const SVG_NUMBER_DECIMALS = 3

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(SVG_NUMBER_DECIMALS)).toString()
}

const BAR_GEOMETRY = Array.from({ length: BAR_COUNT }, (_, i) => {
  const h = 30 + 70 * Math.abs(Math.sin(i * 0.42)) * Math.sin(i * 0.12 + 1)
  const heightValue = Math.max(8, Math.min(96, Math.abs(h)))
  const height = formatSvgNumber(heightValue)

  return {
    x: i * 6,
    y: formatSvgNumber(100 - Number(height) / 2),
    height,
  }
})

export function HomepageTtsPlayer({
  src = '/homepage/tts/sample.mp3',
  label,
  caption,
  playLabel,
  pauseLabel,
}: HomepageTtsPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => {
      setCurrent(a.currentTime)
      if (a.duration > 0) setProgress(a.currentTime / a.duration)
    }
    const onMeta = () => setDuration(a.duration || 0)
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
      setCurrent(0)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onCanPlay = () => setError(false)
    const onErr = () => {
      a.pause()
      setPlaying(false)
      setError(true)
    }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('canplay', onCanPlay)
    a.addEventListener('error', onErr)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnd)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('canplay', onCanPlay)
      a.removeEventListener('error', onErr)
    }
  }, [])

  const toggle = async () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      setError(false)
      if (a.error) a.load()
      try {
        await a.play()
      } catch {
        setPlaying(false)
        setError(true)
      }
      return
    }

    a.pause()
  }

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? pauseLabel : playLabel}
        className="absolute inset-0 z-[4] cursor-pointer"
      >
        <span className="sr-only">{playing ? pauseLabel : playLabel}</span>
      </button>

      <svg
        viewBox={`0 0 ${BAR_COUNT * 6} 200`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-1/2 z-[2] h-[70%] w-full -translate-y-1/2 opacity-95"
        aria-hidden="true"
      >
        {BAR_GEOMETRY.map((bar, i) => {
          const active = i / BAR_COUNT < progress
          return (
            <rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={3.2}
              height={bar.height}
              rx={1.5}
              fill="currentColor"
              className={
                active
                  ? 'text-white transition-colors duration-150'
                  : 'text-white/35 transition-colors duration-150'
              }
            />
          )
        })}
      </svg>

      <div className="pointer-events-none relative z-[3] flex flex-col items-center gap-3">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/25 bg-black/55 backdrop-blur-md transition-all ${
            error ? 'opacity-40' : 'group-hover:scale-105'
          } ${playing ? 'shadow-[0_0_0_6px_rgba(255,255,255,0.08)]' : ''}`}
          aria-hidden="true"
        >
          {error ? (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 fill-white/70"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a1 1 0 011 1v5a1 1 0 11-2 0V8a1 1 0 011-1zm0 11a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4z" />
            </svg>
          ) : playing ? (
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 fill-white"
              aria-hidden="true"
            >
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 fill-white"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 font-mono text-[11px] text-white/90 backdrop-blur-sm">
          <span>{label}</span>
          <span className="text-white/40">·</span>
          <span className="tabular-nums text-white/70">
            {error ? '0:00 / 0:00' : `${fmt(current)} / ${fmt(duration)}`}
          </span>
        </div>

        <div className="rounded-full border border-white/15 bg-black/45 px-3 py-1 font-mono text-[10px] tracking-wide text-white/75 backdrop-blur-sm">
          {caption}
        </div>
      </div>
    </div>
  )
}
