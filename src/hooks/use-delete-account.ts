'use client'

import { useCallback, useState } from 'react'
import { useClerk, useUser } from '@clerk/nextjs'

import { ROUTES } from '@/constants/routes'

/**
 * 注销账号（设置页 · 偏好最底那一行，owner 2026-10-08「提示与弹窗」）。
 *
 * 只删 Clerk 账号：`user.delete()` 是 Clerk SDK 自己的接口（不是我们的 API，
 * 不走 api-client）。服务端那一侧由 Clerk 的 `user.deleted` webhook 接住
 * （`softDeleteUser`：标记删除、主页转私密），⛔ 这里不另开一条删数据的路。
 *
 * 删完退出登录、回首页。成功返回 `true`；失败（比如 Clerk 要求重新验证身份）
 * 返回 `false`，调用方说一句并让人可以再试。
 */
export function useDeleteAccount() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const [isDeleting, setIsDeleting] = useState(false)

  const deleteAccount = useCallback(async (): Promise<boolean> => {
    if (!user) return false
    setIsDeleting(true)
    try {
      await user.delete()
    } catch {
      setIsDeleting(false)
      return false
    }
    // 账号已经没了：会话多半也跟着失效，退出失败也照样回首页。
    try {
      await signOut({ redirectUrl: ROUTES.HOME })
    } catch {
      window.location.assign(ROUTES.HOME)
    }
    return true
  }, [signOut, user])

  return { deleteAccount, isDeleting }
}
