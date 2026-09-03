'use client'

import { useEffect, useState } from 'react'

/**
 * 「这个节点已经接近视口了吗」—— 一次性开关（true 之后不再回落）。
 *
 * 用途是**推迟挂载贵重子树**（列表里的 `<video>`：每个元素一份解码器 + 媒体
 * 元素状态机），不是做进出场动画，所以不需要来回翻转：翻回 false 只会带来
 * 卸载/重挂的抖动和播放态丢失。
 *
 * 观察的节点存进 state（不是 `useRef`）：ref 回调触发的 state 更新让「元素挂
 * 载」这件事对 effect 依赖数组可见，不依赖 ref 回调与 mount effect 的先后。
 *
 * ⚠ jsdom 与老浏览器没有 `IntersectionObserver` —— 这时直接算「已接近视口」，
 * 退化成原来的行为（全部挂载），绝不因为缺 API 让整列表卡在占位态。
 */
export function useNearViewport(rootMargin: string): {
  setNode: (node: Element | null) => void
  isNearViewport: boolean
} {
  const [node, setNode] = useState<Element | null>(null)
  const [isNearViewport, setIsNearViewport] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    if (isNearViewport) return
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        setIsNearViewport(true)
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [isNearViewport, node, rootMargin])

  return { setNode, isNearViewport }
}
