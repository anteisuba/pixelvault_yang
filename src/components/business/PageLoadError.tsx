'use client'

import { useTranslations } from 'next-intl'

import { AlertCircle, RotateCcw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { useErrorRecoveryReveal } from '@/hooks/use-error-recovery-reveal'

/**
 * 整页加载失败（owner 2026-10-08 加载中 · 失败）—— 画廊与素材库共用，与空态同一个模板：
 * 虚线框 · 40px 白图标格（角上一颗红点，⛔ 整块变红）· 衬线标题 · 一句话 · 黑丸「重试」。
 * 重试时键里转圈、字换成「重试中」；救回来的内容由糊变清（`useErrorRecoveryReveal`）。
 */
export function PageLoadError({
  title,
  description,
  onRetry,
  retrying = false,
  className,
}: {
  /** 出了什么错（已经说成人话的那一句）。 */
  title: string
  description?: string
  onRetry: () => void
  retrying?: boolean
  className?: string
}) {
  const t = useTranslations('Feedback')
  const { ref, markRetrying } = useErrorRecoveryReveal<HTMLDivElement>()
  return (
    <div ref={ref} role="alert" className={className}>
      <EmptyState
        tone="error"
        icon={<AlertCircle />}
        title={title}
        description={description ?? t('pageLoadFailedHint')}
        action={
          <Button
            type="button"
            className="rounded-full"
            aria-busy={retrying || undefined}
            onClick={() => {
              // ⛔ 不 disabled：键变灰读成「不能点」，这里只是正在做。
              if (retrying) return
              markRetrying()
              onRetry()
            }}
          >
            {retrying ? (
              <Spinner size="md" />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )}
            {retrying ? t('retrying') : t('retry')}
          </Button>
        }
      />
    </div>
  )
}
