'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'

import { getPathname, usePathname } from '@/i18n/navigation'
import { LOCALES, type AppLocale } from '@/i18n/routing'

/**
 * 切语言那条路的**唯一**一份（D11 ④ 判据三：「语言改完谁来记」）。
 *
 * 给的是「切去哪」和「怎么切」的共同真值：当前 locale · 每种语言的落点（当前地址换前缀、
 * 原样带回 query）· 三档名册 · 切换动作。设置 → 偏好的分段控件与侧栏账号菜单里那一行
 * 都调它。
 *
 * ⭐ 切换是**整页导航**，⛔ 不用 next-intl 的 `router.replace(href, { locale })` /
 * `<Link locale>` 软导航。原因（2026-11-19 线上实测）：`(shell)/@library/(.)library/*`
 * 与 `(.)u/me` 是拦截路由，软导航时 Next 只看 `Next-Url` 是否落在 `[locale]` 这棵树里、
 * 不比 locale 值 —— 于是在 `/ja/library/tags` 切 ZH，请求被 `(.)library/tags` 接走：
 * 地址变成 `/zh/…`、分段条停在 ZH，整棵界面却还是日文，左边还多出一条拦截槽里的侧栏。
 * 换语言本来就要整棵树重挂（`[locale]` 段、`<html lang>`、Clerk 本地化都跟着换），
 * 整页导航不丢任何软导航能保住的东西。
 *
 * ⛔ 不要在消费方另算一份落点、另列一份 locale 名册、另存一份当前值、另写一种切法 ——
 * 一旦有第二份，「界面显示的」和「服务端认得的」就会开始漂。
 *
 * ⚠ 它读 `useSearchParams()`。⛔ 别把它提到常驻渲染的壳组件里（侧栏本体、
 * 手机顶栏），那会让整组路由在预渲染时 bail out 成客户端渲染；只在**按需
 * 挂载**的地方调用（账号菜单的语言段只在菜单打开后才存在，设置页偏好区是
 * 页面自己的内容）。
 */
export function useLocaleSwitch() {
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const queryString = searchParams.toString()

  /** 某种语言的落点：带前缀的完整路径 + 原样带回的 query。 */
  const hrefFor = (target: AppLocale) => {
    const path = getPathname({ locale: target, href: pathname })
    return queryString ? `${path}?${queryString}` : path
  }

  return {
    /** 当前 locale，与服务端同一份真值（next-intl 请求配置）。 */
    locale,
    hrefFor,
    /** 切到另一种语言：整页导航（见上面为什么不是软导航）。 */
    switchLocale: (target: AppLocale) => {
      if (target === locale) return
      window.location.assign(hrefFor(target))
    },
    /** 可选语言名册：en / ja / zh。 */
    locales: LOCALES,
  }
}

export type { AppLocale }
