'use client'

import { useEffect, useRef, useState } from 'react'
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react'

import { ROLLING_DIGIT_SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * 11 格无缝循环带（0–9 + 顶部/尾部衔接用 '0'）：
 * 配合 `((pos % 10) + 10) % 10` 模映射，9→10 永远向前顺滑进位（不倒转 9 格），
 * 10→9 永远向后顺滑退位，弹簧微过冲也不会露出空白。
 */
const ODOMETER_STRIP = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '0',
] as const

const STRIP_LEN = ODOMETER_STRIP.length
const MAX_MOTION_BLUR_PX = 2.4
const VELOCITY_BLUR_GAIN = 0.14
const BLUR_REST_THRESHOLD_PX = 0.15

function OdometerDigit({
  digit,
  direction,
  reducedMotion,
}: {
  digit: number
  direction: 1 | -1 | 0
  reducedMotion: boolean
}) {
  const targetRef = useRef(digit)
  const springPos = useSpring(digit, ROLLING_DIGIT_SPRING)
  const velocity = useVelocity(springPos)

  useEffect(() => {
    const prevTarget = targetRef.current
    const prevMod = ((Math.round(prevTarget) % 10) + 10) % 10
    if (prevMod === digit) return

    let step: number
    if (direction > 0) {
      step = (digit - prevMod + 10) % 10
    } else if (direction < 0) {
      step = -((prevMod - digit + 10) % 10)
    } else {
      const raw = digit - prevMod
      step = raw > 5 ? raw - 10 : raw < -5 ? raw + 10 : raw
    }

    const nextTarget = prevTarget + step
    targetRef.current = nextTarget

    if (reducedMotion) {
      springPos.jump(nextTarget)
    } else {
      springPos.set(nextTarget)
    }
  }, [digit, direction, reducedMotion, springPos])

  const y = useTransform(springPos, (pos) => {
    const mod = ((pos % 10) + 10) % 10
    return `${-(mod / STRIP_LEN) * 100}%`
  })

  const filter = useTransform(velocity, (vel) => {
    if (reducedMotion) return 'none'
    const px = Math.min(MAX_MOTION_BLUR_PX, Math.abs(vel) * VELOCITY_BLUR_GAIN)
    return px > BLUR_REST_THRESHOLD_PX ? `blur(${px.toFixed(2)}px)` : 'none'
  })

  return (
    <span className="number-roll-cell">
      <motion.span className="number-roll-column" style={{ y, filter }}>
        {ODOMETER_STRIP.map((d, index) => (
          <span key={index}>{d}</span>
        ))}
      </motion.span>
    </span>
  )
}

/**
 * **数字滚**（动效样片 K + 机械里程表进位与速度动态模糊）——
 * 张数变了，变的那几位按增减方向顺滑滚到新值，9→10 向前进位不倒车，
 * 高速滚动时叠加轻微动态模糊、静止归零以保持清晰度。
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
  const reducedMotion = Boolean(useReducedMotion())
  const normalized = Math.max(0, Math.round(value))
  const [prevValue, setPrevValue] = useState(normalized)
  const [direction, setDirection] = useState<1 | -1 | 0>(0)

  if (normalized !== prevValue) {
    setDirection(normalized > prevValue ? 1 : -1)
    setPrevValue(normalized)
  }

  const text = String(normalized)
  const chars = text.split('')

  return (
    <span className={cn('number-roll', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="number-roll-track">
        {chars.map((char, index) => {
          const place = chars.length - index
          const digit = Number(char)
          return (
            <OdometerDigit
              key={place}
              digit={digit}
              direction={direction}
              reducedMotion={reducedMotion}
            />
          )
        })}
      </span>
    </span>
  )
}
