import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * 思考档位 chip（owner 2026-10-10 选 B）：三档、默认 Medium 打勾、选中即写
 * persona；没存上就撤回。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

/** 弹层原语换成直通，同模型 chip 的测试。 */
vi.mock('@/components/ui/responsive-popover', async () => {
  const React = await import('react')
  const Ctx = React.createContext<{
    open: boolean
    setOpen(next: boolean): void
  }>({ open: false, setOpen: () => {} })
  return {
    ResponsivePopover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange(next: boolean): void
      children: React.ReactNode
    }) => (
      <Ctx.Provider value={{ open, setOpen: onOpenChange }}>
        {children}
      </Ctx.Provider>
    ),
    ResponsivePopoverTrigger: ({
      children,
    }: {
      children: React.ReactElement<{ onClick?: () => void }>
    }) => {
      const { open, setOpen } = React.useContext(Ctx)
      return React.cloneElement(children, { onClick: () => setOpen(!open) })
    },
    ResponsivePopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(Ctx)
      return open ? <div>{children}</div> : null
    },
  }
})

import { StudioOperatorEffortChip } from './StudioOperatorEffortChip'

describe('StudioOperatorEffortChip', () => {
  it('三档按 Low / Medium / High 排，当前档打勾', () => {
    render(<StudioOperatorEffortChip value="medium" onChange={vi.fn()} />)
    expect(screen.getByTestId('operator-effort-chip').textContent).toContain(
      'levels.medium',
    )
    fireEvent.click(screen.getByTestId('operator-effort-chip'))
    const options = screen.getAllByRole('menuitemradio')
    expect(options.map((option) => option.dataset.testid)).toEqual([
      'operator-effort-option-low',
      'operator-effort-option-medium',
      'operator-effort-option-high',
    ])
    expect(
      screen
        .getByTestId('operator-effort-option-medium')
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('选中即写；没存上就撤回到原档', async () => {
    const onChange = vi.fn().mockResolvedValue(false)
    render(<StudioOperatorEffortChip value="medium" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('operator-effort-chip'))
    fireEvent.click(screen.getByTestId('operator-effort-option-high'))
    expect(onChange).toHaveBeenCalledWith('high')
    await waitFor(() =>
      expect(screen.getByTestId('operator-effort-chip').textContent).toContain(
        'levels.medium',
      ),
    )
  })

  it('点当前档不写库', () => {
    const onChange = vi.fn()
    render(<StudioOperatorEffortChip value="low" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('operator-effort-chip'))
    fireEvent.click(screen.getByTestId('operator-effort-option-low'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
