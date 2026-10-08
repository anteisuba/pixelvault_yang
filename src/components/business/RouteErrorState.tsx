'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { AlertTriangle, Home, RotateCcw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { useErrorRecoveryReveal } from '@/hooks/use-error-recovery-reveal'

interface RouteErrorStateProps {
  error: Error & { digest?: string }
  /** Next 16 error.js 的 `retry`：重新取数并重画这一段。 */
  retry: () => void
  /** 第二颗键回哪儿（首页 / 画廊 / 工作台）。 */
  fallbackHref: string
}

/**
 * 路由段出错（`error.tsx`）的唯一长相（owner 2026-10-08「提示与弹窗」第 3 题 B）：
 * 与空态同一个模板 —— 虚线框 · 40px 白图标格 · 衬线标题 · 一句话 · 黑丸。
 * ⛔ 整块不变红，只在图标角放一颗红点。
 *
 * 「重试」：键里转圈（字不变、宽度不跳），重试成功出错块被换下，内容由糊变清地
 * 回来（`useErrorRecoveryReveal`）；又失败了，转圈停下。
 */
export function RouteErrorState({
  error,
  retry,
  fallbackHref,
}: RouteErrorStateProps) {
  const t = useTranslations('ErrorBoundary')
  const { ref, markRetrying, clearRetrying } =
    useErrorRecoveryReveal<HTMLDivElement>()
  const [retrying, setRetrying] = useState(false)
  // 换了一个错误 = 这次重试没救回来：转圈停下（「存上一次的值」写法）。
  const [seenError, setSeenError] = useState(error)
  if (seenError !== error) {
    setSeenError(error)
    setRetrying(false)
  }

  useEffect(() => {
    Sentry.captureException(error)
    clearRetrying()
  }, [error, clearRetrying])

  return (
    <div
      ref={ref}
      className="flex flex-1 items-center justify-center px-4 py-16 lg:px-6"
    >
      <EmptyState
        tone="error"
        className="w-full max-w-lg"
        icon={<AlertTriangle />}
        title={t('title')}
        description={t('description')}
        action={
          <Button
            className="rounded-full"
            aria-busy={retrying || undefined}
            onClick={() => {
              // ⛔ 不 disabled：键变灰读成「不能点」，这里只是正在做。
              if (retrying) return
              setRetrying(true)
              markRetrying()
              retry()
            }}
          >
            {retrying ? (
              <Spinner size="md" />
            ) : (
              <RotateCcw className="size-4" aria-hidden />
            )}
            {t('retry')}
          </Button>
        }
        secondaryAction={
          <Button asChild variant="ghost" className="rounded-full">
            <a href={fallbackHref}>
              <Home className="size-4" aria-hidden />
              {t('home')}
            </a>
          </Button>
        }
      />
    </div>
  )
}
