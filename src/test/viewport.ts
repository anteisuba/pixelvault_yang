/**
 * 测试里设屏宽：真 `useIsMobile` / `useIsTablet` 读的是 `window.innerWidth` +
 * `matchMedia`，jsdom 没有 `matchMedia`，这里补一个按宽度回答的。
 * 用完 `vi.unstubAllGlobals()`（`matchMedia` 走 `vi.stubGlobal`）。
 */
import { vi } from 'vitest'

function matches(query: string, width: number, touch: boolean): boolean {
  if (query.includes('hover: none') || query.includes('pointer: coarse'))
    return touch
  const max = /max-width:\s*(\d+)px/.exec(query)
  const min = /min-width:\s*(\d+)px/.exec(query)
  if (max && width > Number(max[1])) return false
  if (min && width < Number(min[1])) return false
  return Boolean(max || min)
}

/** `touch`：主输入是不是触屏（`(hover: none)` / `(pointer: coarse)` 的答案）。 */
export function setViewportWidth(width: number, { touch = false } = {}) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query, width, touch),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

/** 手机宽（< 768）。 */
export const MOBILE_WIDTH = 390
/** 电脑宽（≥ 1024）。 */
export const DESKTOP_WIDTH = 1440
