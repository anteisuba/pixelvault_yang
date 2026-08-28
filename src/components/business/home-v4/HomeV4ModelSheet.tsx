'use client'

import { createPortal } from 'react-dom'

import { useTranslations } from 'next-intl'

import type { HomeV4Model } from '@/constants/homepage-v4'
import { useHomeV4ScrollIsolation } from '@/hooks/use-home-v4-scroll-isolation'

import { HomeV4ModelStrip } from './HomeV4ModelStrip'

interface HomeV4ModelSheetProps {
  /** The model whose detail is open, or `null` for closed. */
  model: HomeV4Model | null
  /** Locale segment — the portal is outside the shell, so it re-declares it. */
  locale: string
  onClose: () => void
}

/**
 * 详情 · 强弱与规格 — the mobile pull-up sheet, rendered into `<body>`.
 *
 * **Why a portal.** A `.vp` page is transformed and carries `will-change`, which
 * makes it a containing block: a `position: fixed` sheet rendered inside one
 * would be fixed *to the page*, not the viewport, and would sit under the page
 * veil and the station's `.hnav`. The SPEC solved this by moving the DOM node to
 * `<body>` at click time. `createPortal` is the same escape, minus the
 * hand-written re-parenting — and here the sheet renders its own copy of the
 * strip off the same record rather than stealing the desktop node.
 *
 * The wrapper re-declares `.home-v4` and `data-locale` because everything the
 * skin gives (`--paper`, `--ink`, `--mono`, the CJK face) is scoped to the
 * domain root, and the portal lands outside it.
 *
 * Closing is the deck's business, not this component's: it also has to close on
 * a page turn, a station turn and Escape, and one owner for that is why the open
 * model lives up there.
 */
export function HomeV4ModelSheet({
  model,
  locale,
  onClose,
}: HomeV4ModelSheetProps) {
  const t = useTranslations('Homepage')
  const isolate = useHomeV4ScrollIsolation<HTMLDivElement>()

  /* Nothing is open on the server, so this never runs during SSR — the guard is
     for a would-be caller that renders one open, not for the current one. */
  if (model === null || typeof document === 'undefined') return null

  return createPortal(
    <div className="home-v4 msheet" data-locale={locale}>
      <button
        type="button"
        className="msheet-veil"
        aria-label={t('v4.modelPage.close')}
        onClick={onClose}
      />
      <div className="msheet-body" ref={isolate}>
        <HomeV4ModelStrip model={model} asSheet />
      </div>
    </div>,
    document.body,
  )
}
