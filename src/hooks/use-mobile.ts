import * as React from 'react'

/**
 * 紧凑布局阈值：<768 为「手机」——移动 chrome（顶栏 / 抽屉 / 底部条）+ 抽屉式披露；
 * ≥768 出桌面壳（左侧栏）。owner 2026-10-09 平板 v10：平板 = 缩小版电脑，
 * 所以平板（768–1023）走桌面壳，只是侧栏钉死在收起档、助手改成盖上来（见 `useIsTablet`）。
 * 必须与布局 chrome 的 `lg:` 断点（`globals.css` 把 `--breakpoint-lg` 挪到 48rem）
 * 及各 CSS 文件里 767.98 / 768 那几条媒体查询保持同一边界。
 * 这个数同时决定画布是不是整个换成镜头带（node-canvas-v2 §7.x：< 768 渲染镜头带，
 * 桌面 ReactFlow 在手机上不挂载）。
 */
export const MOBILE_BREAKPOINT = 768

/**
 * 「1024 才放得下」的那一档（原来的 `lg`，Tailwind 里叫 `desk:`）。
 * 768–1023 是平板：桌面壳，但侧栏不展开、助手不挤工作台。
 */
export const DESK_BREAKPOINT = 1024

function useMediaFlag(query: string, test: (width: number) => boolean) {
  const [flag, setFlag] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // JSDOM (and some test runners) ship without `window.matchMedia`. Bail
    // gracefully there so components using this hook can still render in
    // unit tests — they'll just see the desktop default.
    if (typeof window.matchMedia !== 'function') {
      setFlag(false)
      return
    }
    const mql = window.matchMedia(query)
    const onChange = () => {
      setFlag(test(window.innerWidth))
    }
    mql.addEventListener('change', onChange)
    setFlag(test(window.innerWidth))
    return () => mql.removeEventListener('change', onChange)
  }, [query, test])

  return !!flag
}

const isMobileWidth = (width: number) => width < MOBILE_BREAKPOINT
const isTabletWidth = (width: number) =>
  width >= MOBILE_BREAKPOINT && width < DESK_BREAKPOINT

export function useIsMobile() {
  return useMediaFlag(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, isMobileWidth)
}

/** 平板（768–1023）：桌面壳的窄档。首帧 false，与 SSR 一致。 */
export function useIsTablet() {
  return useMediaFlag(
    `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${DESK_BREAKPOINT - 1}px)`,
    isTabletWidth,
  )
}
