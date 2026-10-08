import { afterEach, describe, expect, it, vi } from 'vitest'

import { AUTH_ARRIVAL_TTL_MS, AUTH_STORAGE_KEYS } from '@/constants/auth'
import {
  authMethodFromStrategy,
  consumeAuthArrival,
  hasShownOneTap,
  markAuthArrival,
  markOneTapShown,
} from '@/lib/auth-marks'

afterEach(() => {
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('authMethodFromStrategy — 「上次用的」只认卡上有的方式', () => {
  it('maps the three social strategies and every email strategy', () => {
    expect(authMethodFromStrategy('oauth_google')).toBe('google')
    expect(authMethodFromStrategy('oauth_github')).toBe('github')
    expect(authMethodFromStrategy('oauth_apple')).toBe('apple')
    expect(authMethodFromStrategy('email_code')).toBe('email')
    expect(authMethodFromStrategy('email_link')).toBe('email')
    expect(authMethodFromStrategy('email_address')).toBe('email')
  })

  it('marks nothing for methods the card does not offer', () => {
    expect(authMethodFromStrategy('password')).toBeNull()
    expect(authMethodFromStrategy('phone_code')).toBeNull()
    expect(authMethodFromStrategy('oauth_discord')).toBeNull()
    expect(authMethodFromStrategy(null)).toBeNull()
    expect(authMethodFromStrategy(undefined)).toBeNull()
  })
})

describe('Google 一键框：一次访问只出一次', () => {
  it('is remembered in sessionStorage', () => {
    expect(hasShownOneTap()).toBe(false)
    markOneTapShown()
    expect(hasShownOneTap()).toBe(true)
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEYS.oneTapShown)).toBe(
      '1',
    )
  })

  it('treats blocked storage as "not shown" instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => markOneTapShown()).not.toThrow()
    expect(hasShownOneTap()).toBe(false)
  })
})

describe('「已登录」黑条的记号', () => {
  it('fires once for a fresh mark and is consumed', () => {
    markAuthArrival(1_000)
    expect(consumeAuthArrival(2_000)).toBe(true)
    expect(consumeAuthArrival(2_000)).toBe(false)
  })

  it('drops a stale mark without firing', () => {
    markAuthArrival(0)
    expect(consumeAuthArrival(AUTH_ARRIVAL_TTL_MS + 1)).toBe(false)
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEYS.arrival)).toBeNull()
  })

  it('does nothing without a mark', () => {
    expect(consumeAuthArrival()).toBe(false)
  })
})
