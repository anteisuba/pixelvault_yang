import { describe, expect, it } from 'vitest'

import type { GalleryFilters } from '@/hooks/use-gallery'
import {
  clearGalleryNarrowing,
  galleryEmptyKind,
} from '@/features/gallery/lib/gallery-query'

const BASE: GalleryFilters = {
  search: '',
  models: [],
  sort: 'newest',
  types: [],
  timeRange: 'all',
  liked: false,
  published: false,
  projectId: '',
  provider: '',
}

describe('galleryEmptyKind', () => {
  it('什么都没收窄 = 库本身空', () => {
    expect(galleryEmptyKind(BASE)).toBe('library')
  })

  it('切换条 / 看法 / 排序不算收窄', () => {
    expect(
      galleryEmptyKind({
        ...BASE,
        types: ['video'],
        view: 'prompts',
        sort: 'oldest',
      }),
    ).toBe('library')
  })

  it('有搜索词 = search（只有空白不算）', () => {
    expect(galleryEmptyKind({ ...BASE, search: '粉发少女' })).toBe('search')
    expect(galleryEmptyKind({ ...BASE, search: '   ' })).toBe('library')
  })

  it('搜索词优先于其它筛选', () => {
    expect(galleryEmptyKind({ ...BASE, search: 'x', liked: true })).toBe(
      'search',
    )
  })

  const narrowings: Partial<GalleryFilters>[] = [
    { liked: true },
    { published: true },
    { models: ['m'] },
    { timeRange: 'week' },
    { projectId: 'p1' },
  ]
  it.each(narrowings)('收窄了 %o = filtered', (patch) => {
    expect(galleryEmptyKind({ ...BASE, ...patch })).toBe('filtered')
  })
})

describe('clearGalleryNarrowing', () => {
  it('清除搜索只放掉搜索词，其它原样', () => {
    const filters: GalleryFilters = {
      ...BASE,
      search: 'x',
      liked: true,
      types: ['video'],
    }
    expect(clearGalleryNarrowing(filters, 'search')).toEqual({
      ...filters,
      search: '',
    })
  })

  it('清除筛选放掉收窄项，切换条与排序原样', () => {
    const filters: GalleryFilters = {
      ...BASE,
      liked: true,
      models: ['m'],
      timeRange: 'week',
      projectId: 'p1',
      published: true,
      types: ['video'],
      sort: 'oldest',
    }
    const cleared = clearGalleryNarrowing(filters, 'filtered')
    expect(galleryEmptyKind(cleared)).toBe('library')
    expect(cleared.types).toEqual(['video'])
    expect(cleared.sort).toBe('oldest')
  })
})
