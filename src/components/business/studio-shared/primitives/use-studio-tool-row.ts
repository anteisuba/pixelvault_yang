'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * 台上输入框工具行「放得下就带字，放不下才收成图标」（owner 2026-11-04：四个台一条
 * 规则）。以前是每台写死一个容器门槛（自然语言台 56rem、标签台 72rem），同样宽的
 * 输入框一个带字一个只剩图标；现在量这一行自己：带字的总宽 > 行宽 才收。
 *
 * 用法：宿主把 `ref` 挂在工具行上、`data-compact={compact || undefined}`，行上带
 * `group/toolrow`；药丸照旧用 `studioOutlineChipCompactClass` /
 * `studioOutlineChipCompactLabelClass`（它们认的就是这一行的 `data-compact`）。
 *
 * ⚠ 收起后量到的是图标宽，再展开要知道「带字比收起宽多少」：收起那一刻记下带字宽，
 *   下一次量（已经是收起态）算出差值，之后一直用「现宽 + 差值」判能不能展开 ——
 *   模型药丸换了名字这类变化照样跟得上，⛔ 不会来回闪。
 * ⚠ 隐藏标签页里 ResizeObserver 不投递，首次判定在 layout effect 里同步做，不靠它。
 */
export function useStudioToolRow<T extends HTMLElement = HTMLDivElement>() {
  const [row, setRow] = useState<T | null>(null)
  const [compact, setCompact] = useState(false)
  /** 刚收起时记下的带字宽；下一次量完换算成差值后清空。 */
  const pendingFullRef = useRef<number | null>(null)
  /** 带字比收起宽多少。 */
  const labelDeltaRef = useRef(0)

  const ref = useCallback((node: T | null) => setRow(node), [])

  useLayoutEffect(() => {
    if (!row) return
    const check = () => {
      const available = row.clientWidth
      if (available === 0) return
      const width = contentWidth(row)
      if (!row.hasAttribute('data-compact')) {
        if (width > available + 1) {
          pendingFullRef.current = width
          setCompact(true)
        }
        return
      }
      if (pendingFullRef.current !== null) {
        labelDeltaRef.current = Math.max(0, pendingFullRef.current - width)
        pendingFullRef.current = null
      }
      if (width + labelDeltaRef.current <= available) setCompact(false)
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(row)
    for (const child of Array.from(row.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [row, compact])

  return { ref, compact }
}

/**
 * 一行里各块的天然宽之和（加上块间距）。⚠ 块可能是 `min-w-0` 的组（LoRA 台左半边）：
 * 放不下时被压窄、内容溢出，盒子宽 < 内容宽 —— 取 `scrollWidth` 兜住，⛔ 只量盒子会
 * 永远判成「放得下」。
 */
function contentWidth(row: HTMLElement): number {
  const children = Array.from(row.children) as HTMLElement[]
  // ⚠ 按「在不在排版里」筛，不按宽：空着的提示字宽 0 照样占一道间距。
  const visible = children.filter((child) => child.getClientRects().length > 0)
  const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
  const sum = visible.reduce(
    (total, child) =>
      total + Math.max(child.getBoundingClientRect().width, child.scrollWidth),
    0,
  )
  return sum + gap * Math.max(0, visible.length - 1)
}
