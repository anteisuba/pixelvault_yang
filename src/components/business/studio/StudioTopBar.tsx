'use client'

import { memo, useCallback } from 'react'
import { ImageIcon, Film } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { ProjectSelector } from '@/components/business/ProjectSelector'
import { cn } from '@/lib/utils'

export const StudioTopBar = memo(function StudioTopBar() {
  const { state, dispatch } = useStudioForm()
  const { projects } = useStudioData()
  const tStudio = useTranslations('StudioPage')
  const tV3 = useTranslations('StudioV3')

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
    </div>
  )
})
