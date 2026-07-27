import '@/app/home-v3.css'

import { useLocale } from 'next-intl'

import { HomeV3Capabilities } from './HomeV3Capabilities'
import { HomeV3Fold } from './HomeV3Fold'
import { HomeV3Footer } from './HomeV3Footer'
import { HomeV3Header } from './HomeV3Header'
import { HomeV3Motion } from './HomeV3Motion'
import { HomeV3Product } from './HomeV3Product'
import { HomeV3Rails } from './HomeV3Rails'

/**
 * v3 marketing home. Baseline: docs/references/pages/home.md §A.
 *
 * Order is fixed by §A1: one-viewport first screen → the product shown framed →
 * the pinned capability stage → the model rails → black footer.
 *
 * Everything above is a server component and renders complete on its own;
 * `HomeV3Motion` is the only client boundary and adds nothing but motion.
 *
 * `data-locale` is what picks the CJK face. It used to read `<html lang>`, but
 * that attribute is written by the root layout and a root layout never
 * re-renders on client navigation — so switching to Japanese in the header left
 * the page drawing Japanese with Noto Sans SC. This element re-renders with the
 * locale segment, so keying off it is correct with no script at all.
 */
export function HomeV3Shell() {
  const locale = useLocale()

  return (
    <div className="home-v3" data-locale={locale}>
      <HomeV3Header />
      <div className="home-v3-page">
        <HomeV3Fold />
        <HomeV3Product />
        <HomeV3Capabilities />
        <HomeV3Rails />
      </div>
      <HomeV3Footer />
      <HomeV3Motion />
    </div>
  )
}
