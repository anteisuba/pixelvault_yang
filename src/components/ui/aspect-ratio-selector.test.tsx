import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AspectRatioSelector } from './aspect-ratio-selector'

describe('AspectRatioSelector', () => {
  it('renders a segmented control (radios + one thumb) for the canvas variant', () => {
    render(
      <AspectRatioSelector
        options={['1:1', '16:9', '9:16']}
        value="16:9"
        onChange={() => {}}
        variant="segmented"
      />,
    )
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(
      document.querySelectorAll('[data-slot="toggle-group-thumb"]'),
    ).toHaveLength(1)
  })

  it('reports the picked ratio and never emits an empty value on re-click', () => {
    const onChange = vi.fn()
    render(
      <AspectRatioSelector
        options={[{ value: '1:1', label: '方图' }]}
        value="1:1"
        onChange={onChange}
        variant="segmented"
      />,
    )
    // 点当前格：Radix 的 single toggle 会给回空串，分段控件必须吞掉它。
    fireEvent.click(screen.getByRole('radio', { name: '方图' }))
    expect(onChange).not.toHaveBeenCalledWith('')
  })

  it('keeps the pill form for the form variants', () => {
    render(
      <AspectRatioSelector options={['1:1']} value="1:1" onChange={() => {}} />,
    )
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByRole('button', { name: '1:1' })).toBeInTheDocument()
  })
})
