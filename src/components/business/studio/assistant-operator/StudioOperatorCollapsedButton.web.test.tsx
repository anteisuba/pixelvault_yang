import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_SHELL } from '@/constants/studio-assistant-operator'

import { StudioOperatorCollapsedButton } from './StudioOperatorCollapsedButton'

/**
 * 收起态（D7 ④ · Q2 = C，画板 dockBtn 两态）。
 *
 * 钉三件事：① 44px 近黑圆 + 右 16 / 下 16；② 无事无角标、有事画数字；
 * ③ 手机档只换距下缘的留白。⛔ 不再断言状态词 / 状态点 / `N/M` 读数 ——
 * 那三样随微状态卡与手机浮标一起删了。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StudioOperatorCollapsedButton', () => {
  it('44px 近黑圆，右 16 / 下 16，无事无角标', () => {
    render(<StudioOperatorCollapsedButton badgeCount={0} onExpand={vi.fn()} />)
    const button = screen.getByTestId('operator-collapsed')
    expect(button.style.width).toBe(
      `${STUDIO_OPERATOR_SHELL.collapsedSizePx}px`,
    )
    expect(button.style.height).toBe(
      `${STUDIO_OPERATOR_SHELL.collapsedSizePx}px`,
    )
    expect(button.style.bottom).toBe(
      `${STUDIO_OPERATOR_SHELL.collapsedInsetPx}px`,
    )
    expect(button.className).toContain('rounded-full')
    // 信号位只用近黑实底 + 白字（§12.2），⛔ 不用 `--primary`。
    expect(button.className).toContain('bg-foreground')
    expect(button.className).not.toContain('bg-primary')
    expect(screen.queryByTestId('operator-collapsed-badge')).toBeNull()
  })

  it('有事画数字角标，并写进 aria-label', () => {
    render(<StudioOperatorCollapsedButton badgeCount={3} onExpand={vi.fn()} />)
    expect(screen.getByTestId('operator-collapsed-badge').textContent).toBe('3')
    expect(
      screen.getByTestId('operator-collapsed').getAttribute('aria-label'),
    ).toContain('collapsedTodo')
  })

  it('手机档只换距下缘的留白（96 净空，清过 composer）', () => {
    render(
      <StudioOperatorCollapsedButton
        badgeCount={0}
        mobile
        onExpand={vi.fn()}
      />,
    )
    expect(screen.getByTestId('operator-collapsed').style.bottom).toContain(
      '96px',
    )
  })

  it('点一下展开', () => {
    const onExpand = vi.fn()
    render(<StudioOperatorCollapsedButton badgeCount={0} onExpand={onExpand} />)
    fireEvent.click(screen.getByTestId('operator-collapsed'))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})
