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
  'Auth',
  'Common',
  'ErrorBoundary',
  'Errors',
  'Homepage',
  'Legal',
  'LocaleSwitcher',
  'Metadata',
  'NotFound',
  'Models',
  'Navbar',
  // The privacy-consent banner is mounted in `[locale]/layout.tsx`, i.e.
  // under *this* provider, on every route — marketing and `(main)` alike.
  // It therefore must not join `OUTSIDE_APP_NAMESPACES`.
  'PrivacyConsent',
  'Toasts',
] as const

/**
 * Namespaces whose only consumers live *outside* the `(main)` route group,
 * so the `(main)` provider has no reason to serialize them into every RSC
 * payload. Each entry's consumer set is pinned by
 * `messages-split.test.ts` — add a consumer inside `(main)` and that test
 * fails rather than the page silently rendering raw message keys.
 *
 * Measured on 2026-08-25: dropping these five trims 20,801 B (en) /
 * 25,491 B (ja) / 19,431 B (zh) off the client payload of every `(main)`
 * page load. `Legal` alone is 11,873 B of privacy/terms prose that only
 * `/privacy` and `/terms` ever render.
 *
 * ⚠ This is a *deny*list on purpose. A new namespace ships to `(main)` by
 * default; only an explicit, test-pinned entry here opts out. The inverse
 * (an allowlist) would make "forgot to register the namespace" the default
 * failure — and that failure is invisible: `useTranslations(<ns>)` resolves
 * to the literal key string instead of throwing.
 *
 * ⛔ Do not add `NotFound` / `ErrorBoundary` / `Errors` here. `notFound()`
 * is called from inside `(main)` (`gallery/[id]`, `u/[username]`), and
 * which layout chain wraps the resulting boundary is a Next-internal
 * detail — not worth 162 B to guess at.
 */
export const OUTSIDE_APP_NAMESPACES = [
  'Auth',
  'GlobalError',
  'Homepage',
  'Legal',
  'Metadata',
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

export function omitMessages<T extends AbstractIntlMessages>(
  messages: T,
  namespaces: readonly string[],
): Partial<T> {
  const omitted = new Set<string>(namespaces)
  const kept: Partial<T> = {}
  for (const ns of Object.keys(messages)) {
    if (omitted.has(ns)) continue
    kept[ns as keyof T] = messages[ns as keyof T]
  }
  return kept
}
