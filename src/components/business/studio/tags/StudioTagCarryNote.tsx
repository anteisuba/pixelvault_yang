'use client'

import { useTranslations } from 'next-intl'

import { getApiErrorMessage } from '@/lib/api-error-message'
import type {
  TagCarryFailureReason,
  TagCarryStatus,
} from '@/hooks/use-tag-carry-translation'
import { Spinner } from '@/components/ui/spinner'

/**
 * 正向栏底下那行小字：带过来的那一句**正在翻成标签** / **没翻成**（owner 2026-09-27）。
 * 与官方补全那行同一个位置、同一种字号 —— ⛔ 不弹提示、不遮输入框。
 *
 * ⚠ 没翻成是因为**助手那一家**跑不了（选的模型缺 key / 一家都没配）时，把那句原因照实
 * 写出来（「没有改用别家的 Key」）—— owner 2026-10-15「全跟助手」。
 */
export function StudioTagCarryNote({
  status,
  reason = null,
  onRetry,
}: {
  status: TagCarryStatus
  reason?: TagCarryFailureReason | null
  onRetry: () => void
}) {
  const t = useTranslations('StudioTags.carry')
  const tErrors = useTranslations('Errors')
  if (status === 'idle') return null
  return (
    <p
      role="status"
      className="flex items-center gap-1.5 text-3xs text-muted-foreground"
    >
      {status === 'translating' ? (
        <>
          <Spinner aria-hidden="true" size="sm" className="shrink-0" />
          {t('translating')}
        </>
      ) : (
        <>
          {reason
            ? t('failedBecause', {
                reason: getApiErrorMessage(tErrors, reason, reason.error),
              })
            : t('failed')}
          <button
            type="button"
            onClick={onRetry}
            className="rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('retry')}
          </button>
        </>
      )}
    </p>
  )
}
