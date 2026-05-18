import type { AbstractIntlMessages } from 'next-intl'

/**
 * Namespaces required by surfaces that render *outside* the `(main)`
 * route group: the marketing homepage, auth pages, and the root layout
 * shell. Anything reachable without signing in lives here.
 *
 * The full message bundle for `(main)` is ~99KB per locale; the marketing
 * subset is ~21KB, so first-paint surfaces stop shipping ~78KB of
 * unrelated Studio/Gallery/Arena strings to the client.
 *
 * Adding a new client-rendered translation to a marketing surface? Add
 * its namespace here, otherwise `useTranslations(<ns>)` will resolve to
 * the message key string at runtime.
 *
 * IntlProvider in use-intl 4.x *replaces* messages on nesting, so the
 * `(main)` layout re-wraps children with the full bundle — paths under
 * the marketing tree never see the heavy namespaces.
 */
export const MARKETING_NAMESPACES = [
  'Common',
  'ErrorBoundary',
  'Errors',
  'Homepage',
  'LocaleSwitcher',
  'Metadata',
  'Models',
  'Navbar',
  'Toasts',
] as const

export function pickMessages<T extends AbstractIntlMessages>(
  messages: T,
  namespaces: readonly string[],
): Partial<T> {
  const picked: Partial<T> = {}
  for (const ns of namespaces) {
    if (ns in messages) {
      picked[ns as keyof T] = messages[ns as keyof T]
    }
  }
  return picked
}
