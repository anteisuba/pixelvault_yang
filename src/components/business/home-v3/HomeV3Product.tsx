import { useTranslations } from 'next-intl'

import {
  HOME_V3_TOOL_GLYPHS,
  HOME_V3_VIEWS,
  type HomeV3View,
} from '@/constants/home-v3'

import { HomeV3ViewAssets } from './HomeV3ViewAssets'
import { HomeV3ViewCanvas } from './HomeV3ViewCanvas'
import { HomeV3ViewLora } from './HomeV3ViewLora'
import { HomeV3ViewStudio } from './HomeV3ViewStudio'

/** Which tool glyph reads as active in each view. */
const ACTIVE_TOOL: Record<HomeV3View, number> = {
  canvas: 0,
  studio: 1,
  lora: 2,
  assets: -1,
}

function HomeV3ToolRail({ active }: { active: number }) {
  return (
    <div className="home-v3-toolrail" aria-hidden="true">
      {HOME_V3_TOOL_GLYPHS.map((glyph, index) => (
        <span key={glyph} data-active={index === active ? true : undefined}>
          {glyph}
        </span>
      ))}
    </div>
  )
}

/**
 * The product, framed — the page's second screen shows the real surfaces rather
 * than a marketing illustration (docs/references/pages/home.md §A1).
 *
 * Four views ride one rail that slides; the tabs are radio inputs so switching
 * works with no JS at all, and `.home-v3-views` holds a fixed aspect ratio so
 * the frame never changes height between views.
 *
 * The gutter comes from a wrapping `.home-v3-wrap` rather than a second class on
 * `.home-v3-product`: both set the `padding` shorthand, so sharing an element
 * would let whichever rule comes later silently drop the other's side.
 */
export function HomeV3Product() {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <div className="home-v3-wrap">
      <section className="home-v3-product">
        <div className="home-v3-app">
          {HOME_V3_VIEWS.map((view) => (
            <input
              className="home-v3-view-switch"
              type="radio"
              name="home-v3-view"
              id={`home-v3-view-${view}`}
              key={view}
              defaultChecked={view === 'canvas'}
            />
          ))}

          <div className="home-v3-appbar">
            <span className="home-v3-appbar-brand">{tCommon('brand')}</span>

            <div className="home-v3-tabs">
              {HOME_V3_VIEWS.map((view) => (
                <label htmlFor={`home-v3-view-${view}`} key={view}>
                  {t(`views.${view}`)}
                </label>
              ))}
            </div>

            <span className="home-v3-appbar-spacer" />

            {HOME_V3_VIEWS.map((view) => (
              <span className="home-v3-chipset" data-chipset={view} key={view}>
                <span className="home-v3-chip">
                  {t(`viewBars.${view}.project`)}
                </span>
                <span className="home-v3-chip home-v3-chip--live">
                  <b />
                  {t(`viewBars.${view}.status`)}
                </span>
              </span>
            ))}
          </div>

          <div className="home-v3-views">
            <div className="home-v3-view-rail">
              <div className="home-v3-view">
                <HomeV3ToolRail active={ACTIVE_TOOL.canvas} />
                <HomeV3ViewCanvas />
              </div>
              <div className="home-v3-view">
                <HomeV3ToolRail active={ACTIVE_TOOL.studio} />
                <HomeV3ViewStudio />
              </div>
              <div className="home-v3-view">
                <HomeV3ToolRail active={ACTIVE_TOOL.lora} />
                <HomeV3ViewLora />
              </div>
              <div className="home-v3-view">
                <HomeV3ViewAssets />
              </div>
            </div>
          </div>
        </div>

        <div className="home-v3-caption">
          <span>{t('frameCaption.promise')}</span>
          <span>{t('frameCaption.hint')}</span>
        </div>
      </section>
    </div>
  )
}
