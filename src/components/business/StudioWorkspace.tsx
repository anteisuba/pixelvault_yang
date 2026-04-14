'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'

import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import {
  StudioModeSelector,
  StudioTopBar,
  StudioCanvas,
  StudioBottomDock,
  StudioSidebar,
  StudioGallery,
  StudioFlowLayout,
  StudioCommandPalette,
} from '@/components/business/studio'

const VideoGenerateForm = dynamic(
  () => import('@/components/business/VideoGenerateForm'),
)

import {
  StudioProvider,
  useStudioForm,
  useStudioData,
} from '@/contexts/studio-context'

const STUDIO_MODE_KEY = 'studio-workflow-mode'

/**
 * StudioWorkspace — wrapped with StudioProvider for state management.
 * Canvas-centric layout: TopBar → Canvas → BottomDock → Gallery.
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
  const { state, dispatch } = useStudioForm()
  const { characters, onboarding } = useStudioData()
  const isQuickMode = state.workflowMode === 'quick'

  // Restore workflow mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STUDIO_MODE_KEY)
    if (saved === 'card' || saved === 'quick') {
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: saved })
    }
  }, [dispatch])

  // Persist workflow mode changes
  useEffect(() => {
    localStorage.setItem(STUDIO_MODE_KEY, state.workflowMode)
  }, [state.workflowMode])

  return (
    <SidebarProvider defaultOpen={false} className="!min-h-0 bg-background">
      <a
        href="#studio-prompt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to prompt
      </a>
      {state.outputType === 'video' ? (
        /* ── Video mode: simple stack (no canvas layout) ──────── */
        <div
          role="tabpanel"
          id="studio-panel-video"
          aria-labelledby="studio-tab-video"
          className="space-y-4 p-5"
        >
          <StudioModeSelector />
          <VideoGenerateForm activeCharacterCards={characters.activeCards} />
        </div>
      ) : (
        /* ── Image & Audio mode: canvas-centric vertical layout ── */
        <>
          <StudioSidebar />
          <SidebarInset>
            <div
              role="tabpanel"
              id={`studio-panel-${state.outputType}`}
              aria-labelledby={`studio-tab-${state.outputType}`}
              className="studio-layout-v2"
            >
              <StudioTopBar />
              <StudioFlowLayout
                canvas={<StudioCanvas />}
                dock={<StudioBottomDock />}
                gallery={<StudioGallery />}
              />
            </div>
          </SidebarInset>
        </>
      )}

      <StudioCommandPalette />

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
    </SidebarProvider>
  )
}
