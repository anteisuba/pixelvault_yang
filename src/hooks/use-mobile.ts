import * as React from 'react'

/**
 * 紧凑布局阈值：<1024 为"移动/平板"——移动 chrome（rail/header/tabbar）+
 * 抽屉式披露；≥1024 才出桌面侧栏（docs/references/frontend.md §布局壳 C4 决议）。
 * 768–1023 平板区间此前会挂桌面侧栏并把 studio 内容裁出视口。
 * 必须与布局 chrome 的 `lg:` CSS 断点及 globals.css 的 .studio-dock
 * 媒体查询保持同一边界。
 */
export const MOBILE_BREAKPOINT = 1024

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // JSDOM (and some test runners) ship without `window.matchMedia`. Bail
    // gracefully there so components using this hook can still render in
    // unit tests — they'll just see the desktop default.
    if (typeof window.matchMedia !== 'function') {
      setIsMobile(false)
      return
    }
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}

/**
 * 手机宽阈值（< 768）。⚠ 与 `MOBILE_BREAKPOINT`（<1024 = 紧凑壳）**不是同一件事**：
 * 1024 决定「用不用移动 chrome」，768 决定「画布是不是整个换成另一种视图」
 * （node-canvas-v2 §7.x：< 768 渲染镜头带，桌面 ReactFlow 在手机上不挂载）。
 * 平板（768–1023）仍是自由画布 + 移动 chrome。
 */
export const PHONE_BREAKPOINT = 768

export function useIsPhone() {
  const [isPhone, setIsPhone] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // JSDOM 没有 matchMedia：退回桌面默认值，单测里镜头带不抢戏。
    if (typeof window.matchMedia !== 'function') {
      setIsPhone(false)
      return
    }
    const mql = window.matchMedia(`(max-width: ${PHONE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsPhone(window.innerWidth < PHONE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsPhone(window.innerWidth < PHONE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isPhone
}
