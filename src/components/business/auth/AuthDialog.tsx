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
import { useTranslations } from 'next-intl'

import { AuthCard } from '@/components/business/auth/AuthCard'
import { AuthFlow } from '@/components/business/auth/AuthFlow'
import { AuthOneTap } from '@/components/business/auth/AuthOneTap'
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
 * One door, not two. `AuthFlow` tries the address as a sign-in and turns it
 * into a sign-up when Clerk has never seen it, so the header needs only one
 * button and the card only one heading. Its steps (email → code) never touch
 * the URL. The `/sign-in` and `/sign-up` routes stay in place regardless: OAuth
 * comes back to them, the middleware redirects to them, and email links point
 * at them. They render the same card.
 *
 * The window grows out of the button that opened it and shrinks back into it
 * (`growFromPointer`, the same move as the settings key dialog). The Google
 * One Tap prompt is mounted here too, because this provider is what wraps the
 * signed-out marketing home.
 */
export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const t = useTranslations('Auth')
  const tCommon = useTranslations('Common')

  const openAuth = useCallback(() => setOpen(true), [])
  const closeAuth = useCallback(() => setOpen(false), [])
  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth])

  return (
    <AuthDialogContext.Provider value={value}>
      {children}

      <AuthOneTap />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="auth-dialog auth-surface"
          closeLabel={t('close')}
          growFromPointer
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
            {open ? <AuthFlow /> : null}
          </AuthCard>
        </DialogContent>
      </Dialog>
    </AuthDialogContext.Provider>
  )
}
