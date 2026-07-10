'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { STATUS_COLORS } from '@/constants/node-tokens'
import {
  NODE_STATUS_IDS,
  type NodeWorkflowStatus,
} from '@/constants/node-types'
import { cn } from '@/lib/utils'

interface NodeStatusBadgeProps {
  status: NodeWorkflowStatus
}

export function NodeStatusBadge({ status }: NodeStatusBadgeProps) {
  const t = useTranslations('StudioNode.statuses')
  const isQueued = status === NODE_STATUS_IDS.queued
  const isRunning = status === NODE_STATUS_IDS.running

  // §4 盖章状态系统：idle = 素卡，不盖章。
  if (status === NODE_STATUS_IDS.idle) {
    return null
  }

  return (
    <span
      className={cn(
        'inline-flex h-7 -rotate-2 items-center gap-1.5 rounded-none border px-2.5 text-xs font-semibold uppercase tracking-nav-dense',
        STATUS_COLORS[status],
      )}
    >
      {isQueued ? <Loader2 className="size-3 animate-spin" /> : null}
      {isRunning ? (
        <span className="size-1.5 rounded-full bg-current animate-pulse" />
      ) : null}
      {t(status)}
    </span>
  )
}
