'use client'

import dynamic from 'next/dynamic'

import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import {
  StudioModeSelector,
  StudioTopBar,
  StudioLeftColumn,
  StudioCenterColumn,
  StudioRightColumn,
  StudioMobileSettings,
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
  const { characters, onboarding } = useStudioData()

  return (
    <div className="space-y-4">
      {state.outputType === 'video' ? (
        /* ── Video mode: simple stack (no three-column) ──────── */
        <div
          role="tabpanel"
          id="studio-panel-video"
          aria-labelledby="studio-tab-video"
          className="space-y-4"
        >
          <StudioModeSelector />
          <VideoGenerateForm activeCharacterCards={characters.activeCards} />
        </div>
      ) : (
        /* ── Image mode: three-column layout ──────────────────── */
        <div
          role="tabpanel"
          id="studio-panel-image"
          aria-labelledby="studio-tab-image"
        >
          {/* Desktop (lg+): top bar + three-column grid */}
          <div className="hidden lg:block space-y-4">
            <StudioTopBar />
            <div className="grid studio-grid">
              <StudioLeftColumn />
              <StudioCenterColumn />
              <StudioRightColumn className="studio-col-sticky" />
            </div>
          </div>

          {/* Mobile + Tablet (<lg): stacked layout */}
          <div className="lg:hidden space-y-4">
            <StudioModeSelector />
            <StudioCenterColumn />
            <StudioRightColumn />
            <StudioMobileSettings />
          </div>
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
