import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CharacterCardTile } from './CharacterCardTile'
import type { CharacterCardRecord } from '@/types'

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const { src, alt, ...rest } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt} {...rest} />
  },
}))

const MESSAGES = {
  CharacterCard: {
    selectCard: 'Select card',
    deselectCard: 'Deselect card',
  },
  CardSlot: {
    viewDetails: 'View details',
  },
}

const baseCard: CharacterCardRecord = {
  id: 'card-1',
  userId: 'u1',
  parentId: null,
  name: 'Aemeath',
  description: null,
  variantLabel: null,
  characterPrompt: 'a girl',
  attributes: {},
  sourceImageUrl: 'https://example.com/img.png',
  sourceImages: [],
  sourceImageEntries: [],
  referenceImages: [],
  modelPrompts: {},
  tags: [],
  status: 'STABLE',
  stabilityScore: null,
  variants: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as CharacterCardRecord

function renderTile(
  props: Partial<React.ComponentProps<typeof CharacterCardTile>> = {},
) {
  const defaults = {
    card: baseCard,
    isSelected: false,
    onToggleSelect: vi.fn(),
    onOpenDetail: vi.fn(),
  }
  const merged = { ...defaults, ...props }
  return {
    ...merged,
    ...render(
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <CharacterCardTile {...merged} />
      </NextIntlClientProvider>,
    ),
  }
}

describe('CharacterCardTile', () => {
  it('renders card name and source image', () => {
    renderTile()
    expect(screen.getByText('Aemeath')).toBeInTheDocument()
    expect(screen.getByAltText('Aemeath')).toHaveAttribute(
      'src',
      'https://example.com/img.png',
    )
  })

  it('exposes selection state via aria-pressed', () => {
    const { rerender } = renderTile({ isSelected: false })
    expect(
      screen.getByRole('button', { name: /select card/i }),
    ).toHaveAttribute('aria-pressed', 'false')
    rerender(
      <NextIntlClientProvider locale="en" messages={MESSAGES}>
        <CharacterCardTile
          card={baseCard}
          isSelected
          onToggleSelect={vi.fn()}
          onOpenDetail={vi.fn()}
        />
      </NextIntlClientProvider>,
    )
    expect(
      screen.getByRole('button', { name: /deselect card/i }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('fires onToggleSelect when tile is clicked', () => {
    const onToggleSelect = vi.fn()
    renderTile({ onToggleSelect })
    fireEvent.click(screen.getByRole('button', { name: /select card/i }))
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
  })

  it('fires onOpenDetail without toggling selection', () => {
    const onToggleSelect = vi.fn()
    const onOpenDetail = vi.fn()
    renderTile({ onToggleSelect, onOpenDetail })
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))
    expect(onOpenDetail).toHaveBeenCalledTimes(1)
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('shows variant count badge when card has variants', () => {
    const withVariants = {
      ...baseCard,
      variants: [
        { id: 'v1' } as CharacterCardRecord,
        { id: 'v2' } as CharacterCardRecord,
      ],
    }
    renderTile({ card: withVariants })
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('shows variantLabel chip when set', () => {
    const labelled = { ...baseCard, variantLabel: 'anime' }
    renderTile({ card: labelled })
    expect(screen.getByText('anime')).toBeInTheDocument()
  })
})
