import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RollingNumber } from './rolling-number'

describe('RollingNumber', () => {
  it('reads the whole number once and keeps the digit wheels hidden', () => {
    const { container, rerender } = render(<RollingNumber value={42} />)
    expect(screen.getByText('42')).toHaveClass('sr-only')
    const track = container.querySelector('.number-roll-track')
    expect(track).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.number-roll-cell')).toHaveLength(2)

    rerender(<RollingNumber value={105} />)
    expect(screen.getByText('105')).toBeInTheDocument()
    expect(container.querySelectorAll('.number-roll-cell')).toHaveLength(3)
  })

  it('never shows negatives or fractions', () => {
    const { container } = render(<RollingNumber value={-3.6} />)
    expect(container.querySelector('.sr-only')).toHaveTextContent(/^0$/)
  })
})
