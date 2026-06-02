'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type XiaoheiGuideId = 'image' | 'video' | 'audio' | 'model3d' | 'node'

interface XiaoheiGuideSlide {
  imageSrc: string
  key: string
}

interface XiaoheiGuideCarouselProps {
  guideId: XiaoheiGuideId
  className?: string
}

const XIAOHEI_GUIDES: Record<XiaoheiGuideId, XiaoheiGuideSlide[]> = {
  image: [
    {
      imageSrc: '/tutorials/xiaohei-guides/image-01-input.png',
      key: 'input',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/image-02-settings.png',
      key: 'settings',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/image-03-preview.png',
      key: 'preview',
    },
  ],
  video: [
    {
      imageSrc: '/tutorials/xiaohei-guides/video-01-input.png',
      key: 'input',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/video-02-settings.png',
      key: 'settings',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/video-03-preview.png',
      key: 'preview',
    },
  ],
  audio: [
    {
      imageSrc: '/tutorials/xiaohei-guides/audio-01-input.png',
      key: 'input',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/audio-02-voice.png',
      key: 'voice',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/audio-03-preview.png',
      key: 'preview',
    },
  ],
  model3d: [
    {
      imageSrc: '/tutorials/xiaohei-guides/model3d-01-source.png',
      key: 'source',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/model3d-02-settings.png',
      key: 'settings',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/model3d-03-preview.png',
      key: 'preview',
    },
  ],
  node: [
    {
      imageSrc: '/tutorials/xiaohei-guides/node-01-add.png',
      key: 'add',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/node-02-connect.png',
      key: 'connect',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/node-03-run.png',
      key: 'run',
    },
  ],
}

export function XiaoheiGuideCarousel({
  guideId,
  className,
}: XiaoheiGuideCarouselProps) {
  const t = useTranslations('XiaoheiGuide')
  const slides = XIAOHEI_GUIDES[guideId]
  const [activeIndex, setActiveIndex] = useState(0)
  const activeSlide = slides[activeIndex]
  const slideKey = `${guideId}.slides.${activeSlide.key}`

  const goToPrevious = () => {
    setActiveIndex((index) => (index === 0 ? slides.length - 1 : index - 1))
  }

  const goToNext = () => {
    setActiveIndex((index) => (index + 1) % slides.length)
  }

  return (
    <section
      aria-label={t(`${guideId}.label`)}
      className={cn(
        'mx-auto w-full max-w-2xl rounded-2xl border border-border/60 bg-background/90 p-3 shadow-sm backdrop-blur sm:p-4',
        className,
      )}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-white">
        <Image
          src={activeSlide.imageSrc}
          alt={t(`${slideKey}.alt`)}
          fill
          sizes="(max-width: 768px) 92vw, 42rem"
          className="object-contain"
          priority={false}
        />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3 sm:mt-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {t('stepCounter', {
              current: activeIndex + 1,
              total: slides.length,
            })}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {t(`${slideKey}.title`)}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t(`${slideKey}.description`)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 rounded-full bg-background/80"
            onClick={goToPrevious}
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">{t('previous')}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 rounded-full bg-background/80"
            onClick={goToNext}
          >
            <ChevronRight className="size-4" />
            <span className="sr-only">{t('next')}</span>
          </Button>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-1.5">
        {slides.map((slide, index) => (
          <button
            key={slide.key}
            type="button"
            aria-label={t('goToStep', { step: index + 1 })}
            aria-current={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            className={cn(
              'size-1.5 rounded-full bg-muted-foreground/30 transition-colors',
              index === activeIndex && 'bg-foreground',
            )}
          />
        ))}
      </div>
    </section>
  )
}
