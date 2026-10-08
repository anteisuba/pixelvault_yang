'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { consumeAuthArrival } from '@/lib/auth-marks'

/**
 * 登进来之后的第一屏：底部黑条「已登录」（§7.1 那条 sonner 黑条）。
 *
 * 登录发生在首页弹窗 / 整页卡 / Google 跳转 / 一键框里，落地都在工作台，而黑条的
 * `<Toaster />` 只挂在应用壳里 —— 所以登录那一刻只记一笔（`markAuthArrival`），
 * 到了这里确认真的已登录才消费它。挂在 `(main)/layout.tsx`，与 `<Toaster />` 并排。
 */
export function AuthArrivalToast() {
  const { isLoaded, isSignedIn } = useAuth()
  const t = useTranslations('Toasts')

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (consumeAuthArrival()) toast.success(t('signedIn'))
  }, [isLoaded, isSignedIn, t])

  return null
}
