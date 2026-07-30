import type { ComponentType } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HomeV3VideoPlayer } from '@/components/business/home-v3/HomeV3VideoPlayer'
import { ModelViewer } from '@/components/business/ModelViewer'
import {
  HOME_V3_CAPS,
  HOME_V3_STUDIO_SHEET,
  HOME_V3_TURNTABLE,
  HOME_V3_VIDEO_DEMO,
  type HomeV3Cap,
} from '@/constants/home-v3'

/**
 * The same four answers the studio view shows, so the two surfaces tell one
 * story: one prompt, four models, one picked.
 *
 * The prototype indexed a 14-long pool with a 10-long one here and silently
 * collapsed two of the four onto the same picture — which would have shown the
 * row's "four models answer at once" claim as two identical images.
 */
function HomeV3DemoFan() {
  const t = useTranslations('Homepage.studioView')

  return (
    <div className="home-v3-demo">
      <div className="home-v3-demo-bar">
        <span>{t('barPrompt')}</span>
        <b>{t('barDone')}</b>
      </div>
      <div className="home-v3-fan">
        {HOME_V3_STUDIO_SHEET.map((cell) => (
          <figure
            key={cell.model}
            data-picked={'picked' in cell ? cell.picked : undefined}
          >
            <Image src={cell.shot} alt="" width={300} height={400} />
            <figcaption>{cell.model}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function HomeV3DemoVideo() {
  const t = useTranslations('Homepage.videoDemo')

  return (
    <div className="home-v3-demo">
      <div className="home-v3-demo-bar">
        <span>{t('bar')}</span>
        <b>{HOME_V3_VIDEO_DEMO.spec}</b>
      </div>
      <HomeV3VideoPlayer />
    </div>
  )
}

function HomeV3DemoTurntable() {
  const t = useTranslations('Homepage.turntableDemo')

  return (
    <div className="home-v3-demo">
      <div className="home-v3-demo-bar">
        <span>{t('bar')}</span>
        <b>{HOME_V3_TURNTABLE.spec}</b>
      </div>
      <div className="home-v3-turn">
        <ModelViewer
          src={HOME_V3_TURNTABLE.model}
          poster={HOME_V3_TURNTABLE.shot}
          alt={HOME_V3_TURNTABLE.alt}
          autoRotate
          cameraControls
          ar={false}
          className="home-v3-turn-model"
        />
      </div>
    </div>
  )
}

const DEMO: Record<HomeV3Cap['demo'], ComponentType> = {
  fan: HomeV3DemoFan,
  video: HomeV3DemoVideo,
  turntable: HomeV3DemoTurntable,
}

/**
 * Three capabilities, one row each: text on the left, a working demo on the
 * right (docs/references/pages/home.md §A1).
 *
 * What ships in the markup is three stacked rows, which is a complete and
 * readable section on its own. The motion module adds `.is-pinned` to collapse
 * them onto one stage that swaps under scroll — so if the script never runs, the
 * page degrades to something correct rather than to three slides on top of each
 * other.
 */
export function HomeV3Capabilities() {
  const t = useTranslations('Homepage.caps')

  return (
    <div className="home-v3-wrap">
      <section className="home-v3-capstage" data-home-v3-capstage>
        <div className="home-v3-capwrap">
          {HOME_V3_CAPS.map((cap) => {
            const Demo = DEMO[cap.demo]
            return (
              <div className="home-v3-cap-row" key={cap.id} data-home-v3-cap>
                <div className="home-v3-cap-text">
                  <p className="home-v3-mono">{t(`${cap.id}.eyebrow`)}</p>
                  <h2>
                    {t(`${cap.id}.titleA`)}
                    <br />
                    {t(`${cap.id}.titleB`)}
                  </h2>
                  <p>{t(`${cap.id}.body`)}</p>
                  <ul>
                    {cap.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                    {'moreCount' in cap ? (
                      <li>{t('moreModels', { count: cap.moreCount })}</li>
                    ) : null}
                  </ul>
                </div>
                <Demo />
              </div>
            )
          })}

          <div className="home-v3-capsteps" aria-hidden="true">
            {HOME_V3_CAPS.map((cap, index) => (
              <i key={cap.id} data-active={index === 0 ? true : undefined} />
            ))}
            <em data-home-v3-capcount>
              {`01 / ${String(HOME_V3_CAPS.length).padStart(2, '0')}`}
            </em>
          </div>
        </div>
      </section>
    </div>
  )
}
