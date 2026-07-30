'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HOME_V3_VIDEO_DEMO } from '@/constants/home-v3'

function formatVideoTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds)
    ? Math.max(0, Math.floor(seconds))
    : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function HomeV3VideoPlayer() {
  const t = useTranslations('Homepage.videoDemo')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState<number>(
    HOME_V3_VIDEO_DEMO.durationSeconds,
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  const progress =
    duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0
  const currentFrame = useMemo(
    () =>
      Math.min(
        HOME_V3_VIDEO_DEMO.frames.length - 1,
        Math.floor((progress / 100) * HOME_V3_VIDEO_DEMO.frames.length),
      ),
    [progress],
  )

  const play = useCallback(async () => {
    const video = videoRef.current
    if (!video || reducedMotion) return

    try {
      await video.play()
    } catch {
      setIsPlaying(false)
    }
  }, [reducedMotion])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video || reducedMotion) return

    if (video.paused) {
      void play()
    } else {
      video.pause()
    }
  }, [play, reducedMotion])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    const syncMotionPreference = () => {
      const video = videoRef.current
      setReducedMotion(mediaQuery.matches)

      if (mediaQuery.matches) {
        video?.pause()
        setCurrentTime(HOME_V3_VIDEO_DEMO.durationSeconds)
        return
      }

      void video?.play().catch(() => setIsPlaying(false))
    }

    syncMotionPreference()
    mediaQuery.addEventListener('change', syncMotionPreference)

    return () => {
      mediaQuery.removeEventListener('change', syncMotionPreference)
    }
  }, [])

  return (
    <div className="home-v3-vp">
      <div className="home-v3-vscreen">
        <video
          ref={videoRef}
          className="home-v3-vmedia"
          muted
          playsInline
          loop
          preload="auto"
          poster={HOME_V3_VIDEO_DEMO.shot}
          onClick={togglePlayback}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) {
              setDuration(event.currentTarget.duration)
            }
          }}
          onTimeUpdate={(event) =>
            setCurrentTime(event.currentTarget.currentTime)
          }
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          aria-hidden="true"
        >
          <source src={HOME_V3_VIDEO_DEMO.video} type="video/mp4" />
        </video>

        <Image
          className="home-v3-vposter"
          src={HOME_V3_VIDEO_DEMO.reducedMotionShot}
          alt=""
          width={960}
          height={540}
        />

        <span className="home-v3-vtag">{HOME_V3_VIDEO_DEMO.model}</span>
        <button
          type="button"
          className="home-v3-vplay"
          data-playing={isPlaying ? true : undefined}
          onClick={togglePlayback}
          disabled={reducedMotion}
          aria-label={isPlaying ? t('pause') : t('play')}
        >
          <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>
        </button>
      </div>

      <div className="home-v3-vbar">
        <span>{formatVideoTime(currentTime)}</span>
        <div className="home-v3-vscrub">
          <i style={{ width: `${progress}%` }} />
          <b style={{ left: `${progress}%` }} />
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={Math.min(currentTime, duration)}
            disabled={reducedMotion}
            aria-label={t('seek')}
            onChange={(event) => {
              const nextTime = Number(event.currentTarget.value)
              const video = videoRef.current
              if (!video || !Number.isFinite(nextTime)) return

              video.currentTime = nextTime
              setCurrentTime(nextTime)
            }}
          />
        </div>
        <span>{formatVideoTime(duration)}</span>
      </div>

      <div className="home-v3-vstrip">
        {HOME_V3_VIDEO_DEMO.frames.map((frame, index) => (
          <figure
            key={frame}
            data-current={index === currentFrame ? true : undefined}
          >
            <Image src={frame} alt="" width={200} height={125} />
          </figure>
        ))}
      </div>
    </div>
  )
}
