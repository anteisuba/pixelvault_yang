'use client'

import { memo, useCallback } from 'react'
import { Settings2, ChevronDown, Gift, ImageIcon, Film } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { ModelSelector } from '@/components/business/ModelSelector'
import { ProjectSelector } from '@/components/business/ProjectSelector'
import { AnimatedCollapse } from '@/components/ui/animated-collapse'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

import { StudioCardSection } from './StudioCardSection'
import { StudioQuickRouteSelector } from './StudioQuickRouteSelector'
import { StudioToolbarPanels } from './StudioToolbarPanels'

export const StudioMobileSettings = memo(function StudioMobileSettings() {
  const { state, dispatch } = useStudioForm()
  const { projects } = useStudioData()
  const tStudio = useTranslations('StudioPage')
  const tV3 = useTranslations('StudioV3')
  const { summary } = useUsageSummary()
  const { modelOptions, selectedModel } = useImageModelOptions()
  const freeRemaining =
    summary.freeGenerationLimit - summary.freeGenerationsToday

  const handleRename = useCallback(
    async (id: string, name: string) => projects.update(id, { name }),
    [projects],
  )

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="w-full gap-2">
          <Settings2 className="size-4" />
          {tV3('settings')}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle>{tV3('studioSettings')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          {/* ── Project selector ──────────────────────────────────── */}
          <ProjectSelector
            projects={projects.projects}
            activeProjectId={projects.activeProjectId}
            isLoading={projects.isLoading}
            onSelect={projects.setActiveProjectId}
            onCreate={projects.create}
            onRename={handleRename}
            onDelete={projects.remove}
          />

          {state.workflowMode === 'quick' && (
            <StudioQuickRouteSelector managementMode="inline" />
          )}

          {/* ── Mode tabs (Image / Video) ─────────────────────────── */}
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

          {/* ── Workflow toggle + Model/Card ───────────────────────── */}
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
                'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                state.workflowMode === 'quick'
                  ? 'bg-primary text-white'
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
                'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                state.workflowMode === 'card'
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:bg-muted/30',
              )}
            >
              {tV3('cardMode')}
            </button>
          </div>

          {state.workflowMode === 'quick' && (
            <div className="rounded-xl border border-border/40 overflow-hidden">
              <button
                type="button"
                aria-expanded={state.panels.modelSelector}
                onClick={() =>
                  dispatch({ type: 'TOGGLE_PANEL', payload: 'modelSelector' })
                }
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
              >
                <span className="font-display truncate">
                  {selectedModel ? selectedModel.modelId : tV3('selectModel')}
                </span>
                <ChevronDown
                  className={cn(
                    'size-4 text-muted-foreground transition-transform duration-300 shrink-0 ml-2',
                    state.panels.modelSelector && 'rotate-180',
                  )}
                />
              </button>
              <AnimatedCollapse open={state.panels.modelSelector}>
                <div className="border-t border-border/40 p-3">
                  <ModelSelector
                    value={state.selectedOptionId ?? ''}
                    onChange={(optionId) => {
                      dispatch({ type: 'SET_OPTION_ID', payload: optionId })
                      dispatch({
                        type: 'CLOSE_PANEL',
                        payload: 'modelSelector',
                      })
                    }}
                    options={modelOptions}
                  />
                </div>
              </AnimatedCollapse>
            </div>
          )}

          {state.workflowMode === 'card' && <StudioCardSection />}

          {/* ── Toolbar panels ─────────────────────────────────────── */}
          <StudioToolbarPanels />

          {/* ── Free credits ──────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2">
            <Gift className="size-3.5 text-chart-3" />
            <span className="font-serif">
              {tStudio('freeQuota', {
                remaining: Math.max(0, freeRemaining),
                limit: summary.freeGenerationLimit,
              })}
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
})
