import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import {
  HOMEPAGE_MODEL_COUNT_VALUES,
  HOMEPAGE_SHOWCASE,
} from '@/constants/homepage'
import { AuthModalTrigger } from '@/components/business/AuthModalTrigger'

// Four results filling the panel's right side so the CTA doesn't sit against
// dead space — a small "your archive" cluster, disjoint from the hero wall.
const BOTTOM_CTA_THUMBS = HOMEPAGE_SHOWCASE.slice(4, 8)

export function HomepageBottomCta() {
  const t = useTranslations('Homepage.bottomCta')

  return (
    <div className="homepage-bottom-cta-bleed">
      <section
        data-homepage-reveal
        className="homepage-bottom-cta relative overflow-hidden rounded-2xl px-8 py-14 sm:px-14 sm:py-20"
        aria-labelledby="homepage-bottom-cta-title"
      >
        <div className="homepage-bottom-cta-content">
          <div className="flex flex-col items-start text-left">
            <h2
              id="homepage-bottom-cta-title"
              className="homepage-feature-title font-display font-bold text-foreground text-balance"
            >
              {t('title')}
            </h2>
            <p className="homepage-feature-copy mt-6 max-w-xl font-display font-medium text-[var(--home-muted)] text-balance">
              {t('description', HOMEPAGE_MODEL_COUNT_VALUES)}
            </p>
            <AuthModalTrigger intent="sign-up" asChild>
              <Button
                size="lg"
                className="homepage-primary-btn mt-9 h-14 rounded-full px-8 text-base font-semibold"
              >
                {t('primary')}
              </Button>
            </AuthModalTrigger>
          </div>

          <div className="homepage-bottom-cta-gallery" aria-hidden="true">
            {BOTTOM_CTA_THUMBS.map((shot) => (
              <div key={shot.id} className="homepage-bottom-cta-thumb">
                <Image
                  src={shot.src}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 16vw, 40vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
