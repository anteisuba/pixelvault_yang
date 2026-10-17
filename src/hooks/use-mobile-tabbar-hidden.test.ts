import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'

import {
  useHideMobileTabBar,
  useMobileTabBarHidden,
} from './use-mobile-tabbar-hidden'

describe('useHideMobileTabBar', () => {
  it('页面说收就收，离开页面底栏回来', () => {
    const bar = renderHook(() => useMobileTabBarHidden())
    const page = renderHook(({ hidden }) => useHideMobileTabBar(hidden), {
      initialProps: { hidden: false },
    })
    expect(bar.result.current).toBe(false)
    page.rerender({ hidden: true })
    bar.rerender()
    expect(bar.result.current).toBe(true)
    page.unmount()
    bar.rerender()
    expect(bar.result.current).toBe(false)
  })
})
