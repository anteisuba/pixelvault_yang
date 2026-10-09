'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { animate, useReducedMotion } from 'motion/react'

import { SPRING } from '@/constants/motion'

/** 列表里每一项挂这个属性（值 = 稳定 id），`useSpringReorder` 按它认人。 */
export const SPRING_REORDER_ATTR = 'data-reorder-id'

/** 元素此刻身上的平移（弹簧走到一半时还没归零的那一截）；读不到就当 0。 */
function currentTranslate(el: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(el).transform
  const match = transform?.match(/^matrix\(([^)]+)\)$/)
  if (!match) return { x: 0, y: 0 }
  const parts = match[1].split(',').map(Number)
  return { x: parts[4] || 0, y: parts[5] || 0 }
}

/**
 * 原生 HTML5 拖放排序：拖着时其余项用弹簧让位、落下滑到新位置（动效样片 P，owner
 * 2026-10-08）—— ⛔ 瞬间跳过去。dnd-kit 那几处走 `useSpringSortableTransition`；这一颗给
 * 没有 dnd-kit、靠 `draggable` 重排的列表（LoRA 装配栏：拖着时按预览顺序渲染，所以
 * 让位也走这里）。
 *
 * 做法是 FLIP：每次 `orderKey` 变了，量一遍新位置，与上一次记下的位置相减，先把
 * 元素用 transform 摆回旧位置，再用 `SPRING.slot` 放回 0。只动 transform。
 * ⚠ 记的是**布局**位置（扣掉身上还没走完的平移）：拖着时让位一拍接一拍，上一根弹簧
 *   没走完就被打断，从它此刻看得见的位置接着走，⛔ 先跳一下。
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
        const moving = currentTranslate(el)
        const at = {
          x: rect.left - origin.left - moving.x,
          y: rect.top - origin.top - moving.y,
        }
        next.set(id, at)
        const before = positions.current.get(id)
        if (!before || reducedMotion) return
        // 看得见的旧位置 = 上一次的布局位置 + 身上还没走完的那一截平移。
        const dx = before.x + moving.x - at.x
        const dy = before.y + moving.y - at.y
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
        animate(el, { x: [dx, 0], y: [dy, 0] }, SPRING.slot)
      })
    positions.current = next
  }, [containerRef, orderKey, reducedMotion])
}
