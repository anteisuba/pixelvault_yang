'use client'

import dynamic from 'next/dynamic'

import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import { Particles } from '@/components/ui/particles'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import {
  StudioModeSelector,
  StudioTopBar,
  StudioCanvas,
  StudioBottomDock,
  StudioSidebar,
  StudioGallery,
} from '@/components/business/studio'

const VideoGenerateForm = dynamic(
  () => import('@/components/business/VideoGenerateForm'),
)

import {
  StudioProvider,
  useStudioForm,
  useStudioData,
} from '@/contexts/studio-context'

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
  const { state } = useStudioForm()
  const { characters, onboarding } = useStudioData()

  return (
    <SidebarProvider defaultOpen={false} className="!min-h-0 bg-background">
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
        /* ── Image mode: canvas-centric vertical layout ──────── */
        <>
          <StudioSidebar />
          <SidebarInset>
            <div
              role="tabpanel"
              id="studio-panel-image"
              aria-labelledby="studio-tab-image"
              className="studio-layout-v2"
            >
              <Particles
                className="fixed inset-0 z-0 pointer-events-none"
                quantity={120}
                staticity={30}
                ease={40}
                size={1.5}
                color="#c4653f"
              />
              <StudioTopBar />
              <StudioCanvas />
              <StudioBottomDock />
              <StudioGallery />
            </div>
          </SidebarInset>
        </>
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
    </SidebarProvider>
  )
}
