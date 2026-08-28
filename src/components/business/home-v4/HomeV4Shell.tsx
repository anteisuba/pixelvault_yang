import '@/app/home-v4.css'
import '@/app/auth.css'

import type { CSSProperties } from 'react'

import { useLocale } from 'next-intl'

import {
  HOME_V4_DOTS_STAGGER_MS,
  HOME_V4_ENGINE,
  HOME_V4_PARALLAX,
} from '@/constants/homepage-v4'
import { AuthDialogProvider } from '@/components/business/auth/AuthDialog'

import { HomeV4Deck } from './HomeV4Deck'

/**
 * Motion numbers pushed onto the domain root as custom properties.
 *
 * `home-v4.css` declares the same values as fallbacks, so the skin still reads
 * correctly on its own — but at runtime these win, which is what keeps the
 * engine's clock (`HOME_V4_ENGINE.PAGE_MS`, the lock, the layer offsets) and the
 * stylesheet's clock from being two numbers that drift apart.
 */
const MOTION_VARS = {
  '--dur': `${HOME_V4_ENGINE.PAGE_MS}ms`,
  '--l1-dur': `${HOME_V4_PARALLAX.L1_MS}ms`,
  '--l3-dur': `${HOME_V4_PARALLAX.L3_MS}ms`,
  '--hfade': `${HOME_V4_PARALLAX.STATION_FADE_MS}ms`,
  '--l1-v': `${HOME_V4_PARALLAX.VERTICAL_VH.L1}vh`,
  '--l2-v': `${HOME_V4_PARALLAX.VERTICAL_VH.L2}vh`,
  '--l3-v': `${HOME_V4_PARALLAX.VERTICAL_VH.L3}vh`,
  '--l1-h': `${HOME_V4_PARALLAX.HORIZONTAL_VW.L1}vw`,
  '--l2-h': `${HOME_V4_PARALLAX.HORIZONTAL_VW.L2}vw`,
  '--l3-h': `${HOME_V4_PARALLAX.HORIZONTAL_VW.L3}vw`,
  '--dot-stagger': `${HOME_V4_DOTS_STAGGER_MS}ms`,
} as CSSProperties

/**
 * v4 marketing home. Construction spec:
 * `docs/plans/prototypes/homepage-slide-v2-SPEC.html`.
 *
 * A server component on purpose — the deck under it is the only client
 * boundary, so the headline, the model names and the whole page list are in the
 * first HTML response and the page stays edge-cacheable.
 *
 * `data-locale` picks the CJK face. It reads the locale segment rather than
 * `<html lang>` because a root layout never re-renders on client navigation, and
 * the previous marketing home spent a while drawing Japanese in Noto Sans SC
 * because of that.
 */
export function HomeV4Shell() {
  const locale = useLocale()

  return (
    <AuthDialogProvider>
      <div className="home-v4" data-locale={locale} style={MOTION_VARS}>
        <HomeV4Deck locale={locale} />
      </div>
    </AuthDialogProvider>
  )
}
