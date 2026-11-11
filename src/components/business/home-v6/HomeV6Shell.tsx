import '@/app/home-v6.css'
import '@/app/auth.css'

import { useLocale, useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { HOME_V6_VOICE_LINES, type HomeV6Seg } from '@/constants/homepage-v6'
import type { HomeV4ShowcaseShot } from '@/constants/homepage-v4'
import { Link } from '@/i18n/navigation'
import type { HomeV6StageCopy } from '@/lib/home-v6/stage-engine'
import { AuthDialogProvider } from '@/components/business/auth/AuthDialog'
import { HomeV4Topbar } from '@/components/business/home-v4/HomeV4Topbar'

import { HomeV6Lineup, type HomeV6LineupCopy } from './HomeV6Lineup'
import { HomeV6Stage, type HomeV6StageText } from './HomeV6Stage'

/** `Homepage.v6` 的形状（`t.raw` 取出来，模板占位符 `{n}` 由引擎自己填，不走 ICU）。 */
interface HomeV6Messages extends Omit<HomeV6StageCopy, 'voices' | 'lines'> {
  headline: [string, string]
  hint: string
  me: string[]
  sys: string
  lines: Record<HomeV6Seg, [string, string]>
  lineup: HomeV6LineupCopy
  footer: {
    worksTitle: string
    works: string
    aiTitle: string
    ai: string
    namesTitle: string
    names: string
    nav: string
    guidelines: string
  }
}

interface HomeV6ShellProps {
  /** 作品墙：公开画廊里最新的公开作品，页面在服务端取好传进来。 */
  shots?: readonly HomeV4ShowcaseShot[]
}

/**
 * 首页 v6「她 + 一个窗口」。施工图：`docs/references/pages/home.md` §v6。
 *
 * 服务端组件：大标题、你说的话、名单、页脚都在首个 HTML 里；舞台（`HomeV6Stage`）
 * 和名单（`HomeV6Lineup`）各是一个客户端边界。顶栏沿用 v4 那条浮岛。
 */
export function HomeV6Shell({ shots = [] }: HomeV6ShellProps) {
  const locale = useLocale()
  const t = useTranslations('Homepage')
  const tLegal = useTranslations('Legal')
  const m = t.raw('v6') as HomeV6Messages
  const lang = locale === 'ja' || locale === 'en' ? locale : 'zh'

  const text: HomeV6StageText = {
    headline: m.headline,
    hint: m.hint,
    me: m.me,
    sys: m.sys,
  }
  const copy: HomeV6StageCopy = {
    wallAlt: m.wallAlt,
    shotAlt: m.shotAlt,
    loraStyles: m.loraStyles,
    loraAlt: m.loraAlt,
    voices: {
      qing: HOME_V6_VOICE_LINES.qing[lang],
      lei: HOME_V6_VOICE_LINES.lei[lang],
      ke: HOME_V6_VOICE_LINES.ke[lang],
    },
    play: m.play,
    stop: m.stop,
    lines: m.lines,
    canvas: m.canvas,
    char: m.char,
  }
  const wall = shots.map(({ src, w, h }) => ({ src, w, h }))
  const f = m.footer

  return (
    <AuthDialogProvider>
      <div className="home-v6" data-locale={locale}>
        <HomeV4Topbar />
        <main>
          <HomeV6Stage text={text} copy={copy} shots={wall} locale={lang} />
          <HomeV6Lineup copy={m.lineup} locale={lang} />
          <footer className="foot">
            <div className="side">
              <div className="mark">ANTEI</div>
              <p className="muted">© 2026 ANTEI</p>
            </div>
            <div className="main">
              <div className="notes">
                <div>
                  <h3>{f.worksTitle}</h3>
                  <p>{f.works}</p>
                </div>
                <div>
                  <h3>{f.aiTitle}</h3>
                  <p>{f.ai}</p>
                </div>
                <div>
                  <h3>{f.namesTitle}</h3>
                  <p>{f.names}</p>
                </div>
              </div>
              <nav className="row" aria-label={f.nav}>
                <Link href={ROUTES.TERMS}>{tLegal('terms.title')}</Link>
                <Link href={ROUTES.PRIVACY}>{tLegal('privacy.title')}</Link>
                <Link href={ROUTES.GUIDELINES}>{f.guidelines}</Link>
              </nav>
            </div>
          </footer>
        </main>
      </div>
    </AuthDialogProvider>
  )
}
