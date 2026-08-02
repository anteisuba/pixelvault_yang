import type { Appearance } from '@clerk/types'

/**
 * The one Clerk skin, shared by the modal and by the `/sign-in` `/sign-up` path
 * pages so both carriers render the same window (docs/references/pages/home.md
 * §A8).
 *
 * Colour lives in `variables` rather than in `elements` class strings: Clerk
 * derives dozens of internal shades (hover, disabled, focus ring, error) from
 * these, so setting them here skins states we never name. `elements` is only
 * used for structure and for the four controls whose look the reference pins
 * down. The values themselves are documented, with their measured contrast
 * ratios, in `src/app/auth.css` — do not fork them here.
 *
 * `header` and `footer` are hidden on purpose. The card renders its own title
 * and subtitle so the wording stays in `src/messages/*.json`, and so the
 * combined sign-in-or-up flow can keep one heading instead of swapping between
 * "Sign in" and "Sign up" while the user types.
 */
/**
 * Puts every Clerk style in its own cascade layer. Unlayered CSS beats layered
 * CSS outright, so our stylesheets win by being unlayered rather than by
 * out-specifying a vendor sheet we do not control.
 *
 * This has to sit on `<ClerkProvider>`: `cssLayerName` is a global appearance
 * option and is ignored on a per-component `appearance`.
 *
 * Without it the widget kept its own rings and drop shadows underneath our
 * borders. Clerk hangs them off attribute selectors like
 * `.cl-internal-xxx[data-variant="solid"][data-color="primary"]`, which
 * outranks any sane class selector — the submit button drew a 1px ring plus two
 * drops *outside* our own 1px border, and at 4× magnification the corner was
 * visibly a doubled, offset arc. That is what read as "the radius is wrong".
 */
export const CLERK_GLOBAL_APPEARANCE: Appearance = {
  cssLayerName: 'clerk',
}

export const clerkAuthAppearance: Appearance = {
  variables: {
    /* Resolved pixel values read off the reference window at haivis.ai. See the
       token block at the top of `src/app/auth.css` for the measured contrast
       ratios, including the two that fall below WCAG and are kept deliberately. */
    colorPrimary: '#1a1a1a',
    colorBackground: '#f4f2ec',
    colorForeground: '#171d2b',
    colorMutedForeground: '#5d748e',
    colorTextOnPrimaryBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputForeground: '#09172b',
    colorNeutral: '#171d2b',
    fontFamily: 'inherit',
    /* The reference sets 12px on a 14px root. Absolute px, so it is the same
       optical size here despite our 16px root. */
    fontSize: '0.75rem',
    /* Base unit every Clerk margin and gap is derived from. Trimmed from 1rem
       so the widget's internal rhythm lines up with the card's own. */
    spacing: '0.9rem',
    /* Kept in step with `--auth-radius` in `src/app/auth.css`. Clerk derives
       sm/lg/xl from this, which keeps steps we do not style by hand — the
       verification-code boxes, for one — on the same corner as the rest. */
    borderRadius: '10px',
  },
  elements: {
    rootBox: 'auth-clerk-root',
    cardBox: 'auth-clerk-cardbox',
    card: 'auth-clerk-card',
    main: 'auth-clerk-main',
    form: 'auth-clerk-form',
    header: 'auth-hidden',
    logoBox: 'auth-hidden',
    footer: 'auth-hidden',
    socialButtons: 'auth-socials',
    socialButtonsBlockButton: 'auth-social',
    dividerRow: 'auth-divider-row',
    dividerLine: 'auth-divider-line',
    dividerText: 'auth-divider-text',
    formFieldLabelRow: 'auth-label-row',
    formFieldLabel: 'auth-label-hidden',
    formFieldInput: 'auth-input',
    formButtonPrimary: 'auth-primary',
    formResendCodeLink: 'auth-link',
    identityPreviewEditButton: 'auth-link',
    backLink: 'auth-link',
  },
  layout: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
  },
}
