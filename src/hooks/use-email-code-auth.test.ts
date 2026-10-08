import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_RESEND_COOLDOWN_S, AUTH_SUCCESS_HOLD_MS } from '@/constants/auth'

class FakeClerkError extends Error {
  errors: Array<{ code: string }>
  constructor(code: string) {
    super(code)
    this.errors = [{ code }]
  }
}

const signIn = {
  create: vi.fn(),
  prepareFirstFactor: vi.fn(),
  attemptFirstFactor: vi.fn(),
  authenticateWithRedirect: vi.fn(),
}
const signUp = {
  create: vi.fn(),
  prepareEmailAddressVerification: vi.fn(),
  attemptEmailAddressVerification: vi.fn(),
}
const setActive = vi.fn()
const clerk = {
  buildAfterSignInUrl: vi.fn(() => '/zh/studio/image'),
  buildAfterSignUpUrl: vi.fn(() => '/zh/studio/image'),
}

vi.mock('@clerk/nextjs', () => ({
  useSignIn: () => ({ isLoaded: true, signIn, setActive }),
  useSignUp: () => ({ isLoaded: true, signUp, setActive }),
  useClerk: () => clerk,
}))

vi.mock('@clerk/nextjs/errors', () => ({
  isClerkAPIResponseError: (err: unknown) => err instanceof FakeClerkError,
}))

