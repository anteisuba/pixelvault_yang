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
import { StudioWorkflowGroupTabs } from '@/components/business/studio/StudioWorkflowGroupTabs'
import { StudioWorkflowPicker } from '@/components/business/studio/StudioWorkflowPicker'
import { StudioWorkflowSummary } from '@/components/business/studio/StudioWorkflowSummary'

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
          <div className="border-b border-border/60 bg-background px-2 py-3 sm:px-6">
            <div className="grid w-full gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-500 ease-out">
              <StudioWorkflowGroupTabs>
                {(currentMediaGroup) => (
                  <>
                    <StudioWorkflowSummary />
                    <StudioWorkflowPicker
                      currentMediaGroup={currentMediaGroup}
                    />
                  </>
                )}
              </StudioWorkflowGroupTabs>
            </div>
          </div>
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
