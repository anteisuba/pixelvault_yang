import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CANVAS_SHELL_PANEL_IDS } from '@/constants/canvas-shell'

import {
  resetCanvasShellPanelStore,
  toggleCanvasShellPanel,
  useCanvasShellPanel,
  useCanvasShellPanelHost,
} from './use-canvas-shell-panel'

describe('use-canvas-shell-panel · 画布与全站侧栏共用的一格', () => {
  afterEach(() => {
    act(() => resetCanvasShellPanelStore())
  })

  it('画布挂着才算 mounted；侧栏点一颗，画布那边读到同一格', () => {
    const sidebar = renderHook(() => useCanvasShellPanel())
    expect(sidebar.result.current.mounted).toBe(false)

    const host = renderHook(() => useCanvasShellPanelHost())
    expect(sidebar.result.current.mounted).toBe(true)

    act(() => toggleCanvasShellPanel(CANVAS_SHELL_PANEL_IDS.cards))
    expect(host.result.current[0]).toBe(CANVAS_SHELL_PANEL_IDS.cards)

    // 再点同一颗 = 收起。
    act(() => toggleCanvasShellPanel(CANVAS_SHELL_PANEL_IDS.cards))
    expect(host.result.current[0]).toBeNull()

    act(() => host.result.current[1](CANVAS_SHELL_PANEL_IDS.library))
    expect(sidebar.result.current.activePanel).toBe(
      CANVAS_SHELL_PANEL_IDS.library,
    )
  })

  it('画布卸载：子图标收回、开着的面板不带到下一次', () => {
    const sidebar = renderHook(() => useCanvasShellPanel())
    const host = renderHook(() => useCanvasShellPanelHost())
    act(() => toggleCanvasShellPanel(CANVAS_SHELL_PANEL_IDS.nodes))

    host.unmount()
    expect(sidebar.result.current).toEqual({
      mounted: false,
      activePanel: null,
    })
  })
})