vi.mock('next-intl', () => ({ useLocale: () => 'zh' }))

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href}`,
}))

const { useEmailCodeAuth } = await import('./use-email-code-auth')

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { search: '' },
  })
  signIn.create.mockResolvedValue({
    supportedFirstFactors: [
      { strategy: 'email_code', emailAddressId: 'idn_1' },
    ],
  })
  signIn.prepareFirstFactor.mockResolvedValue({})
  signUp.create.mockResolvedValue({})
  signUp.prepareEmailAddressVerification.mockResolvedValue({})
  setActive.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  window.sessionStorage.clear()
})

async function toCodeStep(email = 'a@b.co') {
  const hook = renderHook(() => useEmailCodeAuth())
  act(() => hook.result.current.setEmail(email))
  await act(() => hook.result.current.submitEmail())
  return hook
}

describe('useEmailCodeAuth — 一扇门的邮箱验证码', () => {
  it('rejects an address that is not an email without calling Clerk', async () => {
    const hook = renderHook(() => useEmailCodeAuth())
    act(() => hook.result.current.setEmail('not-an-email'))
    await act(() => hook.result.current.submitEmail())
    expect(hook.result.current.error).toBe('emailInvalid')
    expect(signIn.create).not.toHaveBeenCalled()
  })

  it('a known address gets a sign-in code and moves to the code step', async () => {
    const hook = await toCodeStep()
    expect(signIn.create).toHaveBeenCalledWith({ identifier: 'a@b.co' })
    expect(signIn.prepareFirstFactor).toHaveBeenCalledWith({
      strategy: 'email_code',
      emailAddressId: 'idn_1',
    })
    expect(signUp.create).not.toHaveBeenCalled()
    expect(hook.result.current.step).toBe('code')
    expect(hook.result.current.resendIn).toBe(AUTH_RESEND_COOLDOWN_S)
  })

  it('an unknown address turns into a sign-up — no password anywhere', async () => {
    signIn.create.mockRejectedValue(
      new FakeClerkError('form_identifier_not_found'),
    )
    const hook = await toCodeStep('new@b.co')
    expect(signUp.create).toHaveBeenCalledWith({ emailAddress: 'new@b.co' })
    expect(signUp.prepareEmailAddressVerification).toHaveBeenCalledWith({
      strategy: 'email_code',
    })
    expect(hook.result.current.step).toBe('code')
    const calls = JSON.stringify([
      ...signIn.create.mock.calls,
      ...signUp.create.mock.calls,
    ])
    expect(calls).not.toMatch(/password/i)
  })

  it('a wrong code reports codeIncorrect and bumps the error serial', async () => {
    signIn.attemptFirstFactor.mockRejectedValue(
      new FakeClerkError('form_code_incorrect'),
    )
    const hook = await toCodeStep()
    const before = hook.result.current.errorSerial
    await act(() => hook.result.current.verify('000000'))
    expect(hook.result.current.error).toBe('codeIncorrect')
    expect(hook.result.current.errorSerial).toBe(before + 1)
    expect(hook.result.current.pending).toBeNull()
    expect(setActive).not.toHaveBeenCalled()
  })

  it('a right code activates the session, shows ✓, then leaves', async () => {
    signIn.attemptFirstFactor.mockResolvedValue({
      status: 'complete',
      createdSessionId: 'sess_1',
    })
    const hook = await toCodeStep()
    vi.useFakeTimers()
    await act(() => hook.result.current.verify('123456'))
    expect(setActive).toHaveBeenCalledWith({ session: 'sess_1' })
    expect(hook.result.current.succeeded).toBe(true)
    expect(push).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(AUTH_SUCCESS_HOLD_MS))
    expect(push).toHaveBeenCalledWith('/zh/studio/image')
    expect(window.sessionStorage.getItem('pv-auth-arrival')).not.toBeNull()
  })

  it('hands a sign-up that still misses fields to Clerk’s continue route', async () => {
    signIn.create.mockRejectedValue(
      new FakeClerkError('form_identifier_not_found'),
    )
    signUp.attemptEmailAddressVerification.mockResolvedValue({
      status: 'missing_requirements',
    })
    const hook = await toCodeStep('new@b.co')
    await act(() => hook.result.current.verify('123456'))
    expect(push).toHaveBeenCalledWith('/zh/sign-up/continue')
  })

  it('resend waits out the 60s countdown, then sends again', async () => {
    vi.useFakeTimers()
    const hook = await toCodeStep()
    await act(() => hook.result.current.resend())
    expect(signIn.prepareFirstFactor).toHaveBeenCalledTimes(1)

    for (let i = 0; i < AUTH_RESEND_COOLDOWN_S; i++) {
      act(() => vi.advanceTimersByTime(1000))
    }
    expect(hook.result.current.resendIn).toBe(0)
    await act(() => hook.result.current.resend())
    expect(signIn.prepareFirstFactor).toHaveBeenCalledTimes(2)
    expect(hook.result.current.resendIn).toBe(AUTH_RESEND_COOLDOWN_S)
  })

  it('「换邮箱」goes back to the first step and keeps the address', async () => {
    const hook = await toCodeStep('keep@b.co')
    act(() => hook.result.current.changeEmail())
    expect(hook.result.current.step).toBe('start')
    expect(hook.result.current.email).toBe('keep@b.co')
  })

  it('social sign-in redirects through Clerk’s sso-callback route', async () => {
    signIn.authenticateWithRedirect.mockResolvedValue(undefined)
    const hook = renderHook(() => useEmailCodeAuth())
    await act(() =>
      hook.result.current.startSocial({
        id: 'apple',
        strategy: 'oauth_apple',
        label: 'Apple',
      }),
    )
    expect(signIn.authenticateWithRedirect).toHaveBeenCalledWith({
      strategy: 'oauth_apple',
      redirectUrl: '/zh/sign-in/sso-callback',
      redirectUrlComplete: '/zh/studio/image',
    })
    expect(hook.result.current.pending).toBe('apple')
  })

  it('a provider that is not enabled says so instead of hanging', async () => {
    signIn.authenticateWithRedirect.mockRejectedValue(
      new FakeClerkError('some_unknown_code'),
    )
    const hook = renderHook(() => useEmailCodeAuth())
    await act(() =>
      hook.result.current.startSocial({
        id: 'apple',
        strategy: 'oauth_apple',
        label: 'Apple',
      }),
    )
    expect(hook.result.current.error).toBe('providerUnavailable')
    expect(hook.result.current.pending).toBeNull()
  })
})
