'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface StudioOperatorToolGroupProps {
  total: number
  failed: number
  skipped?: number
  running: boolean
  runningTitle?: string
  failure?: ReactNode
  children: ReactNode
}

export function StudioOperatorToolGroup({
  total,
  failed,
  skipped = 0,
  running,
  runningTitle,
  failure,
  children,
}: StudioOperatorToolGroupProps) {
  const t = useTranslations('StudioOperator')
  const [open, setOpen] = useState(false)
  const detailsId = useId()

  return (
    <div
      data-testid="operator-tool-group"
      data-open={String(open)}
      className="min-w-0"
    >
      {running ? (
        <div role="status" className="flex items-center gap-2 py-2 text-2sm">
          <Spinner
            size="sm"
            role="presentation"
            aria-hidden
            data-testid="operator-tool-group-spinner"
            className="shrink-0"
          />
          <span data-testid="operator-tool-group-running">
            {runningTitle ?? t('toolGroup.running')}
          </span>
        </div>
      ) : failure ? (
        <div
          data-testid="operator-tool-group-blocker"
          className="my-2 border-l-2 border-status-risk pl-3 text-2sm"
        >
          {failure}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="operator-tool-group-toggle"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen(!open)}
        className="flex min-h-9 w-full items-center gap-2 rounded-md py-1 text-left text-2sm text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span data-testid="operator-tool-group-title">
          {t('toolGroup.details', { count: total })}
        </span>
        {failed > 0 ? (
          <span data-testid="operator-tool-group-failed">
            {t('toolGroup.failed', { count: failed })}
          </span>
        ) : null}
        {skipped > 0 ? (
          <span data-testid="operator-tool-group-skipped">
            {t('toolGroup.skipped', { count: skipped })}
          </span>
        ) : null}
        <ChevronDown
          className={cn('ml-auto size-3 shrink-0', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <div id={detailsId} hidden={!open}>
        <div className="mt-1 flex min-w-0 flex-col gap-2 border-l border-border pl-3">
          {children}
        </div>
      </div>
    </div>
  )
}
