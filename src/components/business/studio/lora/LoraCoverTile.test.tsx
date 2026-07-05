import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LoraCoverTile } from './LoraCoverTile'

describe('LoraCoverTile — shared LoRA card base (B8)', () => {
  it('renders the cover image + the black-nacre top-left badge', () => {
    render(
      <LoraCoverTile
        coverUrl="https://example.com/cover.png"
        alt="A cover"
        fallbackIcon={<span data-testid="fallback" />}
        badgeLabel="Illustrious"
      />,
    )

    expect(screen.getByRole('img', { name: 'A cover' })).toHaveAttribute(
      'src',
      'https://example.com/cover.png',
    )
    const badge = screen.getByText('Illustrious')
    expect(badge.className).toContain('bg-black/55')
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument()
  })

  it('shows the fallback icon when there is no cover', () => {
    render(
      <LoraCoverTile
        coverUrl={null}
        alt=""
        fallbackIcon={<span data-testid="fallback" />}
        badgeLabel="Style"
      />,
    )

    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('makes the whole cover a button when onClick is provided', () => {
    const onClick = vi.fn()
    render(
      <LoraCoverTile
        coverUrl="https://example.com/c.png"
        alt=""
        fallbackIcon={null}
        badgeLabel="Pony"
        onClick={onClick}
        interactiveLabel="Open Pony"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Pony' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the top-right slot and applies the selection ring', () => {
    const { container } = render(
      <LoraCoverTile
        coverUrl={null}
        alt=""
        fallbackIcon={null}
        badgeLabel="X"
        selected
        topRight={<button type="button">heart</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'heart' })).toBeInTheDocument()
    expect(container.querySelector('.ring-primary')).not.toBeNull()
  })
})
