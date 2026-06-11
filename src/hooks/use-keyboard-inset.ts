'use client'

import { useEffect, useState } from 'react'

/**
 * useKeyboardInset — 软键盘在视口底部遮挡的高度（px）。
 *
 * 移动端软键盘弹起时 visualViewport 变矮，而 layout viewport 不变；
 * sticky/fixed 在底部的元素（如 .studio-dock）会被键盘盖住（审查 C1，
 * layout-shell.md 有真机记录）。消费方用 `translateY(-inset)` 把元素抬到
 * 键盘上方。无键盘 / 桌面环境恒为 0；不支持 visualViewport 的环境恒为 0。
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const occluded = window.innerHeight - viewport.height - viewport.offsetTop
      setInset(Math.max(0, Math.round(occluded)))
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [])

  return inset
}
