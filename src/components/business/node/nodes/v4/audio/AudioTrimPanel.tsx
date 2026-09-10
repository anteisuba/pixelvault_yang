'use client'

/**
 * 音频**裁剪面板**（spec §4，画板 `AudioTrim.dc.html`）。
 *
 * 点了工具条那颗剪刀，卡下方的**提示词栏换成这一块**（⛔ 不是又一个对话框）：
 * 大波形 96 高 + 两端手柄 + 选区外压暗 + 播放头 + 入 / 出点 / 选区读数 + 只播选区
 * 的试听 + `I` / `O` / `Esc`，底下「取消 · 裁剪为新版本」。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **纯呈现 + 受控**：不认识节点、不发 op、不上传。它只吐一对入出点秒数，切采样
 *    与编 WAV 在 `src/lib/audio-trim.ts`，落版本在调用方。
 * ② **非破坏**：文案与行为都写死「裁出来的是新版本，原音留作上一版」——⛔ 不提供
 *    任何覆盖原音的路径。
 * ③ **试听只播选区**：`<audio>` 的 `currentTime` 被夹在 `[入, 出)` 里循环，
 *    ⛔ 不放全曲（那样手柄拖到哪儿都听不出差别）。
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pause, Play } from 'lucide-react'

import { NODE_V4_AUDIO_TRIM } from '@/constants/node-studio'
import type { AudioTrimRange } from '@/lib/audio-trim'
import { cn } from '@/lib/utils'

import { AudioWaveform } from './AudioWaveform'
import { formatAudioClock, formatAudioSeconds } from './audio-node-model'

export interface AudioTrimPanelProps {
  /** 当前这一版的地址（试听与「裁剪为新版本」都对着它）。 */
  readonly url: string
  /** 整段时长（秒）。⚠ ≤ 0 时面板没有可拖的坐标系，调用方不该打开它。 */
  readonly durationSec: number
  /** 波形种子 —— 与矮卡同一颗，两处画出来才是同一条波。 */
  readonly seed: string
  /** 正在切 / 传（按钮转成禁用）。 */
  readonly busy?: boolean
  onCancel(): void
  onConfirm(range: AudioTrimRange): void
  readonly className?: string
}

/** 拖的是哪一端。 */
const TRIM_HANDLE = { start: 'start', end: 'end' } as const
type TrimHandle = (typeof TRIM_HANDLE)[keyof typeof TRIM_HANDLE]

