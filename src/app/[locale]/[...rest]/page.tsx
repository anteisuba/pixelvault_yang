import { notFound } from 'next/navigation'

/**
 * Catch-all that renders the localized not-found boundary
 * (`[locale]/not-found.tsx`) for any unmatched path under a locale. Without
 * this, Next.js falls back to its framework-default 404 instead of the branded
 * white-hall page. Concrete routes always win over this catch-all.
 */
export default function LocaleCatchAll() {
  notFound()
}
