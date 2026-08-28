import type { ReactNode } from 'react'

interface HomeV4FnFrameProps {
  /** Mono kicker, e.g. `01 · IMAGE`. Language-neutral, comes from the deck. */
  eyebrow: string
  /** The one line the page is about. */
  title: string
  /**
   * True on page 01, the only stage that stacks two blocks (the workbench over
   * the model chips) instead of centring a single one.
   */
  column?: boolean
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
 * The layer classes are the load-bearing part: `l2` on the text, `l3` on the
 * visual block, so the two arrive at different speeds when the page turns.
 * ⚠ Anything carrying a layer class has its `transform` written by the parallax
 * rules — never centre such an element with `translate`.
 */
export function HomeV4FnFrame({
  eyebrow,
  title,
  column = false,
  children,
}: HomeV4FnFrameProps) {
  return (
    <div className="page-inner">
      <div className="fg imgfn">
        <div className="fn-head l2">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className={`fn-stage l3${column ? ' col' : ''}`}>{children}</div>
      </div>
    </div>
  )
}
