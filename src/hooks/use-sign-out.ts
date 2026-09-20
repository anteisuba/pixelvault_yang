'use client'

import { useCallback } from 'react'
import { useClerk } from '@clerk/nextjs'

import { ROUTES } from '@/constants/routes'

/**
 * 退出登录的**唯一**一条路：Clerk `signOut` + 回首页。
 *
 * `/settings` 的两处导航底部与侧栏账号菜单都调它 —— 这三处原本各抄了一份
 * 同样的三行，⛔ 别再抄第四份。
 *
 * ⛔ 不做二次确认：退出不丢数据（D11 ④ 判据五）。
 */
export function useSignOut() {
  const { signOut } = useClerk()

  return useCallback(() => {
    void signOut({ redirectUrl: ROUTES.HOME })
  }, [signOut])
}
