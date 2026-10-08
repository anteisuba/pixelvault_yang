'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'

import {
  DURATION_MS,
  EASE_STANDARD_CSS,
  RESULT_REVEAL,
} from '@/constants/motion'

/**
 * 出错块点「重试」、而且重试成功（owner 2026-10-08「提示与弹窗」第 3 题）：
 * 内容由糊变清地回来。
 *
 * 出错块是错误边界的**替身**：重试成功那一刻它被卸下，真内容在**同一个父元素**里
 * 原位长出来 —— 内容本身不归出错块管。所以出错块记住自己的父元素，卸下时（布局
 * 阶段，赶在第一帧画出来之前）让父元素从模糊放到清晰。
 *
 * ⚠ 只有点过重试再卸下才播：换路由、关掉面板时出错块也会卸下，⛔ 那时不糊。
 * ⚠ `prefers-reduced-motion` 下不播。
 */
export function useErrorRecoveryReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const retried = useRef(false)

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement ?? null
    return () => {
      if (!retried.current || !parent) return
      retried.current = false
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
        return
      parent.animate?.(
        [
          { filter: `blur(${RESULT_REVEAL.blurPx}px)`, opacity: 0.6 },
          { filter: 'blur(0px)', opacity: 1 },
        ],
        { duration: DURATION_MS.slow, easing: EASE_STANDARD_CSS },
      )
    }
  }, [])

  const markRetrying = useCallback(() => {
    retried.current = true
  }, [])
  /** 重试又失败了（出错块还在）：下一次卸下不再糊。 */
  const clearRetrying = useCallback(() => {
    retried.current = false
  }, [])

  return { ref, markRetrying, clearRetrying }
}
