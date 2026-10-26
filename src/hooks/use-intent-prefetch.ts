'use client'

import { useCallback } from 'react'

import { useRouter } from '@/i18n/navigation'

/**
 * 外壳导航的预取改成「要去才取」：鼠标移上去 / 键盘走到才 `router.prefetch`。
 * 一直摆着的那几颗（左栏、台条）`prefetch={false}` —— 默认的进视口预取每换一次台就把整排库页、
 * 台条上的台全拉一遍（实测每次 5–13 个 `_rsc`，10-26），挤掉真正要去的那一页。
 * 点开才弹出来的挑选条照默认：弹出来那一刻就是「要去」，进视口预取正合适。
 */
export function useIntentPrefetch(): (href: string) => {
  onPointerEnter: () => void
  onFocus: () => void
} {
  const router = useRouter()
  return useCallback(
    (href: string) => {
      const prefetch = () => router.prefetch(href)
      return { onPointerEnter: prefetch, onFocus: prefetch }
    },
    [router],
  )
}
