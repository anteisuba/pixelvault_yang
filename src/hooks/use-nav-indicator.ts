'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 应用壳导航的两块滑片（施工基准 `docs/references/pages/app-shell.md` §5.1）。
 *
 * 设计要点，改之前先读 §4.1：
 * - **整栏只有一个运动主体**。激活态不是「每项各自开关背景」，而是一块白浮片
 *   在项与项之间滑；hover 同理，是一块跟着光标滑的幽灵块。这两块都靠
 *   `transform` 移动，不动布局属性。
 * - **hover 与 active 反极性**：幽灵块往暗走、浮片往亮走。两者同向时只有
 *   1.1:1，等于把「hover 任一项都长得像当前项」这个 bug 换身浅色衣服重犯。
 * - 幽灵块划过激活项时**让位**（白浮片赢，不在它下面压一块暗的）。
 * - 触屏不触发幽灵块 —— 没有 hover 概念，留一块糊在那儿比不显示更糟。
 *
 * ⚠ 位置一律用 `getBoundingClientRect()` 相减算，不用 `offsetTop`：
 * `SidebarMenuItem` 自己是 `position: relative`，`offsetTop` 会相对 `li`
 * 而不是滚动容器，量出来是 0。
 */

export interface NavRect {
  top: number
  left: number
  width: number
  height: number
}

interface NavIndicatorState {
  /** 激活浮片。null = 还没量到（首帧别闪一块在 0,0） */
  active: NavRect | null
  /** hover 幽灵块的位置。**只增不清** —— 隐藏时保留最后位置，否则会先弹回
   *  (0,0) 再淡出。显隐看 `hoverVisible`。 */
  hover: NavRect | null
  hoverVisible: boolean
  /** true = 这次是「就位」不是「滑动」，CSS 据此关掉 transform 过渡 */
  hoverJumped: boolean
  onPointerOver: (event: React.PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  /** 收展等布局变化后手动重量一次 */
  remeasure: () => void
}

const BUTTON_SELECTOR = '[data-slot="sidebar-menu-button"]'
const ACTIVE_SELECTOR = '[data-slot="sidebar-menu-button"][data-active="true"]'

function rectWithin(scope: HTMLElement, el: HTMLElement): NavRect {
  const scopeBox = scope.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  return {
    top: box.top - scopeBox.top + scope.scrollTop,
    left: box.left - scopeBox.left,
    width: box.width,
    height: box.height,
  }
}

export function useNavIndicator(
  scopeRef: React.RefObject<HTMLElement | null>,
  /** 变了就重量一次——通常传 pathname 与收展态 */
  ...deps: unknown[]
): NavIndicatorState {
  // ⚠ ref 必须声明在写它的 useCallback 之前，否则 react-hooks/immutability 报错。
  const hoverVisibleRef = useRef(false)

  const [active, setActive] = useState<NavRect | null>(null)
  const [hover, setHover] = useState<NavRect | null>(null)
  const [hoverVisible, setHoverVisible] = useState(false)
  const [hoverJumped, setHoverJumped] = useState(true)

  const remeasure = useCallback(() => {
    const scope = scopeRef.current
    if (!scope) return
    const el = scope.querySelector<HTMLElement>(ACTIVE_SELECTOR)
    setActive(el ? rectWithin(scope, el) : null)
  }, [scopeRef])

  const onPointerOver = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // 触屏没有 hover：pointerType 是 touch/pen 时直接不进这块逻辑。
      if (event.pointerType !== 'mouse') return
      const scope = scopeRef.current
      if (!scope) return
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        BUTTON_SELECTOR,
      )
      // 激活项让位给白浮片
      if (!target || target.dataset.active === 'true') {
        hoverVisibleRef.current = false
        setHoverVisible(false)
        return
      }
      setHoverJumped(!hoverVisibleRef.current)
      hoverVisibleRef.current = true
      setHover(rectWithin(scope, target))
      setHoverVisible(true)
    },
    [scopeRef],
  )

  const onPointerLeave = useCallback(() => {
    hoverVisibleRef.current = false
    setHoverVisible(false)
  }, [])

  // 首次与依赖变化时量。用 rAF 让路由切换后的 DOM 先落定；
  // ⚠ 后台标签页会冻结 rAF，所以同步先量一次兜底。
  useEffect(() => {
    remeasure()
    const raf = requestAnimationFrame(remeasure)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remeasure, ...deps])

  // 容器尺寸变化（收展、窗口缩放、字体加载）后重量
  useEffect(() => {
    const scope = scopeRef.current
    if (!scope || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(remeasure)
    observer.observe(scope)
    return () => observer.disconnect()
  }, [scopeRef, remeasure])

  return {
    active,
    hover,
    hoverVisible,
    hoverJumped,
    onPointerOver,
    onPointerLeave,
    remeasure,
  }
}
