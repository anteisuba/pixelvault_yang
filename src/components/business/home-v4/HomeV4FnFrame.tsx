import type { ReactNode } from 'react'

interface HomeV4FnFrameProps {
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
  children: ReactNode
}

/**
 * The scaffold all six feature pages share: `.page-inner` → `.fg.imgfn` →
 * header (`l2`) + stage (`l3`).
 *
 * It exists because the SPEC wrote the header and stage boxes as inline styles
 * repeated on all six pages. Those are layout, not data, so they moved into
 * `home-v4.css` (`.fn-head` / `.fn-stage`) and the repetition moved here.
 *
 * The layer split is the load-bearing part: `data-layer="copy"` on the text,
 * `data-layer="demo"` on the visual block, so the two travel different
 * distances during the flip and land together (`HOME_V4_PARALLAX.PAGE_FLIP`).
 * The `l2` / `l3` classes stay for the model station's own clocks.
 * ⚠ Anything carrying a layer attribute or class has its `transform` written by
 * the parallax rules — never centre such an element with `translate`.
 *
 * `.fn-text` is `display: contents` until the rail turns it into the left
 * column, which is why it carries no layer class of its own: without a rail
 * the header, stage and aside are three flex items of `.imgfn`, and the aside
 * is ordered after the stage.
 */
export function HomeV4FnFrame({
  eyebrow,
  title,
  rail = false,
  aside,
  children,
}: HomeV4FnFrameProps) {
  return (
    <div className={rail ? 'page-inner rail' : 'page-inner'}>
      <div className="fg imgfn">
        <div className="fn-text">
          <div className="fn-head l2" data-layer="copy">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          {aside ? (
            <div className="fn-aside l3" data-layer="demo">
              {aside}
            </div>
          ) : null}
        </div>
        <div className="fn-stage l3" data-layer="demo">
          {children}
        </div>
      </div>
    </div>
  )
}
