'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { Pause, Play } from '@/components/icons'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

import { formatVideoClock } from './video-node-model'

/** 方向键一步 = 一帧（按 30fps 算；片子帧率读不到，这一步只求「够细」）。 */
const FRAME_STEP_SECONDS = 1 / 30

/** `0:02.4` —— 选帧要看到十分之一秒，整秒的 `formatVideoClock` 不够。 */
function formatPickClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  return `${formatVideoClock(safe)}.${Math.floor((safe % 1) * 10)}`
}

export interface VideoFramePickPanelProps {
  readonly durationSec: number
  readonly sec: number
  readonly playing: boolean
  readonly busy: boolean
  readonly onSeek: (sec: number) => void
  readonly onTogglePlay: () => void
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly className?: string
}

/**
 * 抽帧选帧条（owner 2026-10-16「卡上拖选帧」）：点工具条的抽帧 → 卡上画面停住、
 * **提示词栏换成这一条**（与音频卡裁剪同一个做法，⛔ 不另弹一层）→ 拖时间条挑帧 →
 * 确认落成图片卡。卡上画面由调用方按 `sec` 同步，这一条只管控件与快捷键。
 *
 * 快捷键：空格 播放 / 暂停 · ← → 一帧 · Enter 确认 · Esc 取消。
 */
export function VideoFramePickPanel({
  durationSec,
  sec,
  playing,
  busy,
  onSeek,
  onTogglePlay,
  onCancel,
  onConfirm,
  className,
}: VideoFramePickPanelProps) {
  const t = useTranslations('StudioNode.v4')
  const tPick = useTranslations('StudioNode.v4.video.framePick')
  const rootRef = useRef<HTMLDivElement>(null)
  const total = Math.max(0, durationSec)

  // 进来就把焦点给这一条：快捷键要在这里收，⛔ 不挂 window（画布别处也在听键）。
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  const step = (delta: number) =>
    onSeek(Math.min(total, Math.max(0, sec + delta)))

  return (
    <div
      ref={rootRef}
      data-video-frame-pick-panel
      role="group"
      aria-label={tPick('title')}
      tabIndex={-1}
      className={cn(
        'nodrag nopan flex items-center gap-2.5 rounded-node-bar px-3.5 py-2.5 corner-squircle focus-visible:outline-none',
        'surface-glass shadow-node-chrome',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          if (!busy) onConfirm()
        } else if (event.key === ' ') {
          // ⚠ 要 `preventDefault`：焦点在某颗按钮上时空格会被读成「按这颗键」。
          event.preventDefault()
          event.stopPropagation()
          onTogglePlay()
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          event.stopPropagation()
          step(
            event.key === 'ArrowLeft'
              ? -FRAME_STEP_SECONDS
              : FRAME_STEP_SECONDS,
          )
        }
      }}
    >
      <button
        type="button"
        data-video-frame-pick-play
        data-playing={playing ? 'true' : 'false'}
        aria-label={t(playing ? 'player.pause' : 'player.play')}
        disabled={total <= 0 || busy}
        onClick={onTogglePlay}
        className={cn(
          'flex size-7.5 shrink-0 items-center justify-center rounded-full',
          'bg-surface-fill text-foreground transition-colors duration-fast hover:bg-surface-fill-hover',
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
      <Slider
        data-video-frame-pick-scrub
        aria-label={tPick('scrub')}
        min={0}
        max={total > 0 ? total : 1}
        step={0.01}
        value={[Math.min(sec, total)]}
        disabled={total <= 0 || busy}
        stretch={false}
        onValueChange={([value]) => {
          if (value !== undefined) onSeek(value)
        }}
        // 方向键由外层按「一帧」收，⛔ 让滑块自己按 `step` 再挪一遍。
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
          }
        }}
        className="min-w-0 flex-1"
      />
      <span
        data-video-frame-pick-clock
        className="shrink-0 text-xs tabular-nums text-foreground"
      >
        {formatPickClock(sec)}
        <span className="text-muted-foreground">
          {' / '}
          {formatVideoClock(total)}
        </span>
      </span>
      <kbd className="shrink-0 rounded-sm border border-border px-1.5 py-px text-2xs font-normal text-muted-foreground">
        {tPick('keyEsc')}
      </kbd>
      <button
        type="button"
        data-video-frame-pick-confirm
        disabled={busy || total <= 0}
        onClick={onConfirm}
        className="flex h-8 shrink-0 items-center rounded-full bg-primary px-4.5 text-2sm font-medium text-primary-foreground transition-opacity duration-fast hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? tPick('confirming') : tPick('confirm')}
      </button>
    </div>
  )
}
