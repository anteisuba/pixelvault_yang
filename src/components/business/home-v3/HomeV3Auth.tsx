'use client'

import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import { useAuthDialog } from '@/components/business/auth/AuthDialog'

/**
 * The header's single auth door.
 *
 * It looks identical whether or not anyone is signed in — same label, same
 * width, same position — and only its behaviour changes: a visitor with a live
 * session goes straight through to the workbench, everyone else gets the window.
 *
 * Keeping the appearance fixed is what lets the marketing page stay honest. It
 * is statically rendered and edge cached, so the server cannot know who is
 * looking; an auth-aware *appearance* has to wait for Clerk to resolve on the
 * client, which meant the header sat on a placeholder and then re-flowed. A
 * button that never changes has nothing to wait for.
 *
 * One door, not two. The window runs Clerk's combined sign-in-or-up flow and
 * works out from the address whether this is a return or a first visit, so a
 * second "sign up" button would be a second route to the same screen.
 */
export function HomeV3Auth() {
  const t = useTranslations('Auth')
  const { isLoaded, isSignedIn } = useAuth()
  const { openAuth } = useAuthDialog()
  const router = useRouter()

  return (
    <button
      type="button"
      className="home-v3-pill home-v3-pill--solid"
      onClick={() => {
        /* Not yet resolved: fall through to the window rather than guess. Clerk
           forwards an already-signed-in visitor on its own, so the worst case is
           one extra beat, never a wrong destination. */
        if (isLoaded && isSignedIn) {
          router.push(ROUTES.STUDIO_IMAGE)
          return
        }
        openAuth()
      }}
    >
      {t('open')}
    </button>
  )
}
