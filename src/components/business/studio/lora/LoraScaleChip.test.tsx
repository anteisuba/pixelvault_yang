import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LoraScaleChip } from './LoraScaleChip'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars
      ? `LoraWorkbench:${key}:${JSON.stringify(vars)}`
      : `LoraWorkbench:${key}`,
}))
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))
// Stub the slider to a button that reports config.max, so we can assert the
// onChange wiring without driving a real range input.
vi.mock('@/components/ui/param-slider', () => ({
  ParamSlider: ({
    onChange,
    max,
  }: {
    onChange: (v: number) => void
    max: number
  }) => (
    <button type="button" data-testid="slider" onClick={() => onChange(max)}>
      slider
    </button>
  ),
}))

const CONFIG = { min: 0.1, max: 2, step: 0.05, default: 1 }

describe('LoraScaleChip (B10-2)', () => {
  it('renders the current scale as ×value on the trigger', () => {
    render(
      <LoraScaleChip
        name="Aki"
        value={0.8}
        onChange={vi.fn()}
        config={CONFIG}
      />,
    )
    expect(
      screen.getByRole('button', { name: /scaleLabel/ }),
    ).toHaveTextContent('×0.80')
  })

  it('reports the new scale via onChange', () => {
    const onChange = vi.fn()
    render(
      <LoraScaleChip
        name="Aki"
        value={1}
        onChange={onChange}
        config={CONFIG}
      />,
    )
    fireEvent.click(screen.getByTestId('slider'))
    expect(onChange).toHaveBeenCalledWith(2)
  })
})
