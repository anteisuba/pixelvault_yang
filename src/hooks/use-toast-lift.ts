'use client'

import { useEffect, type RefObject } from 'react'

import { TOAST_LIFT_GAP_PX } from '@/constants/motion'

/**
 * 底部黑条（全站 toast）浮在底部输入框之上（owner 2026-10-08「提示与弹窗」）。
 *
 * 工作台输入框卡、画布底栏这类**贴着视口底边**的东西挂上它：量自己的上沿，
 * 把 `--toast-offset-bottom` 写到 `<html>` 上，黑条就落在它上面 12px。
 * 同时挂了几样取最高的那一个；全部卸载后撤掉变量，回到 globals.css 的默认值。
 *
 * ⚠ 只写一个 CSS 变量，⛔ 不碰 sonner 的 props：Toaster 挂在主布局，
 *   与工作台不在同一棵子树里，传 props 过去要穿过整个外壳。
 */
const lifts = new Map<symbol, number>()

function applyLift() {
  const root = document.documentElement
  const highest = Math.max(0, ...lifts.values())
  if (highest > 0) {
    root.style.setProperty('--toast-offset-bottom', `${highest}px`)
  } else {
    root.style.removeProperty('--toast-offset-bottom')
  }
}

export function useToastLift(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean = true,
) {
  useEffect(() => {
    const node = ref.current
    if (!enabled || !node) return
    const key = Symbol('toast-lift')
    // `display: contents` 的包裹层没有盒子：量它里面那一件（手机固定底栏）。
    const target =
      getComputedStyle(node).display === 'contents'
        ? (node.firstElementChild as HTMLElement | null)
        : node
    if (!target) return
    const measure = () => {
      const rect = target.getBoundingClientRect()
      // 不可见（display:none / 移出视口）时不占位。
      const lift =
        rect.height > 0 && rect.top < window.innerHeight
          ? Math.round(window.innerHeight - rect.top + TOAST_LIFT_GAP_PX)
          : 0
      lifts.set(key, lift)
      applyLift()
    }
    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(target)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      lifts.delete(key)
      applyLift()
    }
  }, [ref, enabled])
}
