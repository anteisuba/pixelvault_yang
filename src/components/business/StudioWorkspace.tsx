'use client'

import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'
import {
  StudioModeSelector,
  StudioCardSelectors,
  StudioPromptArea,
  StudioGenerateBar,
  StudioPreview,
  StudioToolbarPanels,
  StudioCardManagement,
  StudioProjectHistory,
  StudioVideoMode,
} from '@/components/business/studio'

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

function StudioWorkspaceInner() {
  const { state } = useStudioForm()
  const { onboarding } = useStudioData()

  return (
    <div className="space-y-4">
      <StudioModeSelector />

      {state.mode === 'image' ? (
        <div
          role="tabpanel"
          id="studio-panel-image"
          aria-labelledby="studio-tab-image"
          className="space-y-4"
        >
          <StudioCardSelectors />
          <StudioPromptArea />
          <StudioGenerateBar />
          <StudioPreview />
          <StudioToolbarPanels />
          <StudioCardManagement />
          <StudioProjectHistory />
        </div>
      ) : (
        <StudioVideoMode />
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
