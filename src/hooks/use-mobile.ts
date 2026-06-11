import * as React from 'react'

/**
 * 紧凑布局阈值：<1024 为"移动/平板"——移动 chrome（rail/header/tabbar）+
 * 抽屉式披露；≥1024 才出桌面侧栏（docs/design/direction.md C4 决议）。
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
