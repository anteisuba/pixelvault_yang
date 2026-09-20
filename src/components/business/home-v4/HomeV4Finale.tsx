'use client'

import { useEffect, useState } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FINALE,
  HOME_V4_ROUTES,
} from '@/constants/homepage-v4'
import { Link } from '@/i18n/navigation'

interface HomeV4FinaleProps {
  /** True while this is the page on screen. */
  active: boolean
}

/**
 * 收尾页 — the deck's last screen, fully built (not a placeholder).
 *
 * Three beats: the closing line rises out of its mask and the CTA settles under
 * it, the giant wordmark fades up behind, then the single-line footer.
 *
 * ⚠ `.fin-mark` carries the `l1` parallax class, and the parallax rules write
 * `transform`. So it must **not** be centred with `left:50% / translateX(-50%)`
 * — the layer transform would overwrite the centring and throw it sideways on
 * the first page turn. `home-v4.css` centres it with `left:0; right:0;
 * text-align:center` instead. The same trap applies to anything else that ends
 * up carrying a layer class.
 */
export function HomeV4Finale({ active }: HomeV4FinaleProps) {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  const [heroIn, setHeroIn] = useState(false)
  const [markIn, setMarkIn] = useState(false)
  const [footIn, setFootIn] = useState(false)

  useEffect(() => {
    if (!active) {
      /* Rewind once the page has slid away, not while it is still on screen —
         see the same note in `HomeV4Opening`. */
      const rewind = window.setTimeout(() => {
        setHeroIn(false)
        setMarkIn(false)
        setFootIn(false)
      }, HOME_V4_ENGINE.PAGE_MS)
      return () => window.clearTimeout(rewind)
    }

    const base = HOME_V4_FINALE.ENTER_DELAY_MS
    const timers = [
      window.setTimeout(() => setHeroIn(true), base + HOME_V4_FINALE.HERO_MS),
      window.setTimeout(() => setMarkIn(true), base + HOME_V4_FINALE.MARK_MS),
      window.setTimeout(() => setFootIn(true), base + HOME_V4_FINALE.FOOT_MS),
    ]

    return () => {
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [active])

  return (
    <div className="page-inner">
      <div className="fg">
        <div className={`fin-hero l2${heroIn ? ' in' : ''}`}>
          <h2>
            <span className="opl">
              <span>{t('v4.finale.title')}</span>
            </span>
          </h2>
          <p className="fin-sub">{t('foot.tagline')}</p>
          <Link className="cta" href={HOME_V4_ROUTES.canvas}>
            {t('v4.finale.cta')}
          </Link>
        </div>
      </div>

      {/* Both sit outside `.fg`, pinned to `.page-inner`; the wordmark is cropped
          by `.vp`'s own overflow so it reads as a printed cap. */}
      <div className={`fin-mark l1${markIn ? ' in' : ''}`} aria-hidden="true">
        {tCommon('brand')}
      </div>

      <div className={`fin-foot l3${footIn ? ' in' : ''}`}>
        <span>
          © {HOME_V4_FINALE.COPYRIGHT_YEAR} {tCommon('brand')}
        </span>
        <span>
          <Link href={HOME_V4_ROUTES.terms}>{t('foot.terms')}</Link>
          {' · '}
          <Link href={HOME_V4_ROUTES.privacy}>{t('foot.privacy')}</Link>
          {' · '}
          {/* No route for the guidelines yet — plain text until one exists. */}
          {t('v4.finale.guidelines')}
        </span>
      </div>
    </div>
  )
}
