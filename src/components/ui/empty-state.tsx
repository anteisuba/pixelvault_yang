import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** 40px 图标位里的图形。传 lucide 图标即可，尺寸由外层的 `size-5` 控制。 */
  icon?: ReactNode
  /** 空态大标题。展示槽（`font-display`）在全站只有三处落点，这是其中之一。 */
  title: string
  /** 一句话说明「为什么是空的 / 接下来做什么」。 */
  description?: string
  /** 起手势。传 `<Button className="rounded-full">` —— 黑丸是空态主动作的定形。 */
  action?: ReactNode
  /** 次动作。传 `<Button variant="ghost" className="rounded-full">`。 */
  secondaryAction?: ReactNode
  className?: string
}

/**
 * 空态模板（视觉语言总板 D1 ④，owner 2026-09-17）。
 *
 * 全站空态只有这一种长相：**灰底虚线框 → 40px 图标位 → 展示槽标题 →
 * 一句话 → 黑丸主动作**。⛔ 不画插画 —— 插画是每个空态各自长出来的第二套
 * 视觉语言，越画越不像同一个产品，而且它占掉的纵向正是「下一步做什么」
 * 应该待的地方。图标位是一个中性的 40px 白格，不是插画的缩小版。
 *
 * 无状态原语：不读 i18n、不碰 hook。文案与动作由调用方按自己域的 message
 * key 传进来（`ui-defaults.md` §7「空态 = 一句说明 + 一个可点动作」）。
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-empty-state border border-dashed border-border bg-surface-workbench px-6 py-9 text-center',
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-empty-icon border border-border bg-background text-muted-foreground [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="font-display text-empty-title leading-tight font-medium text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-2sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
