import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('GalleryHeader', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is the library skeleton: search, bookmark, sort and one switch bar', () => {
    render(<GalleryHeader filters={FILTERS} onFiltersChange={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only')
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /tabs\.favorites/ }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'sortLabel' })).toHaveTextContent(
      'sort.newest',
    )
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'tabs.all',
      'type.image',
      'type.video',
      'type.audio',
      'type.model_3d',
      'viewPrompts',
    ])
    // 模型 / 时间筛选 11-05 删了。
    expect(screen.queryByRole('button', { name: 'facetModel' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'facetTime' })).toBeNull()
  })

  it('maps the switch bar onto view + types', () => {
    const onFiltersChange = vi.fn()
    const { rerender } = render(
      <GalleryHeader filters={FILTERS} onFiltersChange={onFiltersChange} />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'type.model_3d' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...FILTERS,
      view: 'images',
      types: ['model_3d'],
    })

    fireEvent.click(screen.getByRole('tab', { name: 'viewPrompts' }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...FILTERS,
      view: 'prompts',
      types: [],
    })

    rerender(
      <GalleryHeader
        filters={{ ...FILTERS, view: 'prompts' }}
        onFiltersChange={onFiltersChange}
      />,
    )
    expect(screen.getByRole('tab', { name: 'viewPrompts' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('toggles favorites and waits for the typing to stop before searching', () => {
    vi.useFakeTimers()
    const onFiltersChange = vi.fn()
    render(
      <GalleryHeader filters={FILTERS} onFiltersChange={onFiltersChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /tabs\.favorites/ }))
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...FILTERS,
      liked: true,
    })

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: ' cat ' },
    })
    expect(onFiltersChange).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      ...FILTERS,
      search: 'cat',
    })
  })
})
