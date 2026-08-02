import { useTranslations } from 'next-intl'

import { HOMEPAGE_ROUTES } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

import { HomeV3Auth } from './HomeV3Auth'
import { HomeV3LocaleSwitch } from './HomeV3LocaleSwitch'

/**
 * Floating pill header. Brand plus the language switch plus the auth slot — the
 * nav links and the second copy of login/signup that used to sit in the hero
 * were both cut (docs/references/pages/home.md §A1).
 *
 * The pill runs to about half the page width, so the brand sits at one end and
 * the controls at the other rather than everything huddling in the middle.
 *
 * Auth is one door and it is the only client-rendered thing here: the two
 * static links that used to sit in this spot could not tell whether the visitor
 * was already signed in, and they navigated away from the page instead of
 * opening in place. See `HomeV3Auth`.
 *
 * The shrink-on-scroll state is driven by `data-tucked`, set by `HomeV3Motion`;
 * without that script the header simply stays at rest.
 */
export function HomeV3Header() {
  const tCommon = useTranslations('Common')

  return (
    <header className="home-v3-header" data-home-v3-header>
      <Link href={HOMEPAGE_ROUTES.home} className="home-v3-brand">
        {tCommon('brand')}
      </Link>

      <span className="home-v3-header-spacer" />

      <HomeV3LocaleSwitch />

      <HomeV3Auth />
    </header>
  )
}
