'use client'

import { useEffect, useId } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { SLOW_LOADING_NOTICE_MS } from '@/constants/motion'

/**
 * 等太久（owner 2026-10-08 加载中）：`loading` 连续为真超过 6 秒，底部黑条写
 * 「网有点慢，还在加载」（同提示与弹窗那条 sonner 黑条，进行中 = 转圈）；数据到了
 * （`loading` 变假）或这一块卸下，黑条自己收掉。⛔ 不带动作、⛔ 不自己消失。
 *
 * 每个调用方各占一条（`useId`），两处同时慢也不会互相收掉对方的。
 */
export function useSlowLoadingNotice(loading: boolean): void {
  const t = useTranslations('Feedback')
  const toastId = `slow-loading-${useId()}`
  const message = t('slowLoading')

  useEffect(() => {
    if (!loading) return
    const timer = window.setTimeout(() => {
      toast.loading(message, { id: toastId, duration: Infinity })
    }, SLOW_LOADING_NOTICE_MS)
    return () => {
      window.clearTimeout(timer)
      toast.dismiss(toastId)
    }
  }, [loading, message, toastId])
}
