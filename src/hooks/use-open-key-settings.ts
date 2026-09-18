'use client'

import { useCallback } from 'react'

import { ROUTES, settingsPath } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'

/**
 * 「配置渠道与 key」这条动作的唯一去处（D3 ④ 入口收口）：`/settings/keys`。
 *
 * 取代了原来的第二个抽屉（`ShellApiKeys` / `ApiKeyDrawerTrigger`）—— key 管理
 * 全站只剩 `/settings/keys` 一个地方，⛔ 不要再挂第二份界面。带上 `from=`
 * 当前路径，返回键能把用户送回原来的工作台。
 *
 * 缺 key 时的**就地**配置仍由 `QuickSetupDialog` 负责（Hard Rule 8），
 * 与本入口的「通盘管理」不重叠。
 */
export function useOpenKeySettings(): () => void {
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(() => {
    router.push(settingsPath(ROUTES.SETTINGS_KEYS, pathname))
  }, [pathname, router])
}
