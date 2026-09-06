// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_MOBILE_SHELL,
} from '@/constants/studio-assistant-operator'

/**
 * 手机全屏 Sheet 的几何闸（`ui-defaults.md §6` 移动端配方）。
 *
 * 钉四件事：
 *  ① 关着时内容整颗不在 DOM 里（面板卸载 = 手机上的「收起」）；
 *  ② 打开时装的就是传进来的那个面板；
 *  ③ 高度是 `dvh` 不是 `vh`，且 `maxHeight` 把 `--keyboard-inset` 扣掉 ——
 *     ⛔ 只钉 bottom 不扣高的话，软键盘会把整张 Sheet 顶出屏幕上沿；
 *  ④ 带 `data-operator-keep`（面板内的 Radix portal 靠它认亲）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioOperatorMobileSheet } from './StudioOperatorMobileSheet'

function renderSheet(open: boolean) {
  return render(
    <StudioOperatorMobileSheet open={open} onOpenChange={vi.fn()}>
      <div data-testid="operator-panel-content" />
    </StudioOperatorMobileSheet>,
  )
}

describe('StudioOperatorMobileSheet', () => {
  it('关着时内容整颗不在 DOM 里', () => {
    renderSheet(false)
    expect(screen.queryByTestId('operator-mobile-sheet')).toBeNull()
    expect(screen.queryByTestId('operator-panel-content')).toBeNull()
  })

  it('打开时装的就是传进来的那个面板', () => {
    renderSheet(true)
    expect(screen.getByTestId('operator-mobile-sheet')).toBeTruthy()
    expect(screen.getByTestId('operator-panel-content')).toBeTruthy()
  })

  it('高度走 dvh，且 maxHeight 扣掉软键盘那一段', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    expect(sheet.style.height).toBe(STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight)
    // ⛔ 不用 `100vh`（`ui-defaults.md §6`）。
    expect(STUDIO_OPERATOR_MOBILE_SHELL.sheetHeight).toBe('100dvh')
    expect(sheet.style.maxHeight).toContain('--keyboard-inset')
  })

  it('带 data-operator-keep', () => {
    renderSheet(true)
    const sheet = screen.getByTestId('operator-mobile-sheet')
    expect(sheet.hasAttribute(STUDIO_OPERATOR_KEEP_OPEN_ATTR)).toBe(true)
  })
})
