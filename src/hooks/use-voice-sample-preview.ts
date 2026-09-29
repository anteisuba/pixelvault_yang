'use client'

/**
 * **试听**一副音色 / 一段声音 —— 音色 chip 弹层与声音库面板共用这一份（⛔ 各写一个
 * `new Audio`）。一次只响一条，点同一条 = 停，切一条就停上一条，卸载即停。
 *
 * ⚠ 地址没有、或是会过期的签名链接（Fish 示例常是一小时的 `X-Amz-Expires`），而这一行
 * 带着 `voiceId` → 先向声音库现取一条新的再放（owner 2026-09-29 真机：音色弹层大半行
 * 按不响）。⛔ 不把现取来的地址存回去：它一小时后照样过期。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { getVoiceAPI } from '@/lib/api-client'
import { durableSampleUrl } from '@/lib/voice-sample-url'

export interface VoiceSamplePreviewTarget {
  /** 这一行是谁（「谁在响」的标识，与选中无关）。 */
  readonly id: string
  readonly url: string | null
  /** 有它才能在地址不可用时现取一条示例。 */
  readonly voiceId?: string | null
}

export interface VoiceSamplePreview {
  readonly playingId: string | null
  /** 正在响的那一条放到哪了（0–1），头像外圈那道进度环读它。 */
  readonly progress: number
  /** 正在现取示例的那一行。 */
  readonly loadingId: string | null
  toggle(target: VoiceSamplePreviewTarget): void
  stop(): void
}

/** 这一行按得动试听吗（有地址，或能现取）。 */
export function canPreviewVoiceSample(target: {
  readonly url: string | null
  readonly voiceId?: string | null
}): boolean {
  return Boolean(target.url || target.voiceId)
}

export function useVoiceSamplePreview(): VoiceSamplePreview {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playingRef = useRef<string | null>(null)
  /** 最后一次点的是第几下：现取回来时已经换了一行就作废。 */
  const requestRef = useRef(0)

  const setPlaying = useCallback((id: string | null) => {
    playingRef.current = id
    setPlayingId(id)
  }, [])

  const stop = useCallback(() => {
    requestRef.current += 1
    audioRef.current?.pause()
    audioRef.current = null
    setLoadingId(null)
    setProgress(0)
    setPlaying(null)
  }, [setPlaying])

  useEffect(
    () => () => {
      audioRef.current?.pause()
    },
    [],
  )

  const toggle = useCallback(
    (target: VoiceSamplePreviewTarget) => {
      if (playingRef.current === target.id) {
        stop()
        return
      }
      stop()
      const request = requestRef.current

      const play = (src: string) => {
        if (request !== requestRef.current) return
        const audio = new Audio(src)
        audioRef.current = audio
        audio.onended = () => {
          if (playingRef.current === target.id) setPlaying(null)
          setProgress(0)
        }
        audio.ontimeupdate = () => {
          if (audio.duration > 0)
            setProgress(audio.currentTime / audio.duration)
        }
        setPlaying(target.id)
        void audio.play().catch(() => {
          if (playingRef.current === target.id) setPlaying(null)
        })
      }

      const durable = durableSampleUrl(target.url)
      if (durable || !target.voiceId) {
        const src = durable ?? target.url
        if (src) play(src)
        return
      }

      const voiceId = target.voiceId
      setLoadingId(target.id)
      void getVoiceAPI(voiceId).then((resolved) => {
        if (request !== requestRef.current) return
        setLoadingId(null)
        const fresh = resolved.success
          ? resolved.data?.samples.find((sample) => sample.audio)?.audio
          : undefined
        const src = fresh ?? target.url
        if (src) play(src)
      })
    },
    [setPlaying, stop],
  )

  return { playingId, progress, loadingId, toggle, stop }
}
