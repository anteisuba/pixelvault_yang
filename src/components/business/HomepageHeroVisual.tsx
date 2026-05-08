'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { HOMEPAGE_SHOWCASE } from '@/constants/homepage'

const tileClassNames = [
  'row-span-2',
  'row-span-1',
  'row-span-2',
  'row-span-1',
  'row-span-2',
  'row-span-1',
]

export function HomepageHeroVisual() {
  const shouldReduce = useReducedMotion()
  const t = useTranslations('Homepage')

  return (
    <div className="homepage-hero-media relative">
      <div className="homepage-media-mosaic grid grid-cols-3 gap-0 overflow-hidden rounded-[2rem]">
        {HOMEPAGE_SHOWCASE.map((item, index) => (
          <motion.figure
            key={item.id}
            className={`homepage-media-tile relative min-h-40 overflow-hidden ${tileClassNames[index]}`}
            initial={shouldReduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.06, ease: 'easeOut' }}
          >
            <Image
              src={item.src}
              alt={`${item.model} ${t('stage.label')}`}
              width={420}
              height={560}
              className="h-full w-full object-cover"
              priority={index < 2}
            />
            <figcaption className="absolute inset-x-3 bottom-3 rounded-full bg-background/84 px-3 py-1.5 font-display text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-foreground backdrop-blur">
              {item.model}
            </figcaption>
          </motion.figure>
        ))}
      </div>

      <div className="homepage-hero-dock rounded-full px-4 py-3">
        <span>{t('stage.savedLabel')}</span>
        <span>{t('stage.value')}</span>
      </div>
    </div>
  )
}
