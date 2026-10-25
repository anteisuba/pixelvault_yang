import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** 40px 图标格里的图形，尺寸由外层的 `size-5` 控制。 */
  icon?: ReactNode
  /** 标题（15 加粗）。⛔ 页面名当标题。 */
  title: string
  /** 一句话说明「为什么是空的 / 接下来做什么」。 */
  description?: string
  /** 真能把空填上的那个：黑色主钮 `<Button>`。 */
  action?: ReactNode
  /** 最多再跟一个白药丸 `<Button variant="secondary">`。 */
  secondaryAction?: ReactNode
  /**
   * `error` = 出错 / 加载失败（owner 2026-10-08「提示与弹窗」第 3 题 B：出错与 404 也用
   * 这一个模板）。⛔ 整块不变红 —— 只在图标格右上角放一颗红点；出了什么错由标题说。
   */
  tone?: 'empty' | 'error'
  className?: string
}

/**
 * 空状态（ui-spec.md §9「空状态」⑱）：空、出错、没加载出来只有一个长相 —— 和助手卡
 * 同一张**柔影白卡**（`card` 底 + `card` 影，圆角 20）：图标格（40，`fill` 底）在左，
 * 标题（15 加粗）+ 一句话左对齐，下面黑色主钮，最多再跟一个白药丸。
 * ⛔ 示例按钮、⛔ 插画、⛔ 整块变红、⛔ 虚线框 + 衬线标题。
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
  tone = 'empty',
  className,
}: EmptyStateProps) {
  return (
    <div
      data-tone={tone}
      className={cn(
        'mx-auto flex w-full max-w-90 items-start gap-3.5 rounded-20 bg-card p-5 text-left shadow-card',
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className="relative grid size-10 shrink-0 place-items-center rounded-12 bg-muted text-muted-foreground [&_svg]:size-5"
        >
          {icon}
          {tone === 'error' ? (
            <span
              data-testid="empty-state-error-dot"
              className="absolute -top-0.75 -right-0.75 size-2 rounded-full bg-destructive ring-2 ring-card"
            />
          ) : null}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="text-md leading-snug font-semibold text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-2sm leading-normal text-muted-foreground">
            {description}
          </p>
        ) : null}
        {action || secondaryAction ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </div>
  )
}
