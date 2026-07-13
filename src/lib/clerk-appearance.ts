import type { Appearance } from '@clerk/types'

/**
 * Shared Clerk chrome: pure white card, near-black ink, pill CTAs.
 * Path pages (`/sign-in`) and modal entry both use this base.
 */
const clerkBaseAppearance: Appearance = {
  variables: {
    colorPrimary: '#141413',
    colorBackground: '#ffffff',
    colorText: '#141413',
    colorTextSecondary: '#6b6a64',
    colorInputBackground: '#ffffff',
    colorInputText: '#141413',
    colorNeutral: '#141413',
    fontFamily: '"Space Grotesk", system-ui, sans-serif',
    borderRadius: '0.625rem',
  },
  elements: {
    rootBox: 'w-full',
    card: 'shadow-none border border-neutral-200 bg-white rounded-2xl',
    headerTitle: 'font-display font-semibold text-neutral-950 text-xl',
    headerSubtitle: 'text-neutral-600 text-sm',
    socialButtonsBlockButton:
      'rounded-full border border-neutral-200 hover:bg-neutral-100 normal-case font-medium transition',
    socialButtonsBlockButtonText: 'font-medium',
    dividerLine: 'bg-neutral-200',
    dividerText: 'text-neutral-500 text-xs',
    formFieldLabel: 'text-neutral-950 font-medium text-sm',
    formFieldInput:
      'rounded-lg border border-neutral-200 bg-white text-neutral-950 focus:border-neutral-950/40 focus:ring-2 focus:ring-neutral-950/10 transition',
    formButtonPrimary:
      'bg-neutral-950 text-white hover:bg-neutral-800 active:bg-neutral-700 rounded-full normal-case font-semibold tracking-normal py-3 transition',
    footerAction: 'text-neutral-600',
    footerActionLink: 'text-neutral-950 font-semibold hover:underline',
    footer: 'bg-transparent',
    identityPreviewText: 'text-neutral-950',
    identityPreviewEditButton: 'text-neutral-950 hover:underline',
  },
  layout: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
  },
}

/** Full-page auth routes (`AuthPageShell` + path routing). */
export const clerkAppearance: Appearance = clerkBaseAppearance

/**
 * Embedded Clerk form chrome for the in-page auth dialog
 * (`AuthModalProvider` + `routing="virtual"`). Backdrop/shell are owned by
 * our Dialog — these tokens only style the form fields inside the card.
 */
export const clerkModalAppearance: Appearance = {
  ...clerkBaseAppearance,
  elements: {
    ...clerkBaseAppearance.elements,
    rootBox: 'w-full',
    card: 'shadow-none border-0 bg-transparent w-full',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    // Clerk still renders a header block for a11y; collapse visual chrome.
    header: 'hidden',
  },
}
