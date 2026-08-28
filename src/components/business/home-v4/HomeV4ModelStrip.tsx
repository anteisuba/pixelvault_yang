import { useTranslations } from 'next-intl'

import { HOME_V4_MODEL_FACETS, type HomeV4Model } from '@/constants/homepage-v4'

interface HomeV4ModelStripProps {
  model: HomeV4Model
  /**
   * `true` for the copy inside the mobile sheet. Same content, same stacking,
   * different carrier: paper instead of dark glass.
   */
  asSheet?: boolean
}

/** `0 … n-1` — the message files are indexed against `HOME_V4_MODEL_FACETS`. */
function indexes(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

/**
 * 强在哪 / 弱在哪 — the two blocks stacked under a model page's identity board.
 *
 * 站内规格 was the third one and owner retired it on 2026-08-28: it printed the
 * same four rows against every model and the page now leans left so the shot can
 * breathe on the right, which leaves no room for a column that says nothing.
 *
 * Rendered twice per model page and that is on purpose. On a phone the SPEC
 * moved this very node into `<body>` to escape the deck's stacking context;
 * doing that in React would mean tearing a node out from under the reconciler.
 * Two renders of one component off one record cost nothing (there is no state
 * here) and the mobile sheet cannot drift from the desktop strip, because there
 * is only one description of what the strip is.
 *
 * ⚠ The desktop copy carries `l3` — it is a parallax layer, so its `transform`
 * belongs to the deck. The sheet copy must not: it is positioned by the portal.
 */
export function HomeV4ModelStrip({
  model,
  asSheet = false,
}: HomeV4ModelStripProps) {
  const t = useTranslations('Homepage')
  const base = `v4.models.${model.key}`

  return (
    <div className={asSheet ? 'm-strip as-sheet' : 'm-strip l3'}>
      <div className="pm">
        <span className="k">{t('v4.modelPage.plus')}</span>
        <ul>
          {indexes(HOME_V4_MODEL_FACETS.PLUS).map((index) => (
            <li key={index}>{t(`${base}.plus.${index}`)}</li>
          ))}
        </ul>
      </div>

      <div className="pm minus">
        <span className="k">{t('v4.modelPage.minus')}</span>
        <ul>
          {indexes(HOME_V4_MODEL_FACETS.MINUS).map((index) => (
            <li key={index}>{t(`${base}.minus.${index}`)}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
