'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { animate, useReducedMotion } from 'motion/react'

import { SPRING } from '@/constants/motion'

/** 列表里每一项挂这个属性（值 = 稳定 id），`useSpringReorder` 按它认人。 */
export const SPRING_REORDER_ATTR = 'data-reorder-id'

/**
 * 原生 HTML5 拖放排序落下之后，各项用弹簧滑到新位置（动效样片 P，owner 2026-10-08）
 * —— ⛔ 瞬间跳过去。dnd-kit 那几处走 `useSpringSortableTransition`；这一颗给没有
 * dnd-kit、靠 `draggable` + `onDrop` 重排的列表（LoRA 装配栏）。
 *
 * 做法是 FLIP：每次 `orderKey` 变了，量一遍新位置，与上一次记下的位置相减，先把
 * 元素用 transform 摆回旧位置，再用 `SPRING.slot` 放回 0。只动 transform。
 * `prefers-reduced-motion` 下直接落位。
 */
export function useSpringReorder(
  containerRef: RefObject<HTMLElement | null>,
  orderKey: string,
) {
  const reducedMotion = useReducedMotion()
  const positions = useRef(new Map<string, { x: number; y: number }>())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    // 相对容器量：两次重排之间页面滚过，⛔ 让整列一起「滑」一下。
    const origin = container.getBoundingClientRect()
    const next = new Map<string, { x: number; y: number }>()
    container
      .querySelectorAll<HTMLElement>(`[${SPRING_REORDER_ATTR}]`)
      .forEach((el) => {
        const id = el.getAttribute(SPRING_REORDER_ATTR)
        if (!id) return
        const rect = el.getBoundingClientRect()
        const at = { x: rect.left - origin.left, y: rect.top - origin.top }
        next.set(id, at)
        const before = positions.current.get(id)
        if (!before || reducedMotion) return
        const dx = before.x - at.x
        const dy = before.y - at.y
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
        animate(el, { x: [dx, 0], y: [dy, 0] }, SPRING.slot)
      })
    positions.current = next
  }, [containerRef, orderKey, reducedMotion])
}