export function AudioTrimPanel({
  url,
  durationSec,
  seed,
  busy = false,
  onCancel,
  onConfirm,
  className,
}: AudioTrimPanelProps) {
  const t = useTranslations('StudioNode.v4.audio.trim')
  const total = Math.max(0, durationSec)
  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(total)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const draggingRef = useRef<TrimHandle | null>(null)
  /**
   * 在波形上拖出选区那一手（画板：「拖两端手柄或在波形上拖出选区」）。按下先记着，
   * 挪过阈值才算拖 —— 没挪就是点一下放播放头。
   */
  const marqueeRef = useRef<{
    clientX: number
    seconds: number
    moved: boolean
  } | null>(null)
  /** 手柄的上一步（画板：面板内 ⌘Z 撤上一步手柄）。⛔ 不进画布的撤销栈：这一格还没落库。 */
  const historyRef = useRef<{ startSec: number; endSec: number }[]>([])

  // 时长是异步回来的（`loadedmetadata`）——回来那一刻出点还停在 0 的话，面板一开
  // 就是个 0 长度的选区。所以整段变长时把出点跟到末尾。
  const [syncedTotal, setSyncedTotal] = useState(total)
  if (syncedTotal !== total) {
    setSyncedTotal(total)
    setStartSec(0)
    setEndSec(total)
    setPlayhead(0)
  }

  const min = NODE_V4_AUDIO_TRIM.minSelectionSec
  const ratioOf = (seconds: number) => (total > 0 ? seconds / total : 0)
  const percent = (seconds: number) => `${ratioOf(seconds) * 100}%`

  const secondsAtClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * total
  }

  const moveHandle = (handle: TrimHandle, seconds: number) => {
    if (handle === TRIM_HANDLE.start) {
      const next = Math.min(Math.max(0, seconds), Math.max(0, endSec - min))
      setStartSec(next)
      setPlayhead(next)
      return
    }
    const next = Math.max(
      Math.min(total, seconds),
      Math.min(total, startSec + min),
    )
    setEndSec(next)
    setPlayhead(next)
  }

  /** 记一步（拖手柄 / 拖选区 / I / O 各算一步，一次连续拖只记按下那一刻）。 */
  const pushHistory = () => {
    historyRef.current.push({ startSec, endSec })
  }

  /** ⌘Z：退回上一步的入出点。栈空就什么都不做（⛔ 不退成 0）。 */
  const undoHandles = () => {
    const previous = historyRef.current.pop()
    if (!previous) return
    setStartSec(previous.startSec)
    setEndSec(previous.endSec)
    setPlayhead(previous.startSec)
  }

  /** 拖出来的一段：按下点与当前点各当一端，短过最短选区就撑到最短。 */
  const setSelection = (a: number, b: number) => {
    const low = Math.max(0, Math.min(a, b))
    const high = Math.min(total, Math.max(a, b))
    const end = Math.max(high, Math.min(total, low + min))
    setStartSec(Math.min(low, Math.max(0, end - min)))
    setEndSec(end)
    setPlayhead(low)
  }

  // 拖的时候鼠标经常跑出面板 —— 监听挂在 window 上，⛔ 不挂在手柄本身
  // （那样一出界就断，手柄粘在半路）。
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const handle = draggingRef.current
      if (handle) {
        event.preventDefault()
        moveHandle(handle, secondsAtClientX(event.clientX))
        return
      }
      const marquee = marqueeRef.current
      if (!marquee) return
      if (
        !marquee.moved &&
        Math.abs(event.clientX - marquee.clientX) <
          NODE_V4_AUDIO_TRIM.marqueeThresholdPx
      ) {
        return
      }
      marquee.moved = true
      event.preventDefault()
      setSelection(marquee.seconds, secondsAtClientX(event.clientX))
    }
    const onUp = (event: PointerEvent) => {
      const marquee = marqueeRef.current
      // 按下又没挪 = 点了一下：只放播放头（⛔ 不重置已经调好的入出点）。
      if (marquee && !marquee.moved)
        setPlayhead(secondsAtClientX(event.clientX))
      marqueeRef.current = null
      draggingRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  /** 试听：从入点起播，到出点绕回去（`I` / `O` 改完立刻听得出来）。 */
  const togglePreview = () => {
    const el = audioRef.current
    if (!el) return
    if (!el.paused) {
      el.pause()
      return
    }
    el.currentTime = startSec
    void el.play().catch(() => setPlaying(false))
  }

  const selectionSec = Math.max(0, endSec - startSec)
  const canConfirm = !busy && total > 0 && selectionSec >= min

  return (
    <div
      data-audio-trim-panel
      role="group"
      aria-label={t('title')}
      style={{ width: NODE_V4_AUDIO_TRIM.panelWidth }}
      className={cn(
        'nodrag nopan flex flex-col gap-2.5 rounded-node corner-squircle px-4 pt-3.5 pb-3',
        'surface-glass shadow-node-chrome',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
          return
        }
        // ⌘Z / Ctrl+Z = 撤上一步手柄（画板：面板内的撤销只管这一格，⛔ 不进
        // 画布的撤销栈 —— 这一段还没落成版本）。
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'z'
        ) {
          event.preventDefault()
          event.stopPropagation()
          undoHandles()
          return
        }
        // `I` / `O` = 把播放头设成入 / 出点（画板底部那两颗键帽）。
        const key = event.key.toLowerCase()
        if (key === 'i') {
          pushHistory()
          moveHandle(TRIM_HANDLE.start, playhead)
        } else if (key === 'o') {
          pushHistory()
          moveHandle(TRIM_HANDLE.end, playhead)
        }
      }}
      tabIndex={-1}
    >
      <div className="flex items-center justify-between">
        <span className="text-2sm font-semibold text-foreground">
          {t('title')}
        </span>
        <span className="text-2xs text-muted-foreground">{t('hint')}</span>
      </div>

      <div
        ref={trackRef}
        data-audio-trim-track
        style={{ height: NODE_V4_AUDIO_TRIM.waveformHeight }}
        className="relative px-1.5"
        onPointerDown={(event) => {
          // 波形上按下：挪过阈值就是**拖出一段选区**（画板那句「或在波形上拖出
          // 选区」），没挪就只是把播放头放过去 —— ⛔ 一次误点不该抹掉入出点。
          pushHistory()
          marqueeRef.current = {
            clientX: event.clientX,
            seconds: secondsAtClientX(event.clientX),
            moved: false,
          }
        }}
      >
        <div className="flex h-full items-center">
          <AudioWaveform
            seed={seed}
            barCount={NODE_V4_AUDIO_TRIM.barCount}
            height={NODE_V4_AUDIO_TRIM.waveformHeight}
            className="w-full"
          />
        </div>
        {/* 选区外压暗（画板：两侧盖一层画布底色）。 */}
        <div
          aria-hidden
          data-audio-trim-dim="start"
          style={{ width: percent(startSec) }}
          className="absolute inset-y-0 left-0 rounded-l-lg bg-background/80"
        />
        <div
          aria-hidden
          data-audio-trim-dim="end"
          style={{ width: percent(Math.max(0, total - endSec)) }}
          className="absolute inset-y-0 right-0 rounded-r-lg bg-background/80"
        />
        {[TRIM_HANDLE.start, TRIM_HANDLE.end].map((handle) => {
          const seconds = handle === TRIM_HANDLE.start ? startSec : endSec
          return (
            <button
              key={handle}
              type="button"
              data-audio-trim-handle={handle}
              aria-label={t(
                handle === TRIM_HANDLE.start ? 'inPoint' : 'outPoint',
              )}
              aria-valuenow={Math.round(seconds * 10) / 10}
              aria-valuemin={0}
              aria-valuemax={Math.round(total * 10) / 10}
              role="slider"
              style={{
                left: percent(seconds),
                width: NODE_V4_AUDIO_TRIM.handleWidth,
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
                pushHistory()
                draggingRef.current = handle
              }}
              onKeyDown={(event) => {
                // 键盘也要拖得动（AA）：一格 0.1s，Shift 一格 1s。
                const step = event.shiftKey ? 1 : min
                if (event.key === 'ArrowLeft') {
                  pushHistory()
                  moveHandle(handle, seconds - step)
                } else if (event.key === 'ArrowRight') {
                  pushHistory()
                  moveHandle(handle, seconds + step)
                } else return
                event.preventDefault()
                event.stopPropagation()
              }}
              className={cn(
                '-mt-1 -mb-1 absolute top-0 bottom-0 -translate-x-1/2 rounded-full bg-foreground',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              )}
            />
          )
        })}
        <span
          aria-hidden
          data-audio-trim-playhead
          style={{ left: percent(playhead) }}
          className="-mt-1.5 -mb-1.5 absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-foreground/50"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          data-audio-trim-preview
          data-playing={playing ? 'true' : 'false'}
          aria-label={t(playing ? 'pausePreview' : 'preview')}
          disabled={total <= 0}
          onClick={togglePreview}
          className={cn(
            'flex size-7.5 shrink-0 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground transition-opacity duration-fast hover:opacity-90',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {playing ? (
            <Pause aria-hidden className="size-3.5" />
          ) : (
            <Play aria-hidden className="size-3.5" />
          )}
        </button>
        <span
          data-audio-trim-readout="in"
          className="text-2xs tabular-nums text-muted-foreground"
        >
          {t('inPoint')}{' '}
          <b className="font-medium text-foreground">
            {formatAudioClock(startSec)}
          </b>
        </span>
        <span
          data-audio-trim-readout="out"
          className="text-2xs tabular-nums text-muted-foreground"
        >
          {t('outPoint')}{' '}
          <b className="font-medium text-foreground">
            {formatAudioClock(endSec)}
          </b>
        </span>
        <span
          data-audio-trim-readout="selection"
          className="text-2xs tabular-nums text-muted-foreground"
        >
          {t('selection', {
            selection: formatAudioSeconds(selectionSec),
            total: formatAudioSeconds(total),
          })}
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5">
          {(['keyIn', 'keyOut', 'keyEsc'] as const).map((key) => (
            <kbd
              key={key}
              className="rounded-sm border border-border px-1.5 py-px text-3xs font-normal text-muted-foreground"
            >
              {t(key)}
            </kbd>
          ))}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-muted-foreground">{t('nondestructive')}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            data-audio-trim-cancel
            onClick={onCancel}
            className="flex h-8 items-center rounded-lg bg-surface-fill px-3 text-2sm text-foreground transition-colors duration-fast hover:bg-surface-fill-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            data-audio-trim-confirm
            disabled={!canConfirm}
            onClick={() => onConfirm({ startSec, endSec })}
            className="flex h-8 items-center rounded-lg bg-primary px-3 text-2sm font-medium text-primary-foreground transition-opacity duration-fast hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? t('confirming') : t('confirm')}
          </button>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        hidden
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => {
          const el = event.currentTarget
          // 只播选区：越过出点就绕回入点（⛔ 不 pause —— 画板要的是能反复听那一段）。
          if (el.currentTime >= endSec || el.currentTime < startSec) {
            el.currentTime = startSec
          }
          setPlayhead(el.currentTime)
        }}
      />
    </div>
  )
}
