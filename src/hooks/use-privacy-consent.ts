'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'

import {
  CONSENT_STORAGE_KEY,
  isPrivacyConsentDecision,
  PRIVACY_CONSENT_UNKNOWN,
  type PrivacyConsentDecision,
  type PrivacyConsentStatus,
} from '@/constants/privacy-consent'

export interface PrivacyConsent {
  /**
   * `null` on the server and during hydration — it is *not* the same as
   * `'unknown'`. `null` means "the stored decision has not been read yet,
   * render nothing"; `'unknown'` means "no decision on record, ask". Keeping
   * them apart is what lets the banner stay out of the SSR markup without a
   * hydration mismatch, and stops it flashing at visitors who already decided.
   */
  status: PrivacyConsentStatus | null
  accept: () => void
  reject: () => void
}

/**
 * `localStorage` is an external store, so it is read through
 * `useSyncExternalStore` rather than an effect: React uses the server snapshot
 * (`null`) for hydration and swaps in the real value right after, and every
 * mounted consumer — including one in another tab — re-reads on change.
 */
const listeners = new Set<() => void>()

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

function getSnapshot(): PrivacyConsentStatus {
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    return isPrivacyConsentDecision(stored) ? stored : PRIVACY_CONSENT_UNKNOWN
  } catch {
    // Private mode / blocked storage: treat as undecided. Asking again beats
    // silently assuming consent.
    return PRIVACY_CONSENT_UNKNOWN
  }
}

function getServerSnapshot(): null {
  return null
}

export function usePrivacyConsent(): PrivacyConsent {
  const stored = useSyncExternalStore<PrivacyConsentStatus | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
  /**
   * Shadows the stored value so a visitor whose browser blocks `localStorage`
   * (private mode, site data blocked) still gets the banner dismissed for the
   * rest of the page's life, instead of clicking a button that does nothing.
   */
  const [decided, setDecided] = useState<PrivacyConsentDecision | null>(null)

  const decide = useCallback((decision: PrivacyConsentDecision) => {
    setDecided(decision)
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, decision)
    } catch {
      // Storage unavailable — the decision holds for this page life only.
    }
    for (const listener of listeners) {
      listener()
    }
  }, [])

  const accept = useCallback(() => decide('accepted'), [decide])
  const reject = useCallback(() => decide('rejected'), [decide])

  return { status: decided ?? stored, accept, reject }
}
