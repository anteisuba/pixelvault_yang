'use client'

import type { ReactNode } from 'react'

import { ROUTES } from '@/constants/routes'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { usePathname } from '@/i18n/navigation'

/**
 * MainProviders — client-side providers shared across all `(main)` pages.
 * Placed at MainLayout level so Navbar / MobileTabBar / CardDrawer can
 * consume ApiKeysContext without each page having to re-wrap it.
 */
export function MainProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const shouldLoadApiKeys =
    pathname === ROUTES.STUDIO ||
    pathname.startsWith(`${ROUTES.STUDIO}/`) ||
    pathname === ROUTES.ARENA ||
    pathname.startsWith(`${ROUTES.ARENA}/`) ||
    pathname === ROUTES.STORYBOARD ||
    pathname.startsWith(`${ROUTES.STORYBOARD}/`)

  return (
    <ApiKeysProvider autoLoad={shouldLoadApiKeys}>{children}</ApiKeysProvider>
  )
}
