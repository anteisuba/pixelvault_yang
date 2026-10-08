'use client'

import { useEffect, useId, useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { AUTH_SOCIAL_PROVIDERS, type AuthMethod } from '@/constants/auth'
import { SPRING } from '@/constants/motion'
import {
  useEmailCodeAuth,
  type AuthErrorKey,
  type EmailCodeAuth,
} from '@/hooks/use-email-code-auth'
import { authMethodFromStrategy } from '@/lib/auth-marks'
import { AuthCodeInput } from '@/components/business/auth/AuthCodeInput'
import { AuthProviderLogo } from '@/components/business/auth/AuthProviderLogo'
import { Check } from '@/components/icons'
import {
  AuthSubmitButton,
  type AuthButtonState,
} from '@/components/business/auth/AuthSubmitButton'
import { BlurSwap, useBlurSwapIn } from '@/components/ui/blur-swap'
import { RollingNumber } from '@/components/ui/rolling-number'
import { Spinner } from '@/components/ui/spinner'

/**
 * 卡里那一块：社交三家 + 邮箱验证码，两步（`docs/references/pages/auth.md`）。
 *
 * 换步时卡高走弹簧（`SPRING.slot`，几乎不过冲），新一步的内容由糊变清进来
 * （`useBlurSwapIn`）。`prefers-reduced-motion` 下高度直接跳、不糊。
 */
export function AuthFlow() {
  const flow = useEmailCodeAuth()
  const { client } = useClerk()
  const lastUsed = authMethodFromStrategy(client?.lastAuthenticationStrategy)
  const reduceMotion = useReducedMotion()
  const swap = useBlurSwapIn(flow.step)

  /* 量当前这一步的高，外层把高度弹过去。初值 `auto`：第一次挂上不动。 */
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  useEffect(() => {
    if (!content) return
    const observer = new ResizeObserver(([entry]) =>
      setHeight(
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
      ),
    )
    observer.observe(content)
    return () => observer.disconnect()
  }, [content])

  return (
    <>
      <motion.div
        className="auth-flow"
        initial={false}
        animate={{ height }}
        transition={reduceMotion ? { duration: 0 } : SPRING.slot}
      >
        <motion.div ref={setContent} key={flow.step} {...swap}>
          {flow.step === 'start' ? (
            <StartStep flow={flow} lastUsed={lastUsed} />
          ) : (
            <CodeStep flow={flow} />
          )}
        </motion.div>
      </motion.div>
      {/* Clerk 的人机校验挂点：自建流程里注册那一下要它在 DOM 里。 */}
      <div id="clerk-captcha" className="auth-captcha" />
    </>
  )
}

function useErrorText() {
  const t = useTranslations('Auth')
  return (key: AuthErrorKey): string => {
    switch (key) {
      case 'emailInvalid':
        return t('errors.emailInvalid')
      case 'codeIncorrect':
        return t('errors.codeIncorrect')
      case 'codeExpired':
        return t('errors.codeExpired')
      case 'tooManyAttempts':
        return t('errors.tooManyAttempts')
      case 'providerUnavailable':
        return t('errors.providerUnavailable')
      case 'generic':
        return t('errors.generic')
    }
  }
}

/** 一行红点 + 一句话（⛔ 整行变红，字照旧是墨色：红字在米色卡上不够 4.5:1）。 */
function AuthErrorLine({ error }: { error: AuthErrorKey | null }) {
  const errorText = useErrorText()
  if (!error) return null
  return (
    <p className="auth-error" role="alert">
      <span className="auth-error-dot" aria-hidden />
      {errorText(error)}
    </p>
  )
}

function LastUsedPill() {
  const t = useTranslations('Auth')
  return <span className="auth-last-used">{t('lastUsed')}</span>
}

function StartStep({
  flow,
  lastUsed,
}: {
  flow: EmailCodeAuth
  lastUsed: AuthMethod | null
}) {
  const t = useTranslations('Auth')
  const emailId = useId()
  const busy = flow.pending !== null || flow.succeeded

  const buttonState: AuthButtonState = flow.succeeded
    ? 'done'
    : flow.pending === 'email'
      ? 'pending'
      : 'idle'

  return (
    <div className="auth-step">
      <div className="auth-socials">
        {AUTH_SOCIAL_PROVIDERS.map((provider) => {
          const isPending = flow.pending === provider.id
          return (
            <button
              key={provider.id}
              type="button"
              className="auth-social"
              data-last-used={lastUsed === provider.id || undefined}
              disabled={!flow.ready || busy}
              aria-busy={isPending || undefined}
              onClick={() => void flow.startSocial(provider)}
            >
              <AuthProviderLogo provider={provider.id} />
              <BlurSwap
                swapKey={isPending ? 'pending' : 'idle'}
                className="gap-1.5"
              >
                {isPending ? (
                  <>
                    <Spinner size="sm" aria-hidden />
                    {t('redirecting', { provider: provider.label })}
                  </>
                ) : (
                  t('continueWith', { provider: provider.label })
                )}
              </BlurSwap>
              {lastUsed === provider.id ? <LastUsedPill /> : null}
            </button>
          )
        })}
      </div>

      <div className="auth-divider-row" role="presentation">
        <span className="auth-divider-line" />
        <span className="auth-divider-text">{t('or')}</span>
        <span className="auth-divider-line" />
      </div>

      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void flow.submitEmail()
        }}
      >
        <label htmlFor={emailId} className="auth-label-hidden">
          {t('emailLabel')}
        </label>
        <div
          className="auth-field"
          data-last-used={lastUsed === 'email' || undefined}
        >
          <input
            id={emailId}
            className="auth-input"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            placeholder={t('emailPlaceholder')}
            value={flow.email}
            aria-invalid={flow.error === 'emailInvalid' || undefined}
            disabled={busy}
            onChange={(event) => {
              flow.setEmail(event.target.value)
              if (flow.error) flow.clearError()
            }}
          />
          {lastUsed === 'email' ? <LastUsedPill /> : null}
        </div>
        <AuthErrorLine error={flow.error} />
        <AuthSubmitButton
          state={buttonState}
          pendingLabel={t('sending')}
          disabled={!flow.ready}
        >
          {t('continue')}
        </AuthSubmitButton>
      </form>
    </div>
  )
}

