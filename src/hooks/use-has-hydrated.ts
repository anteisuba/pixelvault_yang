'use client'

import { useSyncExternalStore } from 'react'

const subscribeToHydration = () => () => {}
const getHydratedSnapshot = () => true
const getServerHydrationSnapshot = () => false

/**
 * True only after the client has hydrated. Guards auth-conditional UI
 * (Clerk's `isLoaded` can already be `true` on the client's first render,
 * before that render is reconciled against SSR output) so the pre-hydration
 * client render always matches the server render.
 */
export function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  )
}
