'use client'

import { type ReactNode } from 'react'
import { motion, useReducedMotion, type Transition } from 'motion/react'

const TWEEN_BASE: Transition = {
  type: 'tween',
  ease: 'easeOut',
}

type Direction = 'up' | 'left' | 'right'

const directionOffset: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 24 },
  left: { x: -24 },
  right: { x: 24 },
}

interface MotionRevealProps {
  children: ReactNode
  delay?: number
  duration?: number
  direction?: Direction
  className?: string
}

export function MotionReveal({
  children,
  delay = 0,
  duration = 0.5,
  direction = 'up',
  className,
}: MotionRevealProps) {
  const shouldReduce = useReducedMotion()

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  const offset = directionOffset[direction]

  return (
    <motion.div
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ ...TWEEN_BASE, duration, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface MotionStaggerProps {
  children: ReactNode
  staggerMs?: number
  duration?: number
  direction?: Direction
  className?: string
}

export function MotionStagger({
  children,
  staggerMs = 100,
  duration = 0.5,
  direction = 'up',
  className,
}: MotionStaggerProps) {
  const shouldReduce = useReducedMotion()
  const offset = directionOffset[direction]
  const staggerSec = staggerMs / 1000

  if (shouldReduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={{
        visible: {
          transition: {
            staggerChildren: staggerSec,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface MotionStaggerItemProps {
  children: ReactNode
  duration?: number
  direction?: Direction
  className?: string
}

export function MotionStaggerItem({
  children,
  duration = 0.5,
  direction = 'up',
  className,
}: MotionStaggerItemProps) {
  const offset = directionOffset[direction]

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, ...offset },
        visible: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: { ...TWEEN_BASE, duration },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
