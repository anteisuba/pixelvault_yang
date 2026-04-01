import { STUDIO_CARD_SORT_OPTIONS } from '@/constants/studio'

type TimestampLike = Date | string | number | null | undefined

export type CardManagerSortMode = (typeof STUDIO_CARD_SORT_OPTIONS)[number]

export function toCardTimestampMs(value: TimestampLike): number {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  return 0
}

export function matchesCardSearch(
  query: string,
  values: Array<string | string[] | null | undefined>,
): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  const haystack = values
    .flatMap((value) => {
      if (Array.isArray(value)) {
        return value
      }

      return value ? [value] : []
    })
    .join(' ')
    .toLowerCase()

  return haystack.includes(normalizedQuery)
}

export function sortCardManagerItems<T>(
  items: T[],
  sortMode: CardManagerSortMode,
  getName: (item: T) => string,
  getCreatedAt: (item: T) => TimestampLike,
  getLastUsedAt: (item: T) => TimestampLike,
): T[] {
  return [...items].sort((left, right) => {
    if (sortMode === 'name') {
      return getName(left).localeCompare(getName(right))
    }

    const leftPrimary =
      sortMode === 'recent'
        ? toCardTimestampMs(getLastUsedAt(left))
        : toCardTimestampMs(getCreatedAt(left))
    const rightPrimary =
      sortMode === 'recent'
        ? toCardTimestampMs(getLastUsedAt(right))
        : toCardTimestampMs(getCreatedAt(right))

    if (rightPrimary !== leftPrimary) {
      return rightPrimary - leftPrimary
    }

    const rightCreatedAt = toCardTimestampMs(getCreatedAt(right))
    const leftCreatedAt = toCardTimestampMs(getCreatedAt(left))

    if (rightCreatedAt !== leftCreatedAt) {
      return rightCreatedAt - leftCreatedAt
    }

    return getName(left).localeCompare(getName(right))
  })
}
