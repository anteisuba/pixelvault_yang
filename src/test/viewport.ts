import { vi } from 'vitest'

/**
 * 测试里切视口宽度：`window.innerWidth` + 按 min/max-width 真算的 `matchMedia`。
 * 真 `useIsMobile` / `useIsTablet` 读的就是这两样，⛔ 不再去 mock 那几个 hook。
 * 用完 `vi.unstubAllGlobals()` 还原 matchMedia；innerWidth 由下一次 setViewport 覆盖。
 */
export function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  const matches = (query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    if (min && width < Number(min[1])) return false
    if (max && width > Number(max[1])) return false
    return Boolean(min || max)
  }
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

export const PHONE_WIDTH = 390
export const DESKTOP_WIDTH = 1280
