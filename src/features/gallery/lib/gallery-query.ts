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

  if (filters.view === 'prompts') {
    params.set('view', 'prompts')
  }

  return params.toString()
}

/**
 * 画廊空态是哪一种（2026-11-17 生产实测：搜「粉发少女」没结果，却说「公开档案还很安静」）。
 * - `search`：带着搜索词没结果 → 「没有找到匹配『xxx』的作品」+「清除搜索」
 * - `filtered`：没有搜索词、但收窄了（收藏 / 旧链接带进来的模型 / 时间 / 项目 / 已公开）
 *   → 「没有符合当前筛选的作品」+「清除筛选」
 * - `library`：什么都没收窄，库本身就是空的 → 原来那句「还很安静」+「打开工作台」
 *
 * ⚠ 类型切换条（图片 / 视频…）、看法（提示词）与排序不算「收窄」：那是在换看哪一格，
 * 空了就是那一格本身空。
 */
export type GalleryEmptyKind = 'search' | 'filtered' | 'library'

export function galleryEmptyKind(filters: GalleryFilters): GalleryEmptyKind {
  if (filters.search.trim()) return 'search'
  if (
    filters.models.length > 0 ||
    (filters.timeRange && filters.timeRange !== 'all') ||
    filters.liked ||
    filters.published ||
    Boolean(filters.projectId)
  )
    return 'filtered'
  return 'library'
}

/** 空态上那颗「清除搜索 / 清除筛选」：只放掉造成这次空的那一样，切换条与排序原样。 */
export function clearGalleryNarrowing(
  filters: GalleryFilters,
  kind: Exclude<GalleryEmptyKind, 'library'>,
): GalleryFilters {
  if (kind === 'search') return { ...filters, search: '' }
  return {
    ...filters,
    models: [],
    timeRange: 'all',
    liked: false,
    published: false,
    projectId: '',
  }
}
