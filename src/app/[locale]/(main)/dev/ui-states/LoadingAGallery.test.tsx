import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LoadingAGallery } from './LoadingAGallery'

describe('LoadingAGallery', () => {
  it('直接打开样板页时也提供画布缩放上下文', () => {
    const { container } = render(<LoadingAGallery />)
    expect(
      screen.getByText('画布卡 · 真卡壳（选中环 / 细灰边交给进度线）'),
    ).toBeInTheDocument()
    expect(container.querySelector('[data-node-card-name]')).toHaveStyle({
      transform: 'scale(1)',
    })
  })
})
