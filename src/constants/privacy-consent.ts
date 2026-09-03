/**
 * Privacy / cookie consent — storage contract and the analytics knobs it gates.
 *
 * Consent is a per-browser decision with no cross-device requirement, so it
 * lives in `localStorage` only; there is no server-side record and no cookie.
 *
 * The version is part of the *key* rather than the value: when the disclosure
 * changes materially, bump `PRIVACY_CONSENT_VERSION` and every browser falls
 * back to "undecided" on the next load — no stored-value parsing, no
 * migration.
 */
export const PRIVACY_CONSENT_VERSION = 1

export const CONSENT_STORAGE_KEY = `pixelvault:privacy-consent:v${PRIVACY_CONSENT_VERSION}`

/** A decision the user actually made. Persisted verbatim as the stored value. */
export const PRIVACY_CONSENT_DECISIONS = ['accepted', 'rejected'] as const

export type PrivacyConsentDecision = (typeof PRIVACY_CONSENT_DECISIONS)[number]

/** No decision on record yet — the only state that renders the banner. */
export const PRIVACY_CONSENT_UNKNOWN = 'unknown'

export type PrivacyConsentStatus =
  | PrivacyConsentDecision
  | typeof PRIVACY_CONSENT_UNKNOWN

export function isPrivacyConsentDecision(
  value: string | null,
): value is PrivacyConsentDecision {
  return PRIVACY_CONSENT_DECISIONS.includes(value as PrivacyConsentDecision)
}

/**
 * Sentry Session Replay sampling. Only read after `accepted` — the integration
 * is added at runtime, never at `Sentry.init`, so an undecided or rejecting
 * visitor never loads the recorder at all.
 */
export const SENTRY_REPLAY_SESSION_SAMPLE_RATE = 0.01
export const SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE = 1.0

/** `replayIntegration()`'s registered name, as returned by `getIntegrationByName`. */
export const SENTRY_REPLAY_INTEGRATION_NAME = 'Replay'
