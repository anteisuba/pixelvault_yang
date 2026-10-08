'use client'

import { motion, useReducedMotion } from 'motion/react'

import { SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/**
 * **数字滚**（动效样片 K）—— 张数变了，变的那几位往上 / 往下滚到新值，没变的位不动。
 *
 * - 位按「从右数第几位」作 key：个位永远是同一根滚轴，进位时只多出 / 少掉最左那一位。
 * - 首次挂载直接停在当前值（⛔ 不从 0 滚上来）；`prefers-reduced-motion` 下直接换。
 * - 读屏只念整串数字：滚轴整体 `aria-hidden`，旁边一份 `sr-only` 的原值。
 */
export function RollingNumber({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const reducedMotion = useReducedMotion()
  const text = String(Math.max(0, Math.round(value)))
  const chars = text.split('')

  return (
    <span className={cn('number-roll', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="number-roll-track">
        {chars.map((char, index) => {
          const place = chars.length - index
          const digit = Number(char)
          return (
            <span key={place} className="number-roll-cell">
              <motion.span
                className="number-roll-column"
                initial={false}
                animate={{ y: `${-digit * 10}%` }}
                transition={reducedMotion ? { duration: 0 } : SPRING.slot}
              >
                {DIGITS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </motion.span>
            </span>
          )
        })}
      </span>
    </span>
  )
}
