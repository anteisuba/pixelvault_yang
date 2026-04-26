export const ONBOARDING_STEPS = [
  'welcome',
  'prompt',
  'model',
  'apiKey',
  'generate',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const ONBOARDING_STORAGE_KEY = 'pixelvault:onboarding-completed'

/** Steps that can be skipped by the user */
export const SKIPPABLE_STEPS: ReadonlySet<OnboardingStep> = new Set(['apiKey'])
