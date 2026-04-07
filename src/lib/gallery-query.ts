import type { GalleryFilters } from '@/hooks/use-gallery'

export function buildGalleryQueryString(filters: GalleryFilters): string {
  const params = new URLSearchParams()

  if (filters.search.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters.model) {
    params.set('model', filters.model)
  }

  if (filters.sort !== 'newest') {
    params.set('sort', filters.sort)
  }

  if (filters.type !== 'all') {
    params.set('type', filters.type)
  }

  if (filters.timeRange && filters.timeRange !== 'all') {
    params.set('timeRange', filters.timeRange)
  }

  if (filters.liked) {
    params.set('liked', '1')
  }

  return params.toString()
}
