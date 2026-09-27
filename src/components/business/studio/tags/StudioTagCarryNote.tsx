'use client'

import { useTranslations } from 'next-intl'

import type { TagCarryStatus } from '@/hooks/use-tag-carry-translation'
import { Spinner } from '@/components/ui/spinner'

/**
 * 正向栏底下那行小字：带过来的那一句**正在翻成标签** / **没翻成**（owner 2026-09-27）。
 * 与官方补全那行同一个位置、同一种字号 —— ⛔ 不弹提示、不遮输入框。
 */
export function StudioTagCarryNote({
  status,
  onRetry,
}: {
  status: TagCarryStatus
  onRetry: () => void
}) {
  const t = useTranslations('StudioTags.carry')
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
          {t('failed')}
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
