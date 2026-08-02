'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { SignIn } from '@clerk/nextjs'
import { useLocale, useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { getPathname } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { clerkAuthAppearance } from '@/lib/clerk-appearance'
import { AuthCard } from '@/components/business/auth/AuthCard'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

interface AuthDialogContextValue {
  openAuth: () => void
  closeAuth: () => void
}

const AuthDialogContext = createContext<AuthDialogContextValue | null>(null)

export function useAuthDialog(): AuthDialogContextValue {
  const value = useContext(AuthDialogContext)
  if (!value) {
    throw new Error('useAuthDialog must be used inside AuthDialogProvider')
  }
  return value
}

/**
 * Auth without leaving the page: the marketing surface stays mounted behind a
 * dimmed backdrop and the window opens in place.
 *
 * One door, not two. `withSignUp` turns this into Clerk's combined
 * sign-in-or-up flow, so the visitor types an email and Clerk decides whether
 * that is a return or a first visit — which is why the header needs only one
 * button and the card only one heading.
 *
 * `routing="virtual"` keeps the flow's internal steps (email → code) off the
 * URL. The `/sign-in` and `/sign-up` routes stay in place regardless: OAuth
 * comes back to them, the middleware redirects to them, and email links point
 * at them. They render the same card.
 */
export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const locale = useLocale() as AppLocale
  const t = useTranslations('Auth')
  const tCommon = useTranslations('Common')

  const openAuth = useCallback(() => setOpen(true), [])
  const closeAuth = useCallback(() => setOpen(false), [])
  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth])

  const studioPath = getPathname({ locale, href: ROUTES.STUDIO_IMAGE })

  return (
    <AuthDialogContext.Provider value={value}>
      {children}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="auth-dialog auth-surface"
          closeLabel={t('close')}
          /* Radix hands focus to the first focusable child, which here is the
             close button — so the window opened with a focus ring drawn around
             its own dismiss control, reading as a highlighted X. Focus moves to
             the panel instead: the trap still works, tabbing still starts at the
             top, and nothing is ringed at rest. The widget's own field cannot be
             the target because Clerk mounts it a beat later. */
          ref={panelRef}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            panelRef.current?.focus()
          }}
        >
          <AuthCard
            title={
              <DialogTitle className="auth-title">
                {t('title', { brand: tCommon('brand') })}
              </DialogTitle>
            }
            description={
              <DialogDescription className="auth-subtitle">
                {t('subtitle')}
              </DialogDescription>
            }
          >
            {/* Mounted only while open so the widget starts at step one every
                time, rather than reopening on the code screen of an abandoned
                attempt. */}
            {open ? (
              <SignIn
                routing="virtual"
                withSignUp
                fallbackRedirectUrl={studioPath}
                signUpFallbackRedirectUrl={studioPath}
                appearance={clerkAuthAppearance}
              />
            ) : null}
          </AuthCard>
        </DialogContent>
      </Dialog>
    </AuthDialogContext.Provider>
  )
}
