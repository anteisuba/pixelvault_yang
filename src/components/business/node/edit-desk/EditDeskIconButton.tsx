'use client'

/**
 * 剪辑台里的图标键（顶栏撤销 · 走带行声音 / 缩放）。
 *
 * ⚠ 不借画布外壳那颗 `ShellIconButton`：它的悬停 / 按下态用的是画布域专用色
 * （`--node-foreground`），剪辑台不在画布域里。这一颗只用脊柱令牌。
 */

import type { ComponentType } from 'react'

import { cn } from '@/lib/utils'

export function EditDeskIconButton({
  icon: Icon,
  label,
  testId,
  active = false,
  disabled = false,
  onClick,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly testId?: string
  /** 开着的开关（声音关了）：底色抬一层。 */
  readonly active?: boolean
  readonly disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-fast ease-standard hover:bg-muted hover:text-foreground active:scale-96 disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100',
        active && 'bg-muted text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}
