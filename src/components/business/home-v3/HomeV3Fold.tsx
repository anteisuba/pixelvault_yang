import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  HOME_V3_PROVIDERS,
  HOME_V3_STRIP,
  HOMEPAGE_MODEL_COUNTS,
} from '@/constants/homepage'

/**
 * The first screen, and it is exactly one viewport tall — the strip and the
 * provider marquee close it out so nothing from the next section peeks under the
 * fold (docs/references/pages/home.md §A0).
 *
 * The headline is split into two clip boxes because the load animation raises
 * each line out of its own mask; with no script the lines just sit there.
 */
export function HomeV3Fold() {
  const t = useTranslations('Homepage')

  return (
    <div className="home-v3-fold">
      <div className="home-v3-wrap">
        <div className="home-v3-hero">
          <p className="home-v3-mono" data-home-v3-hero-stat>
            {t('heroStat', {
              models: HOMEPAGE_MODEL_COUNTS.total,
              providers: HOMEPAGE_MODEL_COUNTS.providers,
              modalities: HOMEPAGE_MODEL_COUNTS.modalities,
            })}
          </p>
          <h1>
            <span className="home-v3-line">
              <span>{t('heroLine1')}</span>
            </span>
            <span className="home-v3-line">
              <span>{t('heroLine2')}</span>
            </span>
          </h1>
        </div>

        <div className="home-v3-strip" data-home-v3-strip>
          {HOME_V3_STRIP.map((shot, index) => (
            <figure key={shot.id}>
              <Image
                src={shot.src}
                alt=""
                width={300}
                height={400}
                sizes="(min-width: 1100px) 10vw, (min-width: 761px) 12vw, 24vw"
                priority={index < 4}
              />
            </figure>
          ))}
        </div>
      </div>

      <div className="home-v3-marquee">
        {/* duplicated once so the -50% translate loops seamlessly */}
        <div className="home-v3-marquee-track">
          {[...HOME_V3_PROVIDERS, ...HOME_V3_PROVIDERS].map((name, index) => (
            <span key={`${name}-${index}`}>{name}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
