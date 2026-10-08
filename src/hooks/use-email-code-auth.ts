'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk, useSignIn, useSignUp } from '@clerk/nextjs'
import { isClerkAPIResponseError } from '@clerk/nextjs/errors'
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'

import {
  AUTH_RESEND_COOLDOWN_S,
  AUTH_SSO_CALLBACK_SEGMENT,
  AUTH_SUCCESS_HOLD_MS,
  type AuthSocialProvider,
} from '@/constants/auth'
import { ROUTES } from '@/constants/routes'
import { getPathname } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { markAuthArrival } from '@/lib/auth-marks'

/**
 * 登录注册的自建流程（`docs/references/pages/auth.md`「为什么自建」）。
 *
 * 一扇门：先拿邮箱试登录，Clerk 说「没这个人」就转注册 —— 访客不用先想自己是
 * 登录还是注册。⛔ 密码：只走 `email_code`，任何一步都不出现密码。
 *
 * 走不完的步骤（要二次验证、注册还缺必填项）交回 Clerk 预制组件的子路由
 * （`/sign-in/factor-two`、`/sign-up/continue`），它们接得住进行中的那次尝试。
 */

export type AuthStep = 'start' | 'code'

/** 卡上显示的错误，对应 `Auth.errors.*`。 */
export type AuthErrorKey =
  | 'emailInvalid'
  | 'codeIncorrect'
  | 'codeExpired'
  | 'tooManyAttempts'
  | 'providerUnavailable'
  | 'generic'

/** 正在等什么：哪颗键里转圈。 */
export type AuthPending = 'email' | 'code' | 'resend' | AuthSocialProvider['id']

type Mode = 'signIn' | 'signUp'

