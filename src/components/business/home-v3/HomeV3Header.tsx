import { useTranslations } from 'next-intl'

import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

import { HomeV3LocaleSwitch } from './HomeV3LocaleSwitch'

/**
 * Floating pill header. Brand plus the language switch plus exactly two auth
 * actions — the nav links and the second copy of login/signup that used to sit
 * in the hero were both cut (docs/references/pages/home.md §A1).
 *
 * The pill runs to about half the page width, so the brand sits at one end and
 * the controls at the other rather than everything huddling in the middle.
 *
 * The shrink-on-scroll state is driven by `data-tucked`, set by `HomeV3Motion`;
 * without that script the header simply stays at rest.
 */
export function HomeV3Header() {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <header className="home-v3-header" data-home-v3-header>
      <Link href={HOMEPAGE_ROUTES.home} className="home-v3-brand">
        {tCommon('brand')}
      </Link>

      <span className="home-v3-header-spacer" />

      <HomeV3LocaleSwitch />

      <Link
        href={HOMEPAGE_ROUTES.signIn}
        className="home-v3-pill home-v3-pill--ghost"
      >
        {t('nav.login')}
      </Link>
      <Link
        href={HOMEPAGE_ROUTES.signUp}
        className="home-v3-pill home-v3-pill--solid"
      >
        {t('nav.signup')}
      </Link>
    </header>
  )
}
