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
      imageSrc: '/tutorials/xiaohei-guides/image-01-input.webp',
      key: 'input',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/image-02-settings.webp',
      key: 'settings',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/image-03-preview.webp',
      key: 'preview',
    },
  ],
  video: [
    {
      imageSrc: '/tutorials/xiaohei-guides/video-01-input.webp',
      key: 'input',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/video-02-settings.webp',
      key: 'settings',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/video-03-preview.webp',
      key: 'preview',
    },
  ],
  audio: [
    {
      imageSrc: '/tutorials/xiaohei-guides/audio-01-input.webp',
      key: 'input',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/audio-02-voice.webp',
      key: 'voice',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/audio-03-preview.webp',
      key: 'preview',
    },
  ],
  model3d: [
    {
      imageSrc: '/tutorials/xiaohei-guides/model3d-01-source.webp',
      key: 'source',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/model3d-02-settings.webp',
      key: 'settings',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/model3d-03-preview.webp',
      key: 'preview',
    },
  ],
  node: [
    {
      imageSrc: '/tutorials/xiaohei-guides/node-01-add.webp',
      key: 'add',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/node-02-connect.webp',
      key: 'connect',
    },
    {
      imageSrc: '/tutorials/xiaohei-guides/node-03-run.webp',
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
        'mx-auto w-full max-w-5xl rounded-2xl border border-border/60 bg-background/90 p-2 shadow-sm backdrop-blur sm:p-3',
        className,
      )}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-white">
        <Image
          src={activeSlide.imageSrc}
          alt={t(`${slideKey}.alt`)}
          fill
          sizes="(max-width: 768px) 92vw, (max-width: 1280px) 72vw, 64rem"
          className="object-contain"
          priority={false}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute left-3 top-1/2 size-9 -translate-y-1/2 rounded-full border border-white/15 bg-neutral-950/60 text-white shadow-sm backdrop-blur transition-colors hover:bg-neutral-950/75 hover:text-white sm:left-4 sm:size-10"
          onClick={goToPrevious}
        >
          <ChevronLeft className="size-4" />
          <span className="sr-only">{t('previous')}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-1/2 size-9 -translate-y-1/2 rounded-full border border-white/15 bg-neutral-950/60 text-white shadow-sm backdrop-blur transition-colors hover:bg-neutral-950/75 hover:text-white sm:right-4 sm:size-10"
          onClick={goToNext}
        >
          <ChevronRight className="size-4" />
          <span className="sr-only">{t('next')}</span>
        </Button>
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {slides.map((slide, index) => (
            <button
              key={slide.key}
              type="button"
              aria-label={t('goToStep', { step: index + 1 })}
              aria-current={index === activeIndex}
              onClick={() => setActiveIndex(index)}
              className={cn(
                'size-1.5 rounded-full bg-black/25 ring-1 ring-white/50 transition-colors',
                index === activeIndex && 'bg-black/70',
              )}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
