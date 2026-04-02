'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { HOMEPAGE_SHOWCASE } from '@/constants/homepage'

const VISIBLE_COUNT = 3
const ROTATE_INTERVAL_MS = 4000

const cardTransforms = [
  { rotate: -6, x: 0, y: 0, scale: 1 },
  { rotate: 5, x: 40, y: -20, scale: 0.92 },
  { rotate: -3, x: -32, y: 14, scale: 0.85 },
]

export function HomepageHeroVisual() {
  const shouldReduce = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (shouldReduce) return
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HOMEPAGE_SHOWCASE.length)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [shouldReduce])

  const visibleItems = Array.from({ length: VISIBLE_COUNT }, (_, i) => {
    const idx = (activeIndex + i) % HOMEPAGE_SHOWCASE.length
    return { ...HOMEPAGE_SHOWCASE[idx], stackIndex: i }
  })

  return (
    <div className="hidden md:block relative min-h-[280px]">
      <div className="relative w-full h-[280px] md:h-[380px] flex items-center justify-center">
        <AnimatePresence mode="popLayout">
          {visibleItems.map((item) => {
            const transform = cardTransforms[item.stackIndex]
            return (
              <motion.div
                key={item.id}
                className="homepage-hero-card w-[280px] md:w-[360px] rounded-2xl overflow-hidden"
                initial={{
                  opacity: 0,
                  rotate: transform.rotate + 8,
                  scale: 0.85,
                }}
                animate={{
                  opacity: 1,
                  rotate: transform.rotate,
                  x: transform.x,
                  y: transform.y,
                  scale: transform.scale,
                  zIndex: VISIBLE_COUNT - item.stackIndex,
                }}
                exit={{ opacity: 0, scale: 0.8, y: 30 }}
                transition={{
                  type: 'tween',
                  ease: 'easeOut',
                  duration: 0.6,
                  delay: item.stackIndex * 0.15,
                }}
                style={{ position: 'absolute' }}
              >
                <Image
                  src={item.src}
                  alt={`${item.model} showcase`}
                  width={320}
                  height={240}
                  className="block w-full h-auto object-cover"
                  priority={item.stackIndex === 0}
                />
                <span className="homepage-hero-label absolute bottom-3 left-3 px-[0.6rem] py-1 rounded-full text-[0.68rem] font-semibold tracking-[0.08em] uppercase text-foreground">
                  {item.model}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
