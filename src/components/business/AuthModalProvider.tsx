'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SignIn, SignUp } from '@clerk/nextjs'
import { useLocale, useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { getPathname } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { clerkModalAppearance } from '@/lib/clerk-appearance'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

import type { AuthModalIntent } from './AuthModalTrigger'

interface AuthModalContextValue {
  openAuth: (intent?: AuthModalIntent) => void
  closeAuth: () => void
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null)

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext)
  if (!ctx) {
    throw new Error('useAuthModal must be used within AuthModalProvider')
  }
  return ctx
}

/**
 * Haivis-style auth: keep the current page, dim + blur the background, show a
 * centered Clerk card. Path routes `/sign-in` and `/sign-up` remain for OAuth
 * and middleware deep links.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [intent, setIntent] = useState<AuthModalIntent>('sign-in')
  const locale = useLocale() as AppLocale
  const t = useTranslations('Homepage.auth')
  const tCommon = useTranslations('Common')

  const studioPath = getPathname({
    locale,
    href: ROUTES.STUDIO_IMAGE,
  })

  const openAuth = useCallback((next: AuthModalIntent = 'sign-in') => {
    setIntent(next)
    setOpen(true)
  }, [])

  const closeAuth = useCallback(() => setOpen(false), [])

  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth])

  const title = intent === 'sign-up' ? t('signUp.title') : t('signIn.title')
  const description =
    intent === 'sign-up' ? t('signUp.description') : t('signIn.description')
  const switchPrompt =
    intent === 'sign-up' ? t('signUp.switchPrompt') : t('signIn.switchPrompt')
  const switchAction =
    intent === 'sign-up' ? t('signUp.switchAction') : t('signIn.switchAction')

  const embeddedAppearance = {
    ...clerkModalAppearance,
    elements: {
      ...clerkModalAppearance.elements,
      // Card sits inside our Dialog chrome — no double frame.
      rootBox: 'w-full mx-auto',
      card: 'shadow-none border-0 bg-transparent w-full',
      cardBox: 'shadow-none w-full',
      // Footer “sign up / sign in” links go to path routes; we swap intent
      // ourselves below so the user never leaves the page.
      footerAction: 'hidden',
      footer: 'hidden',
    },
  }

  return (
    <AuthModalContext.Provider value={value}>
      {children}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          closeLabel={tCommon('close')}
          overlayClassName="bg-black/55 backdrop-blur-[6px]"
          className="z-[100] max-h-[min(92svh,720px)] w-full max-w-[calc(100%-1.5rem)] gap-0 overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-[420px]"
          aria-describedby="auth-modal-description"
        >
          <div className="relative rounded-2xl border border-neutral-200 bg-white px-5 pt-8 pb-5 shadow-2xl sm:px-7 sm:pt-9 sm:pb-6">
            <DialogTitle className="font-display text-center text-xl font-semibold tracking-tight text-neutral-950 sm:text-2xl">
              {title}
            </DialogTitle>
            <DialogDescription
              id="auth-modal-description"
              className="mt-2 text-center text-sm text-neutral-600"
            >
              {description}
            </DialogDescription>

            <div className="mt-5">
              {intent === 'sign-up' ? (
                <SignUp
                  routing="virtual"
                  appearance={embeddedAppearance}
                  fallbackRedirectUrl={studioPath}
                  signInFallbackRedirectUrl={studioPath}
                  forceRedirectUrl={studioPath}
                />
              ) : (
                <SignIn
                  routing="virtual"
                  appearance={embeddedAppearance}
                  fallbackRedirectUrl={studioPath}
                  signUpFallbackRedirectUrl={studioPath}
                  forceRedirectUrl={studioPath}
                />
              )}
            </div>

            <p className="mt-4 text-center text-sm text-neutral-600">
              <span>{switchPrompt} </span>
              <button
                type="button"
                className="font-semibold text-neutral-950 underline-offset-4 hover:underline"
                onClick={() =>
                  setIntent(intent === 'sign-in' ? 'sign-up' : 'sign-in')
                }
              >
                {switchAction}
              </button>
            </p>

            <p className="mt-3 text-center text-xs leading-relaxed text-neutral-500">
              {t('note')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </AuthModalContext.Provider>
  )
}
