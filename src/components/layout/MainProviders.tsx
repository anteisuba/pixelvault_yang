'use client'

import type { ReactNode } from 'react'

import { ROUTES } from '@/constants/routes'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { usePathname } from '@/i18n/navigation'
import { KeyboardInsetBridge } from '@/components/layout/KeyboardInsetBridge'

/**
 * MainProviders — client-side providers shared across all `(main)` pages.
 * Placed at MainLayout level so Navbar / MobileShell / CardDrawer can
 * consume ApiKeysContext without each page having to re-wrap it.
 */
export function MainProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const shouldLoadApiKeys =
    pathname === ROUTES.STUDIO ||
    pathname.startsWith(`${ROUTES.STUDIO}/`) ||
    pathname === ROUTES.STORYBOARD ||
    pathname.startsWith(`${ROUTES.STORYBOARD}/`) ||
    // /settings/keys 整页就是在看这份名单（D3 ④），不预载它进去就是一屏空白。
    pathname === ROUTES.SETTINGS ||
    pathname.startsWith(`${ROUTES.SETTINGS}/`)

  return (
    <>
      <KeyboardInsetBridge />
      <ApiKeysProvider autoLoad={shouldLoadApiKeys}>{children}</ApiKeysProvider>
    </>
  )
}
