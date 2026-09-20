import '@/app/home-v4.css'
import '@/app/auth.css'

import { useLocale } from 'next-intl'

import type { HomeV4ShowcaseShot } from '@/constants/homepage-v4'
import { AuthDialogProvider } from '@/components/business/auth/AuthDialog'

import { HomeV4Deck } from './HomeV4Deck'

/**
 * v5 marketing home（长卷 + 钉住演示）。Domain contract:
 * `docs/references/pages/home.md`.
 *
 * A server component on purpose — the deck under it is the only client
 * boundary, so the headline, the model names and the whole section list are in
 * the first HTML response and the page stays edge-cacheable. ⭐ 长卷把这条
 * 拉得更紧了：scrub 未挂载时每段的进度是 `REST_PROGRESS`（结果态），所以首个
 * HTML 里六段演示画的是**做完的样子**，没有 JS 的访客看到的是内容。
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
      <div className="home-v4" data-locale={locale}>
        <HomeV4Deck locale={locale} shots={shots} />
      </div>
    </AuthDialogProvider>
  )
}
