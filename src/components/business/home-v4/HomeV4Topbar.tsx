'use client'

import { useAuth } from '@clerk/nextjs'
import { useLocale, useTranslations } from 'next-intl'

import { HOME_V4_ROUTES } from '@/constants/homepage-v4'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { LOCALES } from '@/i18n/routing'
import { useAuthDialog } from '@/components/business/auth/AuthDialog'

/**
 * 浮岛登录条 — a centred capsule, not a full-width bar.
 *
 * Three things and a spacer: brand, language, the auth door. The 功能 / 模型
 * jump links are gone — owner's 2026-08-28 review put the bar back to what the
 * live marketing home has always had, and neither the links nor the page ids
 * they carried survive anywhere else.
 *
 * `--bar` still exists but no longer describes this element's box: it is only
 * the top inset `.page-inner` reserves, and the island (14px + ~53px tall) fits
 * inside it.
 *
 * The auth door keeps the rule the previous marketing home set, because it is
 * the right one: the button looks identical signed in or out and only its
 * destination changes, so an edge-cached marketing page never has to wait on
 * Clerk before it can paint.
 */
export function HomeV4Topbar() {
  const tAuth = useTranslations('Auth')
  const tCommon = useTranslations('Common')
  const tLocale = useTranslations('LocaleSwitcher')
  const activeLocale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { openAuth } = useAuthDialog()

  return (
    <header className="topbar">
      <Link href={HOME_V4_ROUTES.home} className="logo">
        {tCommon('brand')}
      </Link>

      <span className="spacer" />

      <nav className="locales" aria-label={tLocale('label')}>
        {LOCALES.map((locale) => (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            title={tLocale(`names.${locale}`)}
            aria-current={locale === activeLocale ? 'true' : undefined}
            data-active={locale === activeLocale ? true : undefined}
          >
            {tLocale(`options.${locale}`)}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        className="login"
        onClick={() => {
          /* Not yet resolved: fall through to the window rather than guess —
             Clerk forwards an already-signed-in visitor on its own. */
          if (isLoaded && isSignedIn) {
            router.push(HOME_V4_ROUTES.studio)
            return
          }
          openAuth()
        }}
      >
        {tAuth('open')}
      </button>
    </header>
  )
}
