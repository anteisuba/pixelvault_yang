'use client'

import { useTranslations } from 'next-intl'

import type { ApiKeyHealthStatus } from '@/types'
import { cn } from '@/lib/utils'

const HEALTH_COLORS: Record<ApiKeyHealthStatus, string> = {
  available: 'bg-emerald-500',
  no_key: 'bg-amber-500',
  failed: 'bg-red-500',
  unknown: 'bg-muted-foreground/40',
}

export function ApiKeyHealthDot({
  status,
}: {
  status: ApiKeyHealthStatus | undefined
}) {
  const t = useTranslations('StudioApiKeys')

  if (!status) return null

  const label = t(`health.${status === 'no_key' ? 'noKey' : status}`)

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={label}
    >
      <span
        className={cn('size-2 shrink-0 rounded-full', HEALTH_COLORS[status])}
      />
      {label}
    </span>
  )
}
