'use client'

import type { MouseEvent } from 'react'
import { Archive, LayoutTemplate, Plus, Save, Workflow } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_STUDIO_PLACEHOLDER_TOAST } from '@/constants/node-studio'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  CanvasPlannerRouteSelector,
  type NodePlannerRouteSelection,
} from './CanvasPlannerRouteSelector'

interface CanvasTopBarProps {
  nodeCount: number
  plannerRoute: NodePlannerRouteSelection | null
  onPlannerRouteChange: (value: NodePlannerRouteSelection) => void
  onAddClick?: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string
}

export function CanvasTopBar({
  nodeCount,
  plannerRoute,
  onPlannerRouteChange,
  onAddClick,
  className,
}: CanvasTopBarProps) {
  const t = useTranslations('StudioNode')

  const showPlaceholderToast = () => {
    toast.info(t('toasts.notImplemented'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }

  return (
    <header
      className={cn(
        'pointer-events-auto absolute left-4 right-4 top-4 flex min-h-14 items-center justify-between gap-3 rounded-3xl border border-node-panel-inner/70 bg-node-panel/95 px-3 py-2 shadow-node-panel backdrop-blur-xl md:left-6 md:right-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-node-panel-inner text-node-amber">
          <Workflow className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('eyebrow')}
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-display text-sm font-semibold text-node-foreground">
              {t('projectUntitled')}
            </p>
            <span className="hidden items-center gap-1 rounded-lg border border-node-panel-inner bg-node-panel-soft px-2 py-1 text-2xs font-medium text-node-muted sm:inline-flex">
              <Archive className="size-3" />
              {t('nodeCount', { count: nodeCount })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <CanvasPlannerRouteSelector
          value={plannerRoute}
          onChange={onPlannerRouteChange}
        />
        <Button
          type="button"
          size="sm"
          onClick={onAddClick ?? showPlaceholderToast}
          className="h-9 rounded-2xl bg-node-foreground px-3 text-node-canvas hover:bg-node-foreground/90"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">{t('topbar.addNode')}</span>
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('topbar.arrange')}
          onClick={showPlaceholderToast}
          className="rounded-2xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
        >
          <LayoutTemplate className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('topbar.save')}
          onClick={showPlaceholderToast}
          className="rounded-2xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
        >
          <Save className="size-4" />
        </Button>
      </div>
    </header>
  )
}
