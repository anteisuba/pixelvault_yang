// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_MOBILE_SHELL,
} from '@/constants/studio-assistant-operator'

/**
 * 手机 Sheet 的几何闸（owner 2026-09-20 真机：「感觉半屏高度不够」）。
 *
 * 钉这几件事：
 *  ① 关着时内容整颗不在 DOM 里（面板卸载 = 手机上的「收起」）；
 *  ② 打开时装的就是传进来的那个面板；
 *  ③ ⭐ **接近满屏、且只有一个高度**：`snapPoints` 整套已退场，⛔ 半屏那一档
 *     不许回来 —— 它把唯一的弹性格（会话区）挤到装不下一句话；
 *  ④ ⭐ 顶上留的是一条**窄缝**：露出的高度 ≥ 视口的九成，⛔ 不留到能看结果图；
 *  ⑤ 高度走 `svh`（⛔ 不是 `vh`：iOS 地址栏；⛔ 不是 `dvh`：满屏档会跟着抖），
 *     且 `maxHeight` 把 `--keyboard-inset` 扣掉 —— ⛔ 只钉 bottom 不扣高的话，
 *     软键盘会把整张 Sheet 顶出屏幕上沿；
 *  ⑥ 带 `data-operator-keep`（面板内的 Radix portal 靠它认亲）；
 *  ⑦ `modal={false}` 下**没有遮罩** —— 顶上那条缝底下的工作台看得见也点得到；
 *  ⑧ 拖把手**只有一条**（原语自带），⛔ 不在 Sheet 里再画第二条；
 *  ⑨ ⭐ 那一层 `min-h-0 flex-1 flex-col` 还在 —— 会话区能不能裁剪全靠它。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioOperatorMobileSheet } from './StudioOperatorMobileSheet'

class FakeVisualViewport extends EventTarget {
  height = 844
  offsetTop = 0
}

function renderSheet(open: boolean) {
  return render(
    <StudioOperatorMobileSheet open={open} onOpenChange={vi.fn()}>
      <div data-testid="operator-panel-content" />
    </StudioOperatorMobileSheet>,
  )
}

describe('StudioOperatorMobileSheet', () => {
  beforeEach(() => {
    vi.stubGlobal('visualViewport', new FakeVisualViewport())
    Object.defineProperty(window, 'innerHeight', {
      value: 844,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('关着时内容整颗不在 DOM 里', () => {
    renderSheet(false)
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-panel-content')).toBeNull()
  })

  it('打开时装的就是传进来的那个面板', () => {
    renderSheet(true)
    expect(screen.getByTestId('operator-panel-content')).toBeTruthy()
  })

  /**
   * owner 2026-09-20：半屏（0.55）把 376px 分成四格，而只有会话区是弹性的 ——
   * 挤压全落在它头上。⛔ 吸附档整套退场，只留一个接近满屏的高度。
   */
  it('⭐ 只有一个高度：⛔ 没有吸附档，⛔ 半屏那一档不许回来', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    // vaul 有 `snapPoints` 时会在 DOM 上留下当前档的读数，没有就是没有。
    expect(sheet.dataset.snap).toBeUndefined()
    expect(sheet.getAttribute('data-vaul-snap-points')).not.toBe('true')
    expect(STUDIO_OPERATOR_MOBILE_SHELL).not.toHaveProperty('halfSnapPoint')
    expect(STUDIO_OPERATOR_MOBILE_SHELL).not.toHaveProperty('fullSnapPoint')
  })

  it('⭐ 顶上只留一条窄缝：露出的高度 ≥ 视口九成', () => {
    const exposed = Number.parseFloat(
      STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight.replace('svh', ''),
    )
    expect(exposed).toBeGreaterThanOrEqual(90)
    // ⛔ 100：一条缝都不留就看不出这是一层可以关掉的东西。
    expect(exposed).toBeLessThan(100)
  })

  it('高度走 svh，且 maxHeight 扣掉软键盘那一段', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    expect(sheet.style.height).toBe(STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight)
    // ⛔ 不用 `100vh`（`ui-defaults.md §6`）、⛔ 也不用 `dvh`（满屏档会跟着抖）。
    expect(STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight).toMatch(/svh$/)
    expect(sheet.style.maxHeight).toContain('--keyboard-inset')
  })

  it('⛔ `modal={false}` 下 vaul 的遮罩整颗不渲染', () => {
    const { baseElement } = renderSheet(true)
    // 有遮罩 = 顶上那条缝被盖住且 body 被锁滚。
    expect(baseElement.querySelector('[data-vaul-overlay]')).toBeNull()
  })

  it('顶部那条拖把手由原语提供（⛔ 不在 Sheet 里再画第二条）', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    const handles = sheet.querySelectorAll('.h-1.w-10.rounded-full')
    expect(handles.length).toBe(1)
  })

  /**
   * ⭐ 会话区能不能裁剪全靠这一层：`min-h-0` 一断，时间线就不再收缩，内容会
   * 直接把建议 chip 与输入区顶下去（owner 真机撞到的正是这一类）。
   */
  it('⭐ 装面板那一层是可收缩的 flex 列（`min-h-0`）', () => {
    renderSheet(true)
    const host = screen.getByTestId('operator-panel-content')
      .parentElement as HTMLElement
    expect(host.className).toContain('min-h-0')
    expect(host.className).toContain('flex-1')
    expect(host.className).toContain('flex-col')
  })

  it('带 data-operator-keep', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    expect(sheet.hasAttribute(STUDIO_OPERATOR_KEEP_OPEN_ATTR)).toBe(true)
  })
})
