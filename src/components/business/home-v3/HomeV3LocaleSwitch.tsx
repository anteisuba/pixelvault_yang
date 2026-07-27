'use client'

import { useLocale, useTranslations } from 'next-intl'

import { Link, usePathname } from '@/i18n/navigation'
import { LOCALES } from '@/i18n/routing'

/**
 * Language switch for the v3 header.
 *
 * The mechanism and the copy are the shared ones — `Link` with a `locale` prop
 * from `@/i18n/navigation`, labels from the `LocaleSwitcher` namespace — but the
 * skin is not: `components/layout/LocaleSwitcher` paints itself with the app's
 * semantic tokens, which resolve to the dark theme and would render a dark chip
 * inside this light pill.
 *
 * Deliberately no `useSearchParams`: the marketing home has no query state worth
 * carrying, and reading it here would force the statically rendered page into a
 * Suspense boundary for nothing.
 */
export function HomeV3LocaleSwitch() {
  const active = useLocale()
  const pathname = usePathname()
  const t = useTranslations('LocaleSwitcher')

  return (
    <nav className="home-v3-locales" aria-label={t('label')}>
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          title={t(`names.${locale}`)}
          aria-current={locale === active ? 'true' : undefined}
          data-active={locale === active ? true : undefined}
        >
          {t(`options.${locale}`)}
        </Link>
      ))}
    </nav>
  )
}
