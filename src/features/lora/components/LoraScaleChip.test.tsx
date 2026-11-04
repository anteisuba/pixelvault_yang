import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { stubBrowserObservers } from '@/test/fake-routes'

import { LoraScaleChip } from './LoraScaleChip'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars
      ? `LoraWorkbench:${key}:${JSON.stringify(vars)}`
      : `LoraWorkbench:${key}`,
}))

const CONFIG = { min: 0.1, max: 2, step: 0.05, default: 1 }

beforeAll(() => {
  stubBrowserObservers()
})

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

  it('点开拖到头：按底模的上限报新权重', () => {
    const onChange = vi.fn()
    render(
      <LoraScaleChip
        name="Aki"
        value={1}
        onChange={onChange}
        config={CONFIG}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /scaleLabel/ }))
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' })
    expect(onChange).toHaveBeenCalledWith(2)
  })
})
