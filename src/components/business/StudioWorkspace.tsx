'use client'

import { useTranslations } from 'next-intl'

import {
  StudioModeSelector,
  StudioPromptArea,
  StudioGenerateBar,
  StudioCardSelectors,
  StudioPreview,
  StudioToolbarPanels,
  StudioCardManagement,
  StudioProjectHistory,
  StudioVideoMode,
} from '@/components/business/studio'
import { OnboardingTooltip } from '@/components/business/OnboardingTooltip'

import {
  StudioProvider,
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'

/**
 * StudioWorkspace — thin orchestrator.
 * All state lives in StudioProvider; sub-components consume split contexts directly.
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
  const { isGenerating, lastGeneration } = useStudioGen()
  const t = useTranslations('StudioV2')

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

          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {isGenerating
              ? t('generating')
              : lastGeneration
                ? t('generateSuccess')
                : null}
          </div>

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
