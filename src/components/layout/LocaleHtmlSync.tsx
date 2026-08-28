'use client'

import { useEffect } from 'react'

import { useLocale } from 'next-intl'

/**
 * Keeps `<html lang>` in step with the active locale.
 *
 * `lang` is set in the **root** layout (`src/app/layout.tsx`), and a root layout
 * never re-renders across client-side navigations — so switching locale with any
 * of the in-app switchers left the attribute stuck at whatever the first
 * server-rendered page had, and everything keyed off it went stale with it:
 * screen-reader pronunciation, `:lang()` rules, and font selection.
 *
 * The marketing home no longer depends on this — it picks its CJK face off its
 * own `data-locale` (`.home-v4[data-locale='ja']`) precisely because the root
 * `lang` could not be trusted mid-session. Accessibility still can only read
 * `lang`, so keeping it correct remains this component's job.
 *
 * Mounted from `[locale]/layout.tsx`, which *does* re-render when the locale
 * segment changes. Renders nothing; a first server load is already correct, so
 * this only ever repairs the client-navigation case.
 */
export function LocaleHtmlSync() {
  const locale = useLocale()

  useEffect(() => {
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale
    }
  }, [locale])

  return null
}
