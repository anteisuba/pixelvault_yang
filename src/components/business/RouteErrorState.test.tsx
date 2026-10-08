import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { RouteErrorState } from './RouteErrorState'

describe('RouteErrorState', () => {
  it('uses the empty-state template with a red dot instead of a red block', () => {
    const { container } = render(
      <RouteErrorState
        error={new Error('boom')}
        retry={vi.fn()}
        fallbackHref="/"
      />,
    )
    expect(screen.getByRole('heading', { name: 'title' })).toBeInTheDocument()
    expect(screen.getByTestId('empty-state-error-dot')).toBeInTheDocument()
    expect(container.querySelector('[data-tone="error"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'home' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('retry spins inside the button and asks Next to re-render the segment once', () => {
    const retry = vi.fn()
    render(
      <RouteErrorState
        error={new Error('boom')}
        retry={retry}
        fallbackHref="/"
      />,
    )
    const button = screen.getByRole('button', { name: 'retry' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.animate-spin')).not.toBeNull()
  })

  it('a new error stops the spinner (the retry did not recover)', () => {
    const retry = vi.fn()
    const { rerender } = render(
      <RouteErrorState
        error={new Error('first')}
        retry={retry}
        fallbackHref="/"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    rerender(
      <RouteErrorState
        error={new Error('second')}
        retry={retry}
        fallbackHref="/"
      />,
    )
    expect(screen.getByRole('button', { name: 'retry' })).not.toHaveAttribute(
      'aria-busy',
    )
  })
})
