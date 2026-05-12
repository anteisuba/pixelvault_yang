/**
 * Module-level cache for card-style fetches (character / style /
 * background / voice). The cache lives outside React state on purpose:
 * every time a user opens / closes the CardDrawer, the components
 * (and therefore their hooks) unmount and remount. Without this cache
 * each remount re-fetches the same list, so users see a spinner the
 * second / third time they open the drawer — even though nothing
 * about their data has changed.
 *
 * Pattern is the same as the gallery cache (see `use-gallery.ts`):
 * cache hit renders instantly, then a silent background revalidate
 * keeps the data fresh for the next mount.
 *
 * Keys are namespaced by card type + project scope so an opened
 * character-cards list doesn't accidentally read back style-cards
 * data, and switching project scope still triggers a fresh fetch.
 */

const cache = new Map<string, unknown>()

export function readCardCache<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined
}

export function writeCardCache<T>(key: string, data: T): void {
  cache.set(key, data)
}

export function invalidateCardCache(key: string): void {
  cache.delete(key)
}

/** Build a stable cache key for a card-list hook. */
export function makeCardCacheKey(
  cardType: string,
  projectId?: string | null,
): string {
  return `${cardType}:${projectId ?? ''}`
}
