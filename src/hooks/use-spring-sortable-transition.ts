'use client'

import { useReducedMotion } from 'motion/react'

import { SORTABLE_SPRING } from '@/constants/motion'

/**
 * dnd-kit 排序里「别的项让位」那一下（动效样片 P，owner 2026-10-08）：交给
 * `useSortable({ transition })`，让位从脊柱线性档换成 `spring-slot` 弹簧（CSS
 * `linear()` 近似，只一丝过冲）。`prefers-reduced-motion` 下返回 `null` = 不过渡，
 * 直接落位。⛔ 调用方各写一份 `{ duration, easing }`。
 */
export function useSpringSortableTransition() {
  const reducedMotion = useReducedMotion()
  return reducedMotion ? null : SORTABLE_SPRING
}
