'use client'

import type { ReactNode } from 'react'
import { MotionConfig } from 'motion/react'

import { ROUTES } from '@/constants/routes'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import {
  useGenerationCompleteNotifier,
  useReduceMotionPreference,
} from '@/features/settings/hooks'
import { usePathname } from '@/i18n/navigation'
import { KeyboardInsetBridge } from '@/components/layout/KeyboardInsetBridge'
import { QueryUserBoundary } from '@/components/layout/QueryUserBoundary'

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
    // /settings/keys 整页就是在看这份名单（D3 ④），不预载它进去就是一屏空白。
    pathname === ROUTES.SETTINGS ||
    pathname.startsWith(`${ROUTES.SETTINGS}/`)
  // 设置 › 偏好的两颗开关在这里生效：减少动效（开 = 一律减弱；关 = 跟随系统）、生成完成时通知。
  const reduceMotion = useReduceMotionPreference()
  useGenerationCompleteNotifier()

  return (
    <>
      <KeyboardInsetBridge />
      <QueryUserBoundary />
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        <ApiKeysProvider autoLoad={shouldLoadApiKeys}>
          {children}
        </ApiKeysProvider>
      </MotionConfig>
    </>
  )
}
