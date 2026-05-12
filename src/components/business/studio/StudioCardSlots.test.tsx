import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioCardSlots } from './StudioCardSlots'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const toggleCardSelection = vi.fn()
const setStyleActiveCardId = vi.fn()
const setBackgroundActiveCardId = vi.fn()
const dispatch = vi.fn()

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: {}, dispatch }),
  useStudioData: () => ({
    characters: {
      cards: [
        {
          id: 'char-1',
          name: 'Aemeath',
          sourceImageUrl: 'https://r2/aemeath.png',
          tags: [],
          createdAt: new Date('2024-01-01'),
        },
      ],
      activeCardIds: ['char-1'],
      toggleCardSelection,
      isLoading: false,
    },
    backgrounds: {
      cards: [],
      activeCardId: null,
      setActiveCardId: setBackgroundActiveCardId,
      isLoading: false,
    },
    styles: {
      cards: [],
      activeCardId: null,
      setActiveCardId: setStyleActiveCardId,
      isLoading: false,
    },
    projects: { history: [] },
  }),
}))

describe('StudioCardSlots', () => {
  it('renders three card dropdowns (character, background, style)', () => {
    render(<StudioCardSlots />)

    expect(screen.getByTestId('studio-card-slots')).toBeInTheDocument()
    // CardDropdown buttons surface the label as accessible name
    expect(screen.getByRole('button', { name: /character/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /background/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /style/i })).toBeVisible()
  })

  it('shows the active character name in the character slot', () => {
    render(<StudioCardSlots />)
    expect(screen.getByText('Aemeath')).toBeInTheDocument()
  })
})
