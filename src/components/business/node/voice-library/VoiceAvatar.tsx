'use client'

/**
 * 一副嗓子 / 一段声音的**头像**（声音库方向 A，owner 2026-09-29，设计画布「画布 ·
 * 声音库与音色弹层」）：有封面放封面，克隆的写首字，录音（历史 / 配音间 / 素材库）
 * 是波形小标。
 *
 * ⭐ **头像就是试听键**（`VoiceAvatarButton`）：悬停出 ▶，响着的那一个外圈一道黑环
 * 按播放进度走一圈；⛔ 旁边再摆一颗播放键。声音库的行、音色弹层的行、音频卡上那颗
 * 播放钮都是这一个组件。
 */

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useReducedMotion } from 'motion/react'
import { AudioLines, Pause, Play } from '@/components/icons'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** 头像三档：弹层 chip 16 · 弹层行 28 · 卡上播放钮 30 · 声音库行 40。 */
const SIZE_CLASS = {
  chip: 'size-4',
  row: 'size-7',
  card: 'size-7.5',
  library: 'size-10',
} as const

const SIZE_PX = { chip: 16, row: 28, card: 30, library: 40 } as const

export type VoiceAvatarSize = keyof typeof SIZE_CLASS

export interface VoiceAvatarProps {
  readonly cover: string | null | undefined
  /** 没有封面时：`letter` 写名字首字（克隆的），`wave` 画波形（录音）。 */
  readonly fallback: 'letter' | 'wave'
  readonly name: string
  readonly size: VoiceAvatarSize
  readonly className?: string
}

export function VoiceAvatar({
  cover,
  fallback,
  name,
  size,
  className,
}: VoiceAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const showCover = Boolean(cover) && failed !== cover
  return (
    <span
      aria-hidden
      data-voice-avatar={showCover ? 'cover' : fallback}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-fill text-muted-foreground',
        SIZE_CLASS[size],
        className,
      )}
    >
      {showCover && cover ? (
        <Image
          src={cover}
          alt=""
          width={SIZE_PX[size]}
          height={SIZE_PX[size]}
          unoptimized
          onError={() => setFailed(cover)}
          className="size-full object-cover"
        />
      ) : fallback === 'letter' ? (
        <span
          className={cn(
            'font-medium text-foreground',
            size === 'library' ? 'text-sm' : 'text-3xs',
          )}
        >
          {Array.from(name.trim())[0] ?? ''}
        </span>
      ) : (
        <AudioLines className="size-1/2" />
      )}
    </span>
  )
}

/** 进度环：外圈一道黑线按播放进度走一圈（减少动态效果时是整圈静态描边）。 */
function ProgressRing({ progress }: { readonly progress: number }) {
  const reduce = useReducedMotion()
  const circumference = 2 * Math.PI * 48
  const shown = reduce ? 1 : Math.min(Math.max(progress, 0), 1)
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className="pointer-events-none absolute -inset-0.5 -rotate-90 text-foreground"
    >
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - shown)}
      />
    </svg>
  )
}

export interface VoiceAvatarButtonProps extends VoiceAvatarProps {
  readonly playing: boolean
  readonly loading?: boolean
  /** 正在响时的进度（0–1）；不给 = 响着时整圈描边。 */
  readonly progress?: number
  /**
   * ▶ 什么时候露出来：`hover` = 悬停才出（行里，平时看得见头像）；`always` = 一直在
   * （卡上那颗 —— 「点哪儿能听」必须一眼看得见）。
   */
  readonly glyph?: 'hover' | 'always'
  readonly disabled?: boolean
  readonly ariaLabel: string
  onToggle(): void
  /** `data-*` 之类测试 / 定位钩子。 */
  readonly buttonProps?: Record<`data-${string}`, string>
  readonly children?: ReactNode
}

export function VoiceAvatarButton({
  playing,
  loading = false,
  progress,
  glyph = 'hover',
  disabled = false,
  ariaLabel,
  onToggle,
  buttonProps,
  ...avatar
}: VoiceAvatarButtonProps) {
  const active = playing || loading
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={playing}
      disabled={disabled}
      data-playing={playing ? 'true' : 'false'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={cn(
        'group/avatar nodrag nopan relative shrink-0 rounded-full transition-transform duration-fast ease-standard active:scale-96',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
      )}
      {...buttonProps}
    >
      <VoiceAvatar {...avatar} />
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center justify-center rounded-full bg-foreground/40 text-background transition-opacity duration-fast ease-standard',
          active || glyph === 'always'
            ? 'opacity-100'
            : 'opacity-0 group-hover/avatar:opacity-100 group-focus-visible/avatar:opacity-100',
        )}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : playing ? (
          <Pause className="size-3" />
        ) : (
          <Play className="size-3" />
        )}
      </span>
      {playing ? <ProgressRing progress={progress ?? 1} /> : null}
    </button>
  )
}