/** 验证码步最底那一行：等重发 / 可重发 / 重发中 / 验证中 / 已登录，换的时候一糊。 */
type CodeRowMode = 'verifying' | 'done' | 'wait' | 'ready' | 'resending'

function CodeStep({ flow }: { flow: EmailCodeAuth }) {
  const t = useTranslations('Auth')
  const codeError =
    flow.error === 'codeIncorrect' || flow.error === 'codeExpired'
  const locked = flow.pending === 'code' || flow.succeeded

  const row: CodeRowMode = flow.succeeded
    ? 'done'
    : flow.pending === 'code'
      ? 'verifying'
      : flow.pending === 'resend'
        ? 'resending'
        : flow.resendIn > 0
          ? 'wait'
          : 'ready'

  return (
    <div className="auth-step">
      <p className="auth-code-sent">
        {t.rich('codeSentTo', {
          email: flow.email.trim(),
          b: (chunks) => <b>{chunks}</b>,
        })}{' '}
        <button
          type="button"
          className="auth-text-button"
          disabled={locked}
          onClick={flow.changeEmail}
        >
          {t('changeEmail')}
        </button>
      </p>

      {/* 填满就自己提交，所以没有「验证」键：键上的转圈与 ✓ 写在最底那一行。 */}
      <div className="auth-form">
        <AuthCodeInput
          label={t('codeLabel')}
          invalid={codeError}
          errorSerial={flow.errorSerial}
          disabled={locked}
          onComplete={(value) => void flow.verify(value)}
          onEdit={flow.clearError}
        />
        <AuthErrorLine error={flow.error} />
      </div>

      <p className="auth-resend" aria-live="polite">
        <BlurSwap swapKey={row} className="gap-1.5">
          {row === 'verifying' ? (
            <>
              <Spinner size="sm" aria-hidden />
              {t('verifying')}
            </>
          ) : row === 'done' ? (
            <>
              <Check className="size-3.5" aria-hidden />
              {t('signedIn')}
            </>
          ) : row === 'wait' ? (
            t.rich('resendIn', {
              seconds: () => <RollingNumber value={flow.resendIn} />,
            })
          ) : row === 'resending' ? (
            <>
              <Spinner size="sm" aria-hidden />
              {t('sending')}
            </>
          ) : (
            <>
              {t('resendPrompt')}
              <button
                type="button"
                className="auth-text-button"
                onClick={() => void flow.resend()}
              >
                {t('resend')}
              </button>
            </>
          )}
        </BlurSwap>
      </p>
    </div>
  )
}
