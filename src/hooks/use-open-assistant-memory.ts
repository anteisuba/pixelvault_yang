'use client'

import { useCallback } from 'react'

import { ROUTES, settingsPath } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'

/**
 * 「本轮记住 N 件事」那一行点下去的去处（56a）：`/settings/assistant`。
 *
 * 形状与 `use-open-key-settings.ts` 逐字同源 —— 带上 `from=` 当前路径，
 * 返回键能把用户送回原来的工作台（⛔ 别在组件里各写一遍判据，
 * `settingsPath` / `safeReturnPath` 是进出两侧共用的那一份）。
 */
export function useOpenAssistantMemory(): () => void {
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(() => {
    router.push(settingsPath(ROUTES.SETTINGS_ASSISTANT, pathname))
  }, [pathname, router])
}
