'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { HOMEPAGE_SHOWCASE } from '@/constants/homepage'

import styles from './HomepageShell.module.css'

const VISIBLE_COUNT = 3
const ROTATE_INTERVAL_MS = 4000

const cardTransforms = [
  { rotate: -3, x: 0, y: 0, scale: 1 },
  { rotate: 2, x: 20, y: -12, scale: 0.95 },
  { rotate: -1.5, x: -16, y: 8, scale: 0.9 },
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
    <div className={styles.heroVisual}>
      <div className={styles.heroCardFan}>
        <AnimatePresence mode="popLayout">
          {visibleItems.map((item) => {
            const transform = cardTransforms[item.stackIndex]
            return (
              <motion.div
                key={item.id}
                className={styles.heroShowcaseCard}
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
                  className={styles.heroShowcaseImage}
                  priority={item.stackIndex === 0}
                />
                <span className={styles.heroShowcaseLabel}>{item.model}</span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
