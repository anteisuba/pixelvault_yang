import type { Appearance } from '@clerk/types'

/**
 * Clerk widget theme matching PixelVault marketing surfaces:
 * pure white background, near-black foreground, Space Grotesk, pill CTAs.
 * Used by sign-in and sign-up pages.
 */
export const clerkAppearance: Appearance = {
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
    card: 'shadow-none border border-border bg-white rounded-2xl',
    headerTitle: 'font-display font-semibold text-foreground text-xl',
    headerSubtitle: 'text-muted-foreground text-sm',
    socialButtonsBlockButton:
      'rounded-full border border-border hover:bg-secondary/30 normal-case font-medium transition',
    socialButtonsBlockButtonText: 'font-medium',
    dividerLine: 'bg-border',
    dividerText: 'text-muted-foreground text-xs',
    formFieldLabel: 'text-foreground font-medium text-sm',
    formFieldInput:
      'rounded-lg border border-border bg-white focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10 transition',
    formButtonPrimary:
      'bg-foreground text-background hover:bg-foreground/92 active:bg-foreground/85 rounded-full normal-case font-semibold tracking-normal py-3 transition',
    footerAction: 'text-muted-foreground',
    footerActionLink: 'text-foreground font-semibold hover:underline',
    footer: 'bg-transparent',
    identityPreviewText: 'text-foreground',
    identityPreviewEditButton: 'text-foreground hover:underline',
  },
  layout: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
  },
}
