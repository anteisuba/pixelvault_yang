const STORAGE_KEY = 'pv.civitai.search-history.v1'
const MAX_ENTRIES = 8

/**
 * Tiny localStorage-backed log of recent Civitai LoRA library searches.
 * Used to power the focus-time suggestions dropdown on the search input.
 *
 * Stored as a most-recent-first array of trimmed strings, length-capped
 * to {@link MAX_ENTRIES}. Re-recording an existing entry promotes it to
 * the front rather than duplicating.
 */
export function readSearchHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

/**
 * Append a new search term (or promote an existing one to the front).
 * Empty / whitespace-only terms are ignored. Returns the new history
 * so callers can update local state without re-reading from storage.
 */
export function recordSearchTerm(term: string): string[] {
  const trimmed = term.trim()
  if (!trimmed) return readSearchHistory()
  const current = readSearchHistory()
  const without = current.filter(
    (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
  )
  const next = [trimmed, ...without].slice(0, MAX_ENTRIES)
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Quota / disabled storage — no-op; UI still has the in-memory list.
    }
  }
  return next
}

export function clearSearchHistory(): string[] {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
  return []
}

export const CIVITAI_SEARCH_HISTORY_MAX = MAX_ENTRIES
