import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { CONSENT_STORAGE_KEY } from '@/constants/privacy-consent'

import { usePrivacyConsent } from './use-privacy-consent'

describe('usePrivacyConsent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resolves to `unknown` when nothing is stored', () => {
    const { result } = renderHook(() => usePrivacyConsent())

    expect(result.current.status).toBe('unknown')
  })

  it('persists an acceptance and reports it', () => {
    const { result } = renderHook(() => usePrivacyConsent())

    act(() => result.current.accept())

    expect(result.current.status).toBe('accepted')
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('accepted')
  })

  it('persists a rejection and reports it', () => {
    const { result } = renderHook(() => usePrivacyConsent())

    act(() => result.current.reject())

    expect(result.current.status).toBe('rejected')
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('rejected')
  })

  it('reads a decision made on an earlier visit', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')

    const { result } = renderHook(() => usePrivacyConsent())

    expect(result.current.status).toBe('accepted')
  })

  it('treats a garbage stored value as undecided', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'yes-please')

    const { result } = renderHook(() => usePrivacyConsent())

    expect(result.current.status).toBe('unknown')
  })
})
