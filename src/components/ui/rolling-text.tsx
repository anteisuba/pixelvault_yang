'use client'

import { motion, useReducedMotion } from 'motion/react'

import { ROLLING_DIGIT_SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * 会滚的读数（动效样片 K）：一串字里的每一位数字是一根 0–9 的竖条，读数变了**只有变了的
 * 那几位**滚到新数字，没变的那几位目标没变、原地不动；其余字符（`:` `.` `/` 字母）照常排。
 *
 * ⚠ 位置按**从右数第几位**认：`9.9 → 10.0` 是左边多出一根，⛔ 不是整串错位一起滚。
 * ⚠ 读屏只读一份完整的字（`sr-only`），竖条全部 `aria-hidden`。
 * ⚠ 首次挂载直接停在目标上（`initial={false}`），⛔ 一进来整串从 0 滚上去。
 * ⚠ `prefers-reduced-motion` 下直接换。
 */
export function RollingText({
  text,
  className,
}: {
  readonly text: string
  readonly className?: string
}) {
  const chars = [...text]
  return (
    <span className={cn('relative inline-flex whitespace-pre', className)}>
      <span className="sr-only">{text}</span>
      {/* ⚠ `items-baseline`：flex 默认把每一位拉成整行高，竖条会从底下露出下一位。 */}
      <span aria-hidden className="inline-flex items-baseline">
        {chars.map((char, index) => {
          const key = chars.length - index
          const digit = char >= '0' && char <= '9' ? Number(char) : null
          return digit === null ? (
            <span key={`c${key}`}>{char}</span>
          ) : (
            <DigitColumn key={`d${key}`} digit={digit} />
          )
        })}
      </span>
    </span>
  )
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

function DigitColumn({ digit }: { readonly digit: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <span className="relative inline-block overflow-hidden leading-none">
      {/* 占位：给这一位定宽定高（等宽字体下每位一样宽）。 */}
      <span className="invisible">{digit}</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={reduceMotion ? { duration: 0 } : ROLLING_DIGIT_SPRING}
      >
        {DIGITS.map((value) => (
          <span key={value} className="block h-lh leading-none">
            {value}
          </span>
        ))}
      </motion.span>
    </span>
  )
}
