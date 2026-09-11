// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { STUDIO_OPERATOR_MOBILE_SHELL } from '@/constants/studio-assistant-operator'

/**
 * 手机浮标 —— 它是**桌面 48px 图标轨在手机上的对应物**，所以钉的是同一组语义：
 *  ① 命中区 44（`ui-defaults.md §5` 触屏档）；
 *  ② 状态点四档 tone 与图标轨**同一张表**（⛔ 不许在手机上重抄一份配色）；
 *  ③ 干活中报「3/6」，其余档报那一档的名字（`rail.*`），且读数进 aria-label ——
 *     一颗光秃秃的点等于什么都没说；
 *  ④ 底部留白同时清过 safe-area、软键盘、以及钉底的 `StudioMobileComposer`。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { StudioOperatorMobileFab } from './StudioOperatorMobileFab'

const base = {
  primed: false,
  stepsDone: 0,
  plannedSteps: 0,
  onOpen: vi.fn(),
}

describe('StudioOperatorMobileFab', () => {
  it('命中区 44', () => {
    render(<StudioOperatorMobileFab {...base} status="idle" />)
    const fab = screen.getByTestId('operator-mobile-fab')
    expect(fab.style.width).toBe(`${STUDIO_OPERATOR_MOBILE_SHELL.fabHitPx}px`)
    expect(fab.style.height).toBe(`${STUDIO_OPERATOR_MOBILE_SHELL.fabHitPx}px`)
    expect(STUDIO_OPERATOR_MOBILE_SHELL.fabHitPx).toBe(44)
  })

  it('状态点 tone：idle / working / awaitingConfirm / error 四档各走各的 token', () => {
    const cases = [
      { status: 'idle', tone: 'idle', cls: 'bg-muted-foreground' },
      { status: 'working', tone: 'working', cls: 'bg-primary' },
      { status: 'awaitingPlan', tone: 'planning', cls: 'bg-primary' },
      { status: 'awaitingConfirm', tone: 'awaiting', cls: 'bg-status-warning' },
      { status: 'error', tone: 'error', cls: 'bg-destructive' },
    ] as const

    for (const item of cases) {
      const { unmount } = render(
        <StudioOperatorMobileFab {...base} status={item.status} />,
      )
      const fab = screen.getByTestId('operator-mobile-fab')
      expect(fab.dataset.tone).toBe(item.tone)
      expect(screen.getByTestId('operator-mobile-fab-dot').className).toContain(
        item.cls,
      )
      unmount()
    }
  })

  it('干活中带计数「3/6」，且读数进 aria-label', () => {
    render(
      <StudioOperatorMobileFab
        {...base}
        status="working"
        stepsDone={3}
        plannedSteps={6}
      />,
    )
    expect(screen.getByTestId('operator-mobile-fab-count').textContent).toBe(
      '3/6',
    )
    expect(
      screen.getByTestId('operator-mobile-fab').getAttribute('aria-label'),
    ).toContain('3/6')
  })

  it('没有计划步数时不画计数；primed 走 ring 而不是占状态点的档', () => {
    render(<StudioOperatorMobileFab {...base} status="idle" primed />)
    const fab = screen.getByTestId('operator-mobile-fab')
    expect(screen.queryByTestId('operator-mobile-fab-count')).toBeNull()
    expect(fab.dataset.tone).toBe('idle')
    expect(fab.dataset.primed).toBe('true')
    expect(fab.className).toContain('ring-primary')
    expect(fab.getAttribute('aria-label')).toContain('rail.primed')
  })

  it('收起档带微状态药丸：给了状态词就画，且 aria-label 读的是那一句', () => {
    render(
      <StudioOperatorMobileFab
        {...base}
        status="working"
        statusText="正在查 3 个来源…"
      />,
    )
    const fab = screen.getByTestId('operator-mobile-fab')
    expect(screen.getByTestId('operator-mobile-fab-status').textContent).toBe(
      '正在查 3 个来源…',
    )
    expect(fab.getAttribute('aria-label')).toContain('正在查 3 个来源…')
  })

  it('空闲（statusText 为 null）时那颗药丸整颗不画', () => {
    render(<StudioOperatorMobileFab {...base} status="idle" />)
    expect(screen.queryByTestId('operator-mobile-fab-status')).toBeNull()
  })

  it('底部留白清过 safe-area / 软键盘 / 钉底 composer', () => {
    render(<StudioOperatorMobileFab {...base} status="idle" />)
    const fab = screen.getByTestId('operator-mobile-fab')
    expect(fab.style.bottom).toContain(
      `${STUDIO_OPERATOR_MOBILE_SHELL.fabBottomPx}px`,
    )
    expect(fab.style.bottom).toContain('--keyboard-safe-area-bottom')
    expect(fab.style.bottom).toContain('--keyboard-inset')
    // composer 是 `z-40`，浮标必须让位。
    expect(fab.className).toContain('z-30')
  })
})
