'use client'

import { useCallback, useState } from 'react'

import {
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  SKIPPABLE_STEPS,
  type OnboardingStep,
} from '@/constants/onboarding'

export function useOnboarding() {
  const [active, setActive] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    try {
      return !window.localStorage.getItem(ONBOARDING_STORAGE_KEY)
    } catch {
      return false
    }
  })
  const [currentIndex, setCurrentIndex] = useState(0)

  const currentStep: OnboardingStep = ONBOARDING_STEPS[currentIndex]
  const isLastStep = currentIndex === ONBOARDING_STEPS.length - 1
  const isSkippable = SKIPPABLE_STEPS.has(currentStep)

  const next = useCallback(() => {
    if (isLastStep) {
      setActive(false)
      try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
      } catch {
        // ignore
      }
      return
    }
    setCurrentIndex((i) => i + 1)
  }, [isLastStep])

  const skip = useCallback(() => {
    // Skip moves to the next step (used for skippable steps like apiKey)
    next()
  }, [next])

  const dismiss = useCallback(() => {
    setActive(false)
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
    } catch {
      // ignore
    }
  }, [])

  const restart = useCallback(() => {
    setCurrentIndex(0)
    setActive(true)
  }, [])

  return {
    active,
    currentStep,
    currentIndex,
    totalSteps: ONBOARDING_STEPS.length,
    isLastStep,
    isSkippable,
    next,
    skip,
    dismiss,
    restart,
  }
}
