'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

/**
 * 无限滚动的尾巴（owner 2026-10-08 加载中 · 第 2 题 A）—— 画廊与素材库同一份：
 *
 * · 在拿下一批：接一排灰块（`placeholder`，形状 = 真格子），⛔ 底部转圈。离底部还有一屏就
 *   开始拿（`INFINITE_SCROLL_PREFETCH_MARGIN`），所以多数时候看不见它。
 * · 这一批没拿到：灰块留着，底下只写一句「这批没拿到 · 重试」。⛔ 红框、⛔ 自动重试
 *   （哨兵还在视口里，自动重试会打死接口）。已加载的内容一个都不动。
 * · 拿完了：最底写「没有更多了」。
 */
export function FeedTail({
  loading,
  error,
  ended,
  onRetry,
  placeholder,
  className,
}: {
  /** 正在拿下一批（首屏之外）。 */
  loading: boolean
  /** 这一批没拿到（原话只给读屏，屏上只写一句）。 */
  error: string | null
  /** 全部拿完了。 */
  ended: boolean
  onRetry: () => void
  /** 那一排灰块。 */
  placeholder: ReactNode
  className?: string
}) {
  const t = useTranslations('Feedback')

  if (error) {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {placeholder}
        <p
          role="alert"
          data-testid="feed-tail-error"
          className="py-2 text-center text-xs text-muted-foreground"
        >
          <span className="sr-only">{error}</span>
          {t('batchFailed')}
          <span aria-hidden> · </span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-sm text-foreground underline-offset-4 transition-colors duration-fast hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t('retry')}
          </button>
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div role="status" data-testid="feed-tail-loading" className={className}>
        <span className="sr-only">{t('loadingMore')}</span>
        {placeholder}
      </div>
    )
  }

  if (ended) {
    return (
      <p
        data-testid="feed-tail-end"
        className={cn(
          'py-6 text-center text-xs text-muted-foreground',
          className,
        )}
      >
        {t('endOfList')}
      </p>
    )
  }

  return null
}
