import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { focusUnlessTouch } from '@/lib/touch'

/**
 * Focus the Studio prompt textarea — but NOT on touch-primary devices.
 *
 * Several non-text actions (Remix, "Use as reference", dropping an image, the
 * blocked-generate hints) programmatically focus the prompt textarea so a
 * desktop user can keep typing without reaching for the mouse. On a touch
 * device, focusing a text field from inside a tap handler forces the on-screen
 * keyboard to pop up — even though the user tapped a button, not the textarea.
 *
 * Delegates to {@link focusUnlessTouch}, the shared touch-keyboard policy, so
 * the keyboard only ever appears when the user deliberately taps the textarea.
 */
export function focusStudioPrompt(options?: { select?: boolean }): void {
  if (typeof document === 'undefined') return
  const field = document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)
  if (field instanceof HTMLTextAreaElement) focusUnlessTouch(field, options)
}
