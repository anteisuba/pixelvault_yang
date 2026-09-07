'use client'

/**
 * 媒体面 = **沉底的井**（HIG 定稿 2026-09-08 §②）。
 *
 * 媒体永远坐在一口井里：`surface-sunken` 底 + 一圈内描边 + 圆角。井负责说
 * 「这块是产物、不是 UI」，所以 transport / 角标一律浮在井**里面**，
 * ⛔ 不放到卡的白面上；抓帧 / 下载这类次级动作一律在井**外面**。
 */

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function NodeV4MediaWell({
  children,
  className,
  testId,
}: {
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      data-media-well={testId ?? ''}
      className={cn(
        'relative overflow-hidden rounded-xl bg-surface-sunken inset-ring inset-ring-border/60 corner-squircle',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * 井底那条**玻璃胶囊** transport（36px 高）。
 * ⛔ 不用原生 `<video controls>`：画布在 CSS transform 里，原生控件条的热区在
 * 缩放下会漂，它自带的全屏 / 画中画在节点卡里只是误触源。
 */
export function NodeV4Transport({ children }: { children: ReactNode }) {
  return (
    <div
      data-media-transport
      className="absolute inset-x-2.5 bottom-2.5 flex h-9 items-center gap-2.5 rounded-full border px-3 surface-glass shadow-node-chrome"
    >
      {children}
    </div>
  )
}

/** 井右上角的 vibrancy 药丸角标（「生成产物」一类）。 */
export function NodeV4MediaBadge({ children }: { children: ReactNode }) {
  return (
    <span
      data-media-badge
      className="absolute top-2 right-2 rounded-full border px-2 py-0.5 text-3xs text-muted-foreground surface-glass"
    >
      {children}
    </span>
  )
}

/** transport 里的一颗 24px 圆钮。 */
export function NodeV4TransportButton({
  label,
  pressed,
  onClick,
  testId,
  children,
}: {
  label: string
  pressed?: boolean
  onClick(): void
  testId: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      {...{ [`data-${testId}`]: '' }}
      className="nodrag flex size-6 shrink-0 items-center justify-center rounded-full text-2xs transition-colors duration-(--duration-fast) ease-standard hover:bg-surface-fill-hover"
    >
      {children}
    </button>
  )
}
