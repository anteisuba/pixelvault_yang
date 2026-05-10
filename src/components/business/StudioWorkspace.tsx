'use client'

import { useEffect } from 'react'

import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import {
  StudioTopBar,
  StudioCanvas,
  StudioBottomDock,
  StudioSidebar,
  StudioGallery,
  StudioFlowLayout,
  StudioCommandPalette,
} from '@/components/business/studio'

import {
  StudioProvider,
  useStudioForm,
  useStudioData,
} from '@/contexts/studio-context'
import { WORKFLOWS, type WorkflowMediaGroup } from '@/constants/workflows'

const STUDIO_MODE_KEY = 'studio-workflow-mode'

interface StudioWorkspaceProps {
  /**
   * When set, the workspace dispatches to the first workflow of this media
   * group on mount, so /studio/image, /studio/video and /studio/audio each
   * land on the right canvas without the user having to use the (now-removed)
   * center tabs to switch mode.
   */
  defaultMediaGroup?: WorkflowMediaGroup
}

/**
 * StudioWorkspace — wrapped with StudioProvider for state management.
 * Canvas-centric layout: TopBar → Canvas → BottomDock → Gallery.
 */
export function StudioWorkspace({ defaultMediaGroup }: StudioWorkspaceProps) {
  return (
    <StudioProvider>
      <StudioWorkspaceInner defaultMediaGroup={defaultMediaGroup} />
    </StudioProvider>
  )
}

// ═══════════════════════════════════════════════════════════════════
// INNER — consumes the split contexts
// ═══════════════════════════════════════════════════════════════════

function StudioWorkspaceInner({ defaultMediaGroup }: StudioWorkspaceProps) {
  const { state, dispatch } = useStudioForm()
  const { onboarding } = useStudioData()

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

  // Sync mediaGroup with the route — /studio/{image,video,audio} pages pass
  // their group via prop, and we dispatch into the workflow that matches.
  // Skips when the current outputType already matches to avoid feedback loops.
  useEffect(() => {
    if (!defaultMediaGroup) return
    if (state.outputType === defaultMediaGroup) return

    const target = WORKFLOWS.find((w) => w.mediaGroup === defaultMediaGroup)
    if (target) {
      dispatch({ type: 'SET_SELECTED_WORKFLOW_ID', payload: target.id })
    }
  }, [defaultMediaGroup, state.outputType, dispatch])

  return (
    <SidebarProvider defaultOpen={false} className="!min-h-0 bg-background">
      <a
        href="#studio-prompt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to prompt
      </a>
      <StudioSidebar />
      <SidebarInset>
        <div
          role="tabpanel"
          id={`studio-panel-${state.outputType}`}
          aria-labelledby={`studio-tab-${state.outputType}`}
          className="studio-layout-v2"
        >
          <StudioTopBar />
          {/* Unified canvas-centric layout for image / video / audio */}
          <StudioFlowLayout
            canvas={<StudioCanvas />}
            dock={<StudioBottomDock />}
            gallery={<StudioGallery />}
          />
        </div>
      </SidebarInset>

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
