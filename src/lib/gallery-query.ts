import type { GalleryFilters } from '@/hooks/use-gallery'

export function buildGalleryQueryString(filters: GalleryFilters): string {
  const params = new URLSearchParams()

  if (filters.search.trim()) {
    params.set('search', filters.search.trim())
  }

  if (filters.models.length) {
    params.set('model', filters.models.join(','))
  }

  if (filters.sort !== 'newest') {
    params.set('sort', filters.sort)
  }

  if (filters.types.length) {
    params.set('type', filters.types.join(','))
  }

  if (filters.timeRange && filters.timeRange !== 'all') {
    params.set('timeRange', filters.timeRange)
  }

  if (filters.liked) {
    params.set('liked', '1')
  }

  if (filters.published) {
    params.set('published', '1')
  }

  if (filters.projectId) {
    params.set('projectId', filters.projectId)
  }

  return params.toString()
}
