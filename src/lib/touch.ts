/**
 * Touch-keyboard policy helpers.
 *
 * Product rule: on touch-primary devices the on-screen keyboard should appear
 * ONLY when the user deliberately taps a text field — never from autofocus,
 * dialog/drawer/popover open-autofocus, or a button handler that focuses a
 * field as a desktop convenience. Desktop (fine pointer) keeps every autofocus
 * behaviour.
 *
 * Touch detection uses `(hover: none)`, the same heuristic globals.css already
 * uses for touch affordances. SSR / JSDOM (no `matchMedia`) falls back to the
 * desktop path so server render and unit tests keep autofocus.
 */
export function isTouchPrimary(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false
  }
  return window.matchMedia('(hover: none)').matches
}

/**
 * Focus an element, but skip on touch so the soft keyboard doesn't pop. Use for
 * programmatic focus of text inputs (search boxes, inline rename/edit fields,
 * the Studio prompt). Pass `{ select: true }` to also select the contents on
 * desktop.
 */
export function focusUnlessTouch(
  el: HTMLElement | null | undefined,
  options?: { select?: boolean },
): void {
  if (!el || isTouchPrimary()) return
  el.focus()
  if (
    options?.select &&
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
  ) {
    el.select()
  }
}
