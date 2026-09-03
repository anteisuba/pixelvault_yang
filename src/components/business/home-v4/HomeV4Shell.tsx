import '@/app/home-v4.css'
import '@/app/auth.css'

import type { CSSProperties } from 'react'

import { useLocale } from 'next-intl'

import {
  HOME_V4_DOTS_STAGGER_MS,
  HOME_V4_ENGINE,
  HOME_V4_PARALLAX,
  type HomeV4ShowcaseShot,
} from '@/constants/homepage-v4'
import { AuthDialogProvider } from '@/components/business/auth/AuthDialog'
import { homepageMono, homepageSans, homepageSerifJapanese } from '@/i18n/fonts'

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
 * v4 marketing home. Domain contract:
 * `docs/references/pages/home.md`.
 *
 * A server component on purpose — the deck under it is the only client
 * boundary, so the headline, the model names and the whole page list are in the
 * first HTML response and the page stays edge-cacheable.
 *
 * The three marketing-only faces are declared **here** rather than on the root
 * `<body>` (2026-09-03 font pass) — `home-v4.css` reads `--font-home-sans` /
 * `--font-home-mono` / `--font-home-serif-jp` off this same `.home-v4` element,
 * so this is the closest ancestor that works, and every other route stops
 * paying for three faces it never draws. `--font-home-serif` is the exception
 * that stays on `<body>`: VoiceRoom reads it too (see `src/i18n/fonts.ts`).
 *
 * `data-locale` picks the CJK face. It reads the locale segment rather than
 * `<html lang>` because a root layout never re-renders on client navigation, and
 * the previous marketing home spent a while drawing Japanese in Noto Sans SC
 * because of that.
 */
interface HomeV4ShellProps {
  /**
   * The opening wall's shots, read from the public gallery by the page. Omitted
   * only by tests; the page always passes a full wall (the service pads it).
   */
  shots?: readonly HomeV4ShowcaseShot[]
}

export function HomeV4Shell({ shots }: HomeV4ShellProps) {
  const locale = useLocale()

  return (
    <AuthDialogProvider>
      <div
        className={`home-v4 ${homepageSans.variable} ${homepageMono.variable} ${homepageSerifJapanese.variable}`}
        data-locale={locale}
        style={MOTION_VARS}
      >
        <HomeV4Deck locale={locale} shots={shots} />
      </div>
    </AuthDialogProvider>
  )
}
