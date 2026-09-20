import type { ReactNode } from 'react'

import { useTranslations } from 'next-intl'

import { HOME_V4_FN_ROUTES, HOME_V4_GLYPHS } from '@/constants/homepage-v4'
import { Link } from '@/i18n/navigation'

interface HomeV4FnFrameProps {
  /** Section id — picks the CTA's destination out of `HOME_V4_FN_ROUTES`. */
  id: string
  /** Mono kicker, e.g. `01 · IMAGE`. Language-neutral, comes from the deck. */
  eyebrow: string
  /** The one line the page is about. */
  title: string
  /**
   * Wide desktop only (≥1100px, see `home-v4.css`): the header moves into a
   * left rail and the stage takes the full height beside it. On for pages 01 /
   * 02 — their stage is too tall to sit under a centred header on a laptop.
   */
  rail?: boolean
  /**
   * A block that belongs to the header in the rail and sits under the stage
   * everywhere else — page 01's model chips.
   */
  aside?: ReactNode
  /**
   * The段's 结果态 has arrived: light the 「去用这个」 link.
   *
   * ⚠ The link is **always rendered**, on every段, at every progress — only its
   * paint is withheld. A CTA that appears at 0.9 would relayout the stage at
   * the one moment the reader is looking at the result.
   */
  ctaOn: boolean
  children: ReactNode
}

/**
 * The scaffold all six feature sections share: `.page-inner` → `.fg.imgfn` →
 * header (`l2`) + stage (`l3`) + the section's own CTA.
 *
 * It exists because the SPEC wrote the header and stage boxes as inline styles
 * repeated on all six pages. Those are layout, not data, so they moved into
 * `home-v4.css` (`.fn-head` / `.fn-stage`) and the repetition moved here.
 *
 * `.fn-text` is `display: contents` until the rail turns it into the left
 * column, which is why it carries no layer class of its own: without a rail
 * the header, stage and aside are three flex items of `.imgfn`, and the aside
 * is ordered after the stage.
 */
export function HomeV4FnFrame({
  id,
  eyebrow,
  title,
  rail = false,
  aside,
  ctaOn,
  children,
}: HomeV4FnFrameProps) {
  const t = useTranslations('Homepage')

  return (
    <div className={rail ? 'page-inner rail' : 'page-inner'}>
      <div className="fg imgfn">
        <div className="fn-text">
          <div className="fn-head l2">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <Link
              className="fn-cta"
              data-on={String(ctaOn)}
              href={HOME_V4_FN_ROUTES[id]}
              tabIndex={ctaOn ? undefined : -1}
            >
              {t(`v4.fn.${id}.go`)} {HOME_V4_GLYPHS.arrow}
            </Link>
          </div>
          {aside ? <div className="fn-aside l3">{aside}</div> : null}
        </div>
        <div className="fn-stage l3">{children}</div>
      </div>
    </div>
  )
}
