'use client'

import { useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ProjectSelector } from '@/components/business/ProjectSelector'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import { AnimatedCollapse } from '@/components/ui/animated-collapse'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

export function StudioProjectHistory() {
  const { state, dispatch } = useStudioForm()
  const { projects } = useStudioData()
  const t = useTranslations('StudioV2')

  const handleRename = useCallback(
    async (id: string, name: string) => projects.update(id, { name }),
    [projects],
  )

  return (
    <div className="rounded-xl border border-border/40 overflow-hidden">
      <button
        type="button"
        aria-expanded={state.panels.projectHistory}
        aria-controls="studio-project-history"
        onClick={() =>
          dispatch({ type: 'TOGGLE_PANEL', payload: 'projectHistory' })
        }
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/20 transition-colors"
      >
        <span className="font-display">{t('projectHistory')}</span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform duration-300',
            state.panels.projectHistory && 'rotate-180',
          )}
        />
      </button>

      <AnimatedCollapse open={state.panels.projectHistory}>
        <div
          id="studio-project-history"
          className="border-t border-border/40 p-4 space-y-4"
        >
          <ProjectSelector
            projects={projects.projects}
            activeProjectId={projects.activeProjectId}
            isLoading={projects.isLoading}
            onSelect={projects.setActiveProjectId}
            onCreate={projects.create}
            onRename={handleRename}
            onDelete={projects.remove}
          />
          <HistoryPanel
            generations={projects.history}
            total={projects.historyTotal}
            hasMore={projects.historyHasMore}
            isLoading={projects.isLoadingHistory}
            onLoadMore={projects.loadMoreHistory}
          />
        </div>
      </AnimatedCollapse>
    </div>
  )
}
