'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import { ProjectSelector } from '@/components/business/ProjectSelector'
import { HistoryPanel } from '@/components/business/HistoryPanel'
import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import {
  StudioModeSelector,
  StudioLeftPanel,
  StudioRightPanel,
} from '@/components/business/studio'
import { cn } from '@/lib/utils'

const VideoGenerateForm = dynamic(
  () => import('@/components/business/VideoGenerateForm'),
)

import {
  StudioProvider,
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'

/**
 * StudioWorkspace — wrapped with StudioProvider for state management.
 * Sub-components consume split contexts (Form/Data/Gen) for optimal re-renders.
 */
export function StudioWorkspace() {
  return (
    <StudioProvider>
      <StudioWorkspaceInner />
    </StudioProvider>
  )
}

// ═══════════════════════════════════════════════════════════════════
// INNER — consumes the split contexts
// ═══════════════════════════════════════════════════════════════════

function StudioWorkspaceInner() {
  const { state } = useStudioForm()
  const { characters, projects, onboarding } = useStudioData()
  const { isGenerating, lastGeneration } = useStudioGen()

  // Dynamic layout: single column when no content, split when content exists
  const hasContent =
    isGenerating || !!lastGeneration || projects.history.length > 0

  const handleRename = useCallback(
    async (id: string, name: string) => projects.update(id, { name }),
    [projects],
  )

  return (
    <div className="space-y-4">
      {/* ── Mode tabs (Image / Video) ───────────────────────── */}
      <StudioModeSelector />

      {state.outputType === 'image' ? (
        <div
          role="tabpanel"
          id="studio-panel-image"
          aria-labelledby="studio-tab-image"
          className="space-y-4"
        >
          {/* ── Project selector — full width top ────────────── */}
          <ProjectSelector
            projects={projects.projects}
            activeProjectId={projects.activeProjectId}
            isLoading={projects.isLoading}
            onSelect={projects.setActiveProjectId}
            onCreate={projects.create}
            onRename={handleRename}
            onDelete={projects.remove}
          />

          {/* ── Dynamic layout: centered when empty, split when content ─ */}
          {/* Always render both panels to keep the component tree stable
              (prevents Radix hydration ID mismatch). CSS controls layout. */}
          <div
            className={cn(
              'flex flex-col',
              hasContent ? 'lg:flex-row lg:gap-6' : 'mx-auto max-w-2xl',
            )}
          >
            <StudioLeftPanel
              className={cn('w-full', hasContent && 'lg:w-[45%] lg:shrink-0')}
            />
            <StudioRightPanel
              className={cn(
                'w-full mt-6',
                hasContent ? 'lg:flex-1 lg:mt-0' : 'hidden',
              )}
            />
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="studio-panel-video"
          aria-labelledby="studio-tab-video"
          className="space-y-4"
        >
          <VideoGenerateForm activeCharacterCards={characters.activeCards} />
          <HistoryPanel
            generations={projects.history}
            total={projects.historyTotal}
            hasMore={projects.historyHasMore}
            isLoading={projects.isLoadingHistory}
            onLoadMore={projects.loadMoreHistory}
          />
        </div>
      )}

      <OnboardingTooltip
        active={onboarding.active}
        step={onboarding.currentStep}
        stepIndex={onboarding.currentIndex}
        totalSteps={onboarding.totalSteps}
        isLastStep={onboarding.isLastStep}
        isSkippable={onboarding.isSkippable}
        onNext={onboarding.next}
        onSkip={onboarding.skip}
        onDismiss={onboarding.dismiss}
      />
    </div>
  )
}
