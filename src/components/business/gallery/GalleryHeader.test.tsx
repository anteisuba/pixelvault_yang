import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GalleryHeader } from './GalleryHeader'
import type { GalleryFilters } from '@/hooks/use-gallery'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true }),
}))

const FILTERS: GalleryFilters = {
  search: '',
  types: [],
  models: [],
  timeRange: 'all',
  sort: 'newest',
  liked: false,
  published: false,
  provider: '',
  projectId: '',
}

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    window.dispatchEvent(new Event('scroll'))
  })
}

describe('GalleryHeader', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  it('keeps only the facets, search and liked toggle, with a hidden heading', () => {
    render(<GalleryHeader filters={FILTERS} onFiltersChange={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only')
    expect(
      screen.getByRole('button', { name: 'facetType' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'facetStatus' })).toBeNull()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /tabs\.favorites/ }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('collapses on scroll down and comes back on scroll up or focus', () => {
    const { container } = render(
      <GalleryHeader filters={FILTERS} onFiltersChange={vi.fn()} />,
    )
    const bar = container.firstElementChild as HTMLElement
    expect(bar).not.toHaveAttribute('data-collapsed')

    scrollTo(400)
    expect(bar).toHaveAttribute('data-collapsed')

    scrollTo(300)
    expect(bar).not.toHaveAttribute('data-collapsed')

    scrollTo(800)
    expect(bar).toHaveAttribute('data-collapsed')
    fireEvent.focus(screen.getByRole('searchbox'))
    expect(bar).not.toHaveAttribute('data-collapsed')
  })

  it('stays open while the viewer is pinned to it', () => {
    const { container } = render(
      <GalleryHeader filters={FILTERS} onFiltersChange={vi.fn()} pinnedOpen />,
    )
    scrollTo(600)
    expect(container.firstElementChild).not.toHaveAttribute('data-collapsed')
  })

  it('does not collapse on narrow screens where the bar is not sticky', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    const { container } = render(
      <GalleryHeader filters={FILTERS} onFiltersChange={vi.fn()} />,
    )
    scrollTo(600)
    expect(container.firstElementChild).not.toHaveAttribute('data-collapsed')
  })
})
