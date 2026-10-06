'use client'

import { useCallback } from 'react'

import { keySettingsPath } from '@/constants/routes'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { usePathname, useRouter } from '@/i18n/navigation'

/**
 * 「配置渠道与 key」这条动作的唯一去处（D3 ④ 入口收口）：`/settings/keys`。
 *
 * 取代了原来的第二个抽屉（`ShellApiKeys` / `ApiKeyDrawerTrigger`）—— key 管理
 * 全站只剩 `/settings/keys` 一个地方，⛔ 不要再挂第二份界面。带上 `from=`
 * 当前路径，返回键能把用户送回原来的工作台。
 *
 * ⭐ 给了 `adapterType` 就直接落在那一家的配置弹窗上（选了没配 key 的模型走这条）；
 * 不给 = 只是去看 key 列表。⚠ 作为点击回调直接传下去时会被塞进一个事件对象，所以
 * 只认字符串。
 */
export function useOpenKeySettings(): (adapterType?: AI_ADAPTER_TYPES) => void {
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(
    (adapterType?: AI_ADAPTER_TYPES) => {
      router.push(
        keySettingsPath(
          pathname,
          typeof adapterType === 'string' ? adapterType : null,
        ),
      )
    },
    [pathname, router],
  )
}
