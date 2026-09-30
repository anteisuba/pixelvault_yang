import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GalleryAdvancedFilters } from './GalleryAdvancedFilters'
import type { GalleryFilters } from '@/hooks/use-gallery'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true }),
}))

describe('GalleryAdvancedFilters', () => {
  it('draws a different heart when the liked filter is on', () => {
    const heart = (liked: boolean) => {
      const { unmount } = render(
        <GalleryAdvancedFilters
          filters={{ models: [], liked } as unknown as GalleryFilters}
          onChange={vi.fn()}
          onClose={vi.fn()}
          type="all"
        />,
      )
      const markup = screen
        .getByRole('button', { name: 'tabs.favorites' })
        .querySelector('svg')!.innerHTML
      unmount()
      return markup
    }
    expect(heart(true)).not.toBe(heart(false))
  })
})
