'use client'

import { useEffect, useState } from 'react'

/** 滚过这么深才开始收（顶上那一截总是看得见底栏 / 顶栏）。 */
const SCROLL_AWAY_AFTER_PX = 80
/** 一帧里动了这么多才算换了方向（手指抖一下不算）。 */
const SCROLL_AWAY_DELTA_PX = 8
/** 一帧里跳了这么远的是程序在滚（换页回到原位、回顶部）：⛔ 当成手指往下滑。 */
const SCROLL_JUMP_PX = 240

/**
 * 手机上窗口「往下滑收起、往上滑回来」（底栏与吸顶栏同一个判据，owner 2026-10-15 手机操作
 * 习惯清单）。滚的是窗口的页面（画廊、主页、设置、角色）用它；自己有滚动容器的页（素材）
 * 照旧用 `useHideMobileTabBar` 自己报。
 */
export function useWindowScrollAway(enabled = true): boolean {
  const [away, setAway] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let last = window.scrollY
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const dy = y - last
        if (y < SCROLL_AWAY_AFTER_PX || Math.abs(dy) > SCROLL_JUMP_PX) {
          setAway(false)
          last = y
          return
        }
        if (Math.abs(dy) < SCROLL_AWAY_DELTA_PX) return
        setAway(dy > 0)
        last = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [enabled])

  return enabled && away
}
