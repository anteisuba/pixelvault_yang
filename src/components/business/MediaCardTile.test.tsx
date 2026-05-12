import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { MediaCardTile } from './MediaCardTile'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))

const MESSAGES = {
  CardSlot: {
    viewDetails: 'View details',
  },
}

function renderTile(
  props: Partial<React.ComponentProps<typeof MediaCardTile>> = {},
) {
  const defaults = {
    name: 'Forest',
    sourceImageUrl: 'https://example.com/bg.png',
    isSelected: false,
    aspect: 'video' as const,
    selectLabel: 'Select',
    deselectLabel: 'Deselect',
    onToggleSelect: vi.fn(),
    onOpenDetail: vi.fn(),
  }
  const merged = { ...defaults, ...props }
  return {
    ...merged,
    ...render(
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <MediaCardTile {...merged} />
      </NextIntlClientProvider>,
    ),
  }
}

describe('MediaCardTile', () => {
  it('renders name and image', () => {
    renderTile()
    expect(screen.getByText('Forest')).toBeInTheDocument()
    expect(screen.getByAltText('Forest')).toHaveAttribute(
      'src',
      'https://example.com/bg.png',
    )
  })

  it('shows placeholder icon when sourceImageUrl is null', () => {
    renderTile({ sourceImageUrl: null })
    expect(screen.queryByAltText('Forest')).not.toBeInTheDocument()
  })

  it('toggles aria-pressed based on selection', () => {
    renderTile({ isSelected: true })
    expect(screen.getByRole('button', { name: /deselect/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('fires onToggleSelect on tile click and onOpenDetail on info button', () => {
    const onToggleSelect = vi.fn()
    const onOpenDetail = vi.fn()
    renderTile({ onToggleSelect, onOpenDetail })
    fireEvent.click(screen.getByRole('button', { name: /select/i }))
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))
    expect(onOpenDetail).toHaveBeenCalledTimes(1)
  })

  it('omits info button when onOpenDetail is not provided', () => {
    renderTile({ onOpenDetail: undefined })
    expect(
      screen.queryByRole('button', { name: /view details/i }),
    ).not.toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    renderTile({ subtitle: 'sdxl · 2 LoRA' })
    expect(screen.getByText('sdxl · 2 LoRA')).toBeInTheDocument()
  })
})