/** 只挡明显不是邮箱的（空、没有 @）；真正的校验在 Clerk。 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CLERK_ERROR_TO_KEY: Readonly<Record<string, AuthErrorKey>> = {
  form_param_format_invalid: 'emailInvalid',
  form_identifier_invalid: 'emailInvalid',
  form_code_incorrect: 'codeIncorrect',
  verification_expired: 'codeExpired',
  verification_failed: 'tooManyAttempts',
  too_many_requests: 'tooManyAttempts',
  strategy_for_user_invalid: 'providerUnavailable',
  oauth_config_missing: 'providerUnavailable',
}

function errorKeyOf(err: unknown, fallback: AuthErrorKey): AuthErrorKey {
  if (!isClerkAPIResponseError(err)) return 'generic'
  const code = err.errors[0]?.code
  return (code && CLERK_ERROR_TO_KEY[code]) || fallback
}

function clerkErrorCode(err: unknown): string | undefined {
  return isClerkAPIResponseError(err) ? err.errors[0]?.code : undefined
}

export function useEmailCodeAuth() {
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn()
  const { isLoaded: signUpLoaded, signUp } = useSignUp()
  const clerk = useClerk()
  /* 地址都已带语段（`getPathname` / Clerk 算好的），所以用 Next 自己的路由，
     ⛔ 不用 next-intl 那个（会再前缀一次语段）。 */
  const router = useRouter()
  const locale = useLocale() as AppLocale

  const [step, setStep] = useState<AuthStep>('start')
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<Mode>('signIn')
  const [pending, setPending] = useState<AuthPending | null>(null)
  const [succeeded, setSucceeded] = useState(false)
  const [error, setError] = useState<AuthErrorKey | null>(null)
  /** 每次报错 +1：验证码框靠它知道「又错了一次」，要清空、回第一格。 */
  const [errorSerial, setErrorSerial] = useState(0)
  const [resendIn, setResendIn] = useState(0)
  const emailAddressId = useRef<string | null>(null)

  const ready = signInLoaded && signUpLoaded

  /* 重发冷却：一秒走一格，到 0 停。 */
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const fail = useCallback((key: AuthErrorKey) => {
    setError(key)
    setErrorSerial((n) => n + 1)
  }, [])

  const signInPath = getPathname({ locale, href: ROUTES.SIGN_IN })
  const signUpPath = getPathname({ locale, href: ROUTES.SIGN_UP })

  /** 交回 Clerk 预制组件的子路由，进行中的那次尝试由它接着走（`redirect_url` 随行）。 */
  const handOff = useCallback(
    (path: string) => {
      markAuthArrival()
      router.push(`${path}${window.location.search}`)
    },
    [router],
  )

  /**
   * 登完去哪：Clerk 按地址栏的 `redirect_url`（中间件拦下来时带的，按
   * `allowedRedirectOrigins` 校验过）算，没有就是 ClerkProvider 上配的工作台。
   */
  const afterAuthUrl = useCallback(
    (kind: Mode) => {
      const params = new URLSearchParams(window.location.search)
      return kind === 'signIn'
        ? clerk.buildAfterSignInUrl({ params })
        : clerk.buildAfterSignUpUrl({ params })
    },
    [clerk],
  )

  const finish = useCallback(
    async (sessionId: string | null, kind: Mode) => {
      if (!sessionId || !setActive) {
        fail('generic')
        return
      }
      await setActive({ session: sessionId })
      markAuthArrival()
      setSucceeded(true)
      const target = afterAuthUrl(kind)
      /* 键上的 ✓ 先停一拍，再走。 */
      window.setTimeout(() => router.push(target), AUTH_SUCCESS_HOLD_MS)
    },
    [afterAuthUrl, fail, router, setActive],
  )

  const sendCode = useCallback(async (): Promise<Mode> => {
    if (!signIn || !signUp) throw new Error('Clerk not loaded')
    const address = email.trim()
    try {
      const attempt = await signIn.create({ identifier: address })
      const factor = attempt.supportedFirstFactors?.find(
        (f) => f.strategy === 'email_code',
      )
      if (!factor || factor.strategy !== 'email_code') {
        throw new Error('email_code is not enabled for this user')
      }
      emailAddressId.current = factor.emailAddressId
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: factor.emailAddressId,
      })
      return 'signIn'
    } catch (err) {
      if (clerkErrorCode(err) !== 'form_identifier_not_found') throw err
      await signUp.create({ emailAddress: address })
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      return 'signUp'
    }
  }, [email, signIn, signUp])

  const submitEmail = useCallback(async () => {
    if (!ready || pending) return
    if (!EMAIL_SHAPE.test(email.trim())) {
      fail('emailInvalid')
      return
    }
    setError(null)
    setPending('email')
    try {
      const nextMode = await sendCode()
      setMode(nextMode)
      setResendIn(AUTH_RESEND_COOLDOWN_S)
      setStep('code')
    } catch (err) {
      fail(errorKeyOf(err, 'generic'))
    } finally {
      setPending(null)
    }
  }, [email, fail, pending, ready, sendCode])

  const verify = useCallback(
    async (code: string) => {
      if (!signIn || !signUp || pending || succeeded) return
      setError(null)
      setPending('code')
      try {
        if (mode === 'signIn') {
          const result = await signIn.attemptFirstFactor({
            strategy: 'email_code',
            code,
          })
          if (result.status === 'complete') {
            await finish(result.createdSessionId, 'signIn')
          } else if (result.status === 'needs_second_factor') {
            handOff(`${signInPath}/factor-two`)
          } else {
            fail('generic')
          }
        } else {
          const result = await signUp.attemptEmailAddressVerification({ code })
          if (result.status === 'complete') {
            await finish(result.createdSessionId, 'signUp')
          } else if (result.status === 'missing_requirements') {
            handOff(`${signUpPath}/continue`)
          } else {
            fail('generic')
          }
        }
      } catch (err) {
        fail(errorKeyOf(err, 'codeIncorrect'))
      } finally {
        setPending(null)
      }
    },
    [
      fail,
      finish,
      handOff,
      mode,
      pending,
      signIn,
      signInPath,
      signUp,
      signUpPath,
      succeeded,
    ],
  )

  const resend = useCallback(async () => {
    if (!signIn || !signUp || pending || resendIn > 0) return
    setError(null)
    setPending('resend')
    try {
      if (mode === 'signIn' && emailAddressId.current) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailAddressId.current,
        })
      } else {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      }
      setResendIn(AUTH_RESEND_COOLDOWN_S)
    } catch (err) {
      fail(errorKeyOf(err, 'generic'))
    } finally {
      setPending(null)
    }
  }, [fail, mode, pending, resendIn, signIn, signUp])

  const clearError = useCallback(() => setError(null), [])

  /** 「换邮箱」：回第一步，邮箱留在框里。 */
  const changeEmail = useCallback(() => {
    setError(null)
    setResendIn(0)
    setStep('start')
  }, [])

  const startSocial = useCallback(
    async (provider: AuthSocialProvider) => {
      if (!signIn || pending) return
      setError(null)
      setPending(provider.id)
      markAuthArrival()
      try {
        await signIn.authenticateWithRedirect({
          strategy: provider.strategy,
          redirectUrl: `${signInPath}/${AUTH_SSO_CALLBACK_SEGMENT}`,
          redirectUrlComplete: afterAuthUrl('signIn'),
        })
        /* 成功就整页跳走了，转圈留着直到页面卸下。 */
      } catch (err) {
        setPending(null)
        fail(errorKeyOf(err, 'providerUnavailable'))
      }
    },
    [afterAuthUrl, fail, pending, signIn, signInPath],
  )

  return {
    ready,
    step,
    email,
    setEmail,
    pending,
    succeeded,
    error,
    errorSerial,
    resendIn,
    submitEmail,
    verify,
    resend,
    changeEmail,
    startSocial,
    clearError,
  }
}

export type EmailCodeAuth = ReturnType<typeof useEmailCodeAuth>
