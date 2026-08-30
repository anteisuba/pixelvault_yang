'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  VOICE_LINE_EMOTION_CHOICES,
  VOICE_ROOM_HANDOFF_MS,
  VOICE_ROOM_SHAKE_MS,
} from '@/constants/voiceroom'
import type { AudioEmotion } from '@/constants/voice-cards'
import type { VoiceLineRecord } from '@/types/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'

/**
 * 一条台词的气泡：谁说的 · 说了什么 · 声音 · 什么情感。
 *
 * 三种状态各有各的样子——生成中是跳动的点，失败是红字加重试，完成才是波形条。
 * 「有没有 url」不足以分辨前两者，所以看的是 `audio.status`。
 */

const WAVE_BAR_COUNT = 14

/**
 * 假波形。
 *
 * ⚠ 它不是音频的真实包络：画真波形要把音频解码一遍，为一条几秒的语音不值。
 * 但每条**必须长得不一样**，否则一屏气泡整齐划一，反而像坏了——所以用 id 生成
 * 稳定的伪随机高度，同一条台词每次渲染都一致。
 */
function waveOf(seed: string): number[] {
  let hash = 2166136261
  const bars: number[] = []
  for (let i = 0; i < WAVE_BAR_COUNT; i += 1) {
    hash ^= seed.charCodeAt(i % seed.length)
    hash = Math.imul(hash, 16777619)
    bars.push(30 + (Math.abs(hash) % 65))
  }
  return bars
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 还在路上（正在开口）。 */
function isPendingStatus(status?: string): boolean {
  return status === 'QUEUED' || status === 'RUNNING'
}

interface VoiceLineBubbleProps {
  line: VoiceLineRecord
  /** 切房间时逐条接力的延迟；新落的单条是 0，不该排队等。 */
  staggerMs?: number
  onRetake: (
    lineId: string,
    patch: { emotion?: AudioEmotion | null },
  ) => Promise<void> | void
}

export function VoiceLineBubble({
  line,
  staggerMs = 0,
  onRetake,
}: VoiceLineBubbleProps) {
  const t = useTranslations('VoiceRoom')
  const [pickerOpen, setPickerOpen] = useState(false)
  /**
   * ⚠ 九个情感 chip **按需挂载**：一个房间最多 500 条台词
   * （`VOICE_ROOM_LINES_MAX`），无条件渲染就是 4500 个按钮。展开器的外壳一直
   * 在（`0fr` 是过渡的起点，元素当场才挂就没有起点、展开会直接跳出来），只有
   * 内容等到这条气泡真被点开过才渲染。
   */
  const [everOpened, setEverOpened] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rowRef = useRef<HTMLSpanElement | null>(null)

  const status = line.audio?.status
  const url = line.audio?.url ?? null
  const pending = isPendingStatus(status)

  /**
   * 「正在开口」→ 语音条的 180ms 交接。
   *
   * React 里状态一翻，讲话丸当帧就被卸载，没有退场可言。所以多留它一会儿：状态
   * 已经结算了、但 `leavingPill` 还是 true 的那 180ms 里，丸子挂着 `data-out`
   * 缩下去，语音条同时淡入——两件事重叠，读起来才是「交接」而不是「换了个东西」。
   */
  const [leavingPill, setLeavingPill] = useState(false)
  const wasPendingRef = useRef(pending)

  useEffect(() => {
    const wasPending = wasPendingRef.current
    wasPendingRef.current = pending
    if (pending || !wasPending) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步的是「状态刚刚翻过去」这个外部事件，不是从渲染输入推得出来的值
    setLeavingPill(true)
    const timer = window.setTimeout(
      () => setLeavingPill(false),
      VOICE_ROOM_HANDOFF_MS,
    )
    return () => window.clearTimeout(timer)
  }, [pending])

  /**
   * 失败只 shake **一次**，而且只在「刚刚失败」时。
   *
   * ⚠ 不能用 `:has(.vr-failed)` 之类的纯 CSS：那样刷新页面时，历史上失败过的每
   * 一条都会在挂载瞬间一起抖，看着像整个页面坏了。抖的是**这一刻发生的事**。
   */
  const [shake, setShake] = useState(false)
  const prevStatusRef = useRef(status)

  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status
    if (status !== 'FAILED' || !prev || prev === 'FAILED') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同上：这是一次状态跃迁的回应，不是派生值
    setShake(true)
    // ⚠ 用定时器收尾而不是 `onAnimationEnd`：animationend **会冒泡**，子元素的
    // 失败条淡入、语音条淡入都会顺着上来把 shake 提前清掉。
    const timer = window.setTimeout(() => setShake(false), VOICE_ROOM_SHAKE_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  // 点别处收起情感弹层。
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (event: MouseEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  // 组件卸载 / 换了声音时把正在放的停掉，免得气泡没了声音还在响。
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [url])

  const togglePlay = () => {
    if (!url) return
    if (!audioRef.current) {
      audioRef.current = new Audio(url)
      audioRef.current.addEventListener('ended', () => setPlaying(false))
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      void audioRef.current.play()
      setPlaying(true)
    }
  }

  const duration = formatDuration(line.audio?.duration ?? null)

  return (
    <div
      className="vr-msg"
      data-shake={shake || undefined}
      style={
        {
          '--vr-md': `${staggerMs}ms`,
          // 交接时长只有一个来源：CSS 那两条过渡读的就是这个值。
          '--vr-handoff': `${VOICE_ROOM_HANDOFF_MS}ms`,
        } as React.CSSProperties
      }
    >
      <VoiceAvatar
        id={line.speakerId}
        name={line.speakerName}
        cover={line.speakerCover}
        kind={line.speakerKind}
      />
      <div className="vr-msg-body">
        <span className="vr-who">{line.speakerName}</span>
        <span className="vr-bubble">{line.text}</span>

        {status === 'COMPLETED' && url ? (
          <span className="vr-voice-row" ref={rowRef}>
            <span className="vr-voice" data-kind={line.speakerKind} data-drawn>
              <button
                type="button"
                className="vr-play"
                onClick={togglePlay}
                aria-label={playing ? t('pause') : t('play')}
              >
                {playing ? (
                  <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden>
                    <path
                      d="M0 0h2.5v10H0zM5.5 0H8v10H5.5z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden>
                    <path d="M0.5 0.5l8 4.5-8 4.5z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <span className="vr-wave">
                {waveOf(line.id).map((height, index) => (
                  <i
                    key={index}
                    style={
                      { '--h': height, '--i': index } as React.CSSProperties
                    }
                  />
                ))}
              </span>
              {duration ? <span className="vr-dur">{duration}</span> : null}

              {/*
               * 情感角标**长在语音条里**：一条 take 是一个对象，不是两颗并排的
               * 丸子（owner 2026-08-29 看过旧样式后的判断）。分隔靠左侧一道细线。
               */}
              <button
                type="button"
                className="vr-emotion"
                aria-expanded={pickerOpen}
                onClick={() => {
                  setEverOpened(true)
                  setPickerOpen((open) => !open)
                }}
              >
                <span className="vr-emotion-t">
                  {line.emotion
                    ? t(`emotion.${line.emotion}`)
                    : t('emotion.auto')}
                </span>
                <svg width="7" height="5" viewBox="0 0 7 5" aria-hidden>
                  <path
                    d="M0.5 0.5l3 3.5 3-3.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                </svg>
              </button>
            </span>

            <span className="vr-emotion-pop" data-open={pickerOpen}>
              <span className="vr-emotion-pop-inner">
                {everOpened ? (
                  <span className="vr-emotion-chips">
                    <span className="vr-emotion-pop-title">
                      {t('retakeWith')}
                    </span>
                    {VOICE_LINE_EMOTION_CHOICES.map((choice, index) => (
                      <button
                        key={choice ?? 'auto'}
                        type="button"
                        className="vr-opt"
                        style={{ '--i': index } as React.CSSProperties}
                        data-current={(line.emotion ?? null) === choice}
                        onClick={() => {
                          setPickerOpen(false)
                          void onRetake(line.id, { emotion: choice })
                        }}
                      >
                        {choice ? t(`emotion.${choice}`) : t('emotion.auto')}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
            </span>
          </span>
        ) : null}

        {pending || leavingPill ? (
          <span className="vr-speaking" data-out={!pending || undefined}>
            <span className="vr-speaking-dots" aria-hidden>
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            {t('speaking')}
          </span>
        ) : null}

        {status === 'FAILED' ? (
          <span className="vr-failed">
            <span>⚠ {line.audio?.errorMessage ?? t('failed')}</span>
            <button
              type="button"
              className="vr-retry"
              onClick={() => void onRetake(line.id, {})}
            >
              {t('retry')}
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}
