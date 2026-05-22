/**
 * Filter a list down to items whose string fields collectively contain
 * `query` (case-insensitive, trimmed). The fields are joined with a single
 * space before the substring check, so a multi-word query like "flux pro"
 * can match an item whose name is "FLUX 1.1" and tag is "pro". An empty or
 * whitespace-only query returns the full list unchanged.
 *
 * `fieldsOf` returns the string fields per item; nullish or empty values are
 * dropped so callers can `[item.name, item.subtitle, ...item.tags]` without
 * pre-filtering. Multi-value fields like tags should be spread inline.
 */
export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  fieldsOf: (item: T) => ReadonlyArray<string | null | undefined>,
): T[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return items.slice()
  return items.filter((item) => {
    const haystack = fieldsOf(item)
      .filter(
        (field): field is string =>
          typeof field === 'string' && field.length > 0,
      )
      .join(' ')
      .toLowerCase()
    return haystack.includes(normalized)
  })
}
