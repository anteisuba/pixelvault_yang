import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AssetFacetBar } from './AssetFacetBar'
import type { GalleryFilters } from '@/hooks/use-gallery'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

const EMPTY: GalleryFilters = {
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

function Harness() {
  const [filters, setFilters] = useState<GalleryFilters>(EMPTY)
  return (
    <AssetFacetBar
      filters={filters}
      onFiltersChange={setFilters}
      typeCounts={{ image: 12, video: 3 }}
      statusCounts={{ favorites: 2 }}
      modelCounts={{}}
    />
  )
}

describe('AssetFacetBar', () => {
  it('picks from a row list and shows a removable chip', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'facetType' }))
    const imageRow = screen.getByRole('checkbox', { name: /sidebarImages/ })
    expect(imageRow).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(imageRow)
    expect(imageRow).toHaveAttribute('aria-checked', 'true')
    // 触发器回显选中的那一项，chip 行长出来。
    expect(screen.getByRole('button', { name: 'facetType' })).toHaveTextContent(
      'sidebarImages',
    )
    const chip = screen.getByRole('button', {
      name: /facetRemove/,
    })
    fireEvent.click(chip)
    expect(screen.getByRole('button', { name: 'facetType' })).toHaveTextContent(
      'facetType',
    )
  })
})
