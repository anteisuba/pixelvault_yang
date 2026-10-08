'use client'

import { useEffect, useState } from 'react'
import { GoogleOneTap, useAuth } from '@clerk/nextjs'
import { useLocale } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { getPathname } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import {
  hasShownOneTap,
  markAuthArrival,
  markOneTapShown,
} from '@/lib/auth-marks'

/**
 * Google 一键框（Clerk `<GoogleOneTap />`，owner 2026-10-08 登录注册）。
 *
 * · 只给**确定未登录**的访客（Clerk 还没解析出来时不挂）。
 * · 一次访问只出一次：挂上就记进 sessionStorage，关掉之后这一趟不再出。Clerk 的
 *   组件没有「被关掉」回调（FedCM 下那个框是浏览器自己的界面，页面里没有节点可
 *   观察），所以「出过一次」就当「看过了」—— 点了登录本来也会离开这一页。
 * · 出现即记一笔「刚发起登录」：从这里登进去，到工作台时底部黑条说「已登录」。
 */
export function AuthOneTap() {
  const { isLoaded, isSignedIn } = useAuth()
  const locale = useLocale() as AppLocale
  const signedOut = isLoaded && !isSignedIn

  /* 只在确定未登录之后才去读这次访问出没出过（服务端与首帧都还不知道）。 */
  const [decision, setDecision] = useState<'unknown' | 'show' | 'skip'>(
    'unknown',
  )
  if (signedOut && decision === 'unknown') {
    setDecision(hasShownOneTap() ? 'skip' : 'show')
  }

  useEffect(() => {
    if (decision !== 'show') return
    markOneTapShown()
    markAuthArrival()
  }, [decision])

  if (!signedOut || decision !== 'show') return null

  const studioPath = getPathname({ locale, href: ROUTES.STUDIO_IMAGE })
  return (
    <GoogleOneTap
      signInForceRedirectUrl={studioPath}
      signUpForceRedirectUrl={studioPath}
    />
  )
}
