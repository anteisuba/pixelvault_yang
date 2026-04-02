'use client'

import { memo, useCallback, useState } from 'react'
import { ImageIcon, Film, KeyRound, Gift } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { ProjectSelector } from '@/components/business/ProjectSelector'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { StudioQuickRouteSelector } from './StudioQuickRouteSelector'

export const StudioTopBar = memo(function StudioTopBar() {
  const { state, dispatch } = useStudioForm()
  const { projects } = useStudioData()
  const tStudio = useTranslations('StudioPage')
  const tV3 = useTranslations('StudioV3')
  const tApiKeys = useTranslations('StudioApiKeys')
  const { summary } = useUsageSummary()
  const { keys } = useApiKeysContext()
  const [sheetOpen, setSheetOpen] = useState(false)

  const activeRouteCount = keys.filter((key) => key.isActive).length
  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  const handleRename = useCallback(
    async (id: string, name: string) => projects.update(id, { name }),
    [projects],
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Project selector */}
      <div className="min-w-48">
        <ProjectSelector
          projects={projects.projects}
          activeProjectId={projects.activeProjectId}
          isLoading={projects.isLoading}
          onSelect={projects.setActiveProjectId}
          onCreate={projects.create}
          onRename={handleRename}
          onDelete={projects.remove}
        />
      </div>

      {/* Image / Video toggle */}
      <div
        role="tablist"
        aria-label={tStudio('modeLabel')}
        className="flex gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={state.outputType === 'image'}
          onClick={() =>
            dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'image' })
          }
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            state.outputType === 'image'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <ImageIcon className="size-3.5" />
          {tStudio('modeImage')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.outputType === 'video'}
          onClick={() =>
            dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
          }
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            state.outputType === 'video'
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
              : 'border border-border/60 bg-background/50 text-foreground hover:bg-primary/5 hover:border-primary/20',
          )}
        >
          <Film className="size-3.5" />
          {tStudio('modeVideo')}
        </button>
      </div>

      {/* Quick / Card workflow toggle */}
      <div
        role="tablist"
        aria-label={tV3('workflowModeLabel')}
        className="flex rounded-lg border border-border/60 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={state.workflowMode === 'quick'}
          onClick={() =>
            dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
          }
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            state.workflowMode === 'quick'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {tV3('quickMode')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={state.workflowMode === 'card'}
          onClick={() =>
            dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'card' })
          }
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            state.workflowMode === 'card'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          {tV3('cardMode')}
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* API management button → opens Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              activeRouteCount > 0
                ? 'border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/20'
                : 'border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10',
            )}
          >
            <KeyRound className="size-3" />
            {activeRouteCount > 0
              ? tApiKeys('triggerCount', { count: activeRouteCount })
              : tApiKeys('triggerLabel')}
          </button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{tApiKeys('sheetTitle')}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <StudioQuickRouteSelector managementMode="inline" />
          </div>
        </SheetContent>
      </Sheet>

      {/* Free credits badge */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Gift className="size-3.5 text-chart-3" />
        <span className="font-serif">
          {tStudio('freeQuota', {
            remaining: Math.max(0, freeRemaining),
            limit: summary.freeGenerationLimit,
          })}
        </span>
      </div>
    </div>
  )
})
