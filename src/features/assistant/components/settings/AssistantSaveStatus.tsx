'use client'

import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check } from '@/components/icons'

import { DURATION } from '@/constants/motion'
import type { AssistantPersonaSaveStatus } from '@/hooks/use-assistant-persona'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

/**
 * 右上角那一小行字（助手设置 B：改了就存，没有「保存」键）。
 *
 * 动效表：300ms 内存好就不出「保存中」（淡入晚 300ms 起步）；「已保存」200ms 淡入、
 * 停 1.5s、200ms 淡出；失败变红 +「重试」，一直在，直到重试成功。
 * ⛔ 不用 toast、不抖、不在每个控件旁各放一个。
 */
export function AssistantSaveStatus({
  status,
  onRetry,
  className,
}: {
  status: AssistantPersonaSaveStatus
  onRetry(): void
  className?: string
}) {
  const t = useTranslations('AssistantSettings')
  const reducedMotion = useReducedMotion()

  return (
    <span
      role="status"
      data-testid="assistant-save-status"
      data-status={status}
      className={cn(
        'inline-flex min-h-5 items-center text-2sm whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {status === 'idle' ? null : (
          <motion.span
            key={status}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: {
                duration: reducedMotion ? 0 : DURATION.base,
                delay: status === 'saving' && !reducedMotion ? 0.3 : 0,
              },
            }}
            exit={{
              opacity: 0,
              transition: { duration: reducedMotion ? 0 : DURATION.base },
            }}
            className={cn(
              'inline-flex items-center gap-1.5',
              status === 'failed' && 'text-status-risk',
            )}
          >
            {status === 'saving' ? (
              <>
                <Spinner size="sm" />
                {t('status.saving')}
              </>
            ) : status === 'saved' ? (
              <>
                <Check className="size-3.5" aria-hidden />
                {t('status.saved')}
              </>
            ) : (
              <>
                {t('status.failed')}
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-sm font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:min-h-11"
                >
                  {t('status.retry')}
                </button>
              </>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
