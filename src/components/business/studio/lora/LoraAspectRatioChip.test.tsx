import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LoraAspectRatioChip } from './LoraAspectRatioChip'

// Radix Popover doesn't open on a synthetic click in jsdom; stub it to render
// the content inline so this stays a focused test of the chip's radio logic.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `LoraWorkbench:${key}`,
}))
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

describe('LoraAspectRatioChip (B10-1)', () => {
  it('shows the current ratio on the trigger and marks it checked', () => {
    render(<LoraAspectRatioChip value="3:4" onChange={vi.fn()} />)

    // Trigger button carries the current value…
    const trigger = screen.getByRole('button', {
      name: 'LoraWorkbench:generate.aspectRatioLabel',
    })
    expect(trigger).toHaveTextContent('3:4')

    // …and the matching radio option is checked.
    const checked = screen.getByRole('radio', { checked: true })
    expect(checked).toHaveTextContent('3:4')
  })

  it('offers all five ratios and reports selection via onChange', () => {
    const onChange = vi.fn()
    render(<LoraAspectRatioChip value="1:1" onChange={onChange} />)

    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual([
      '1:1',
      '3:4',
      '4:3',
      '16:9',
      '9:16',
    ])

    fireEvent.click(screen.getByRole('radio', { name: '9:16' }))
    expect(onChange).toHaveBeenCalledWith('9:16')
  })
})
