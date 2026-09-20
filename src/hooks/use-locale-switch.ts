'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'

import { usePathname } from '@/i18n/navigation'
import { LOCALES, type AppLocale } from '@/i18n/routing'

/**
 * 切语言那条路的**唯一**一份（D11 ④ 判据三：「语言改完谁来记」）。
 *
 * 切换动作本身是 next-intl 的 `<Link locale={…}>` 做的 —— 它重写地址前缀，
 * 服务端据此认下一次请求的语言。这个 hook 给的是「切去哪」的共同真值：
 * 当前 locale · 保留 query 的落点 · 三档名册。设置 → 偏好的分段控件与侧栏
 * 账号菜单里那一行都调它。
 *
 * ⛔ 不要在消费方另算一份 href、另列一份 locale 名册、另存一份当前值 ——
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

  return {
    /** 当前 locale，与服务端同一份真值（next-intl 请求配置）。 */
    locale,
    /** 切换落点：当前地址原样带回 query。配 `<Link locale={…}>` 用。 */
    href: queryString ? `${pathname}?${queryString}` : pathname,
    /** 可选语言名册：en / ja / zh。 */
    locales: LOCALES,
  }
}

export type { AppLocale }
