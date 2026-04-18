'use client'

import type { ReactNode } from 'react'

import { ApiKeysProvider } from '@/contexts/api-keys-context'

/**
 * MainProviders — client-side providers shared across all `(main)` pages.
 * Placed at MainLayout level so Navbar / MobileTabBar / CardDrawer can
 * consume ApiKeysContext without each page having to re-wrap it.
 */
export function MainProviders({ children }: { children: ReactNode }) {
  return <ApiKeysProvider>{children}</ApiKeysProvider>
}
