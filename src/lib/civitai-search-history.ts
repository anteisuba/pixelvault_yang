// Per-user localStorage layout:
//   pv.civitai.search-history.v2.<clerkId>  →  { ownerClerkId, terms }
// Pre-v2 used the single global key `pv.civitai.search-history.v1`,
// which let A's search terms surface in B's dropdown after a sign-out /
// sign-in on the same browser. We purge that legacy key on first use
// and refuse to read any snapshot whose ownerClerkId doesn't match.
const STORAGE_KEY_PREFIX = 'pv.civitai.search-history.v2'
const LEGACY_GLOBAL_STORAGE_KEY = 'pv.civitai.search-history.v1'
const MAX_ENTRIES = 8

function getStorageKey(clerkId: string): string {
  return `${STORAGE_KEY_PREFIX}.${clerkId}`
}

interface StoredEnvelope {
  ownerClerkId: string
  terms: string[]
}

function purgeLegacyGlobalStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_GLOBAL_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Tiny localStorage-backed log of recent Civitai LoRA library searches.
 * Used to power the focus-time suggestions dropdown on the search input.
 *
 * Stored as a most-recent-first array of trimmed strings, length-capped
 * to {@link MAX_ENTRIES}. Re-recording an existing entry promotes it to
 * the front rather than duplicating.
 *
 * `clerkId` is required so each account's history lives in its own slot.
 * Passing `null` (signed out / Clerk not loaded yet) returns an empty
 * list and skips storage — never falls back to a global slot.
 */
export function readSearchHistory(clerkId: string | null): string[] {
  if (clerkId === null) return []
  if (typeof window === 'undefined') return []
  purgeLegacyGlobalStorage()
  try {
    const raw = window.localStorage.getItem(getStorageKey(clerkId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('ownerClerkId' in parsed) ||
      !('terms' in parsed)
    ) {
      return []
    }
    const envelope = parsed as { ownerClerkId: unknown; terms: unknown }
    if (envelope.ownerClerkId !== clerkId) return []
    if (!Array.isArray(envelope.terms)) return []
    return envelope.terms
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
 *
 * No-ops on persistence when `clerkId` is null (caller still gets back
 * the trimmed list for in-memory display).
 */
export function recordSearchTerm(
  term: string,
  clerkId: string | null,
): string[] {
  const trimmed = term.trim()
  if (!trimmed) return readSearchHistory(clerkId)
  const current = readSearchHistory(clerkId)
  const without = current.filter(
    (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
  )
  const next = [trimmed, ...without].slice(0, MAX_ENTRIES)
  if (clerkId !== null && typeof window !== 'undefined') {
    try {
      const envelope: StoredEnvelope = { ownerClerkId: clerkId, terms: next }
      window.localStorage.setItem(
        getStorageKey(clerkId),
        JSON.stringify(envelope),
      )
    } catch {
      // Quota / disabled storage — no-op; UI still has the in-memory list.
    }
  }
  return next
}

export function clearSearchHistory(clerkId: string | null): string[] {
  if (clerkId !== null && typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(getStorageKey(clerkId))
    } catch {
      // ignore
    }
  }
  return []
}

export const CIVITAI_SEARCH_HISTORY_MAX = MAX_ENTRIES
