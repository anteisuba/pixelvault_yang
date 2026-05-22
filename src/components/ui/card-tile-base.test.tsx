import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { CardTileBase } from './card-tile-base'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))

function renderBase(
  props: Partial<React.ComponentProps<typeof CardTileBase>> = {},
) {
  const defaults: React.ComponentProps<typeof CardTileBase> = {
    sourceImageUrl: 'https://example.com/x.png',
    alt: 'Demo',
    isSelected: false,
    aspectClass: 'aspect-square',
    sizes: '100px',
    onToggleSelect: vi.fn(),
    selectAriaLabel: 'Select',
    deselectAriaLabel: 'Deselect',
    bottomOverlay: <span>caption</span>,
  }
  const merged = { ...defaults, ...props }
  return { ...merged, ...render(<CardTileBase {...merged} />) }
}

describe('CardTileBase', () => {
  it('renders the image and bottomOverlay content', () => {
    renderBase()
    expect(screen.getByAltText('Demo')).toHaveAttribute(
      'src',
      'https://example.com/x.png',
    )
    expect(screen.getByText('caption')).toBeInTheDocument()
  })

  it('falls back to default placeholder when sourceImageUrl is null', () => {
    renderBase({ sourceImageUrl: null })
    expect(screen.queryByAltText('Demo')).not.toBeInTheDocument()
  })

  it('renders custom placeholder when provided and image missing', () => {
    renderBase({
      sourceImageUrl: null,
      placeholder: <span data-testid="ph">none</span>,
    })
    expect(screen.getByTestId('ph')).toBeInTheDocument()
  })

  it('reflects selection state via aria-pressed and label swap', () => {
    const { rerender } = renderBase({ isSelected: false })
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    rerender(
      <CardTileBase
        sourceImageUrl="https://example.com/x.png"
        alt="Demo"
        isSelected
        aspectClass="aspect-square"
        sizes="100px"
        onToggleSelect={vi.fn()}
        selectAriaLabel="Select"
        deselectAriaLabel="Deselect"
        bottomOverlay={<span>caption</span>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Deselect' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('fires onToggleSelect when the tile is clicked', () => {
    const onToggleSelect = vi.fn()
    renderBase({ onToggleSelect })
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
  })

  it('omits the info button when onOpenDetail is not provided', () => {
    renderBase()
    // Only the select button should be present.
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('renders the info button and fires onOpenDetail without selecting', () => {
    const onToggleSelect = vi.fn()
    const onOpenDetail = vi.fn()
    renderBase({
      onToggleSelect,
      onOpenDetail,
      viewDetailsLabel: 'View details',
    })
    fireEvent.click(screen.getByRole('button', { name: 'View details' }))
    expect(onOpenDetail).toHaveBeenCalledTimes(1)
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('renders the topLeftBadge slot when provided', () => {
    renderBase({ topLeftBadge: <span data-testid="badge">anime</span> })
    expect(screen.getByTestId('badge')).toBeInTheDocument()
  })
})
