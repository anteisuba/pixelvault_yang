'use client'

import { useAuth } from '@clerk/nextjs'
import { useLocale, useTranslations } from 'next-intl'

import { HOME_V4_ROUTES } from '@/constants/homepage-v4'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { LOCALES } from '@/i18n/routing'
import { useAuthDialog } from '@/components/business/auth/AuthDialog'

/**
 * 浮岛登录条 — a centred capsule, not a full-width bar.
 *
 * Three things and a spacer: brand, language, the one door. The 功能 / 模型
 * jump links are gone — owner's 2026-08-28 review put the bar back to what the
 * live marketing home has always had, and neither the links nor the page ids
 * they carried survive anywhere else.
 *
 * `--bar` still exists but no longer describes this element's box: it is only
 * the top inset `.page-inner` reserves, and the island (14px + ~53px tall) fits
 * inside it.
 *
 * ⛔ **首页顶栏不承载应用壳的 chrome**（owner 2026-09-20 真机后定）：这里既没有
 * 齿轮也没有头像。设置只有一个门（登录后侧栏最底，`settings.md` §入口 D3），
 * 个人主页也是壳里的东西 —— 把它们搬到营销页的门厅，只会让「设置在哪」「我的
 * 主页在哪」各多出一个答案。
 *
 * 右端因此只剩**一颗入口按钮**，文案随登录态换：未登录「登录」（现有 Clerk
 * 入口），已登录「进入工作台」（`HOME_V4_ROUTES.studio`，⛔ 不手写路径）。
 * 它在 Clerk 解析出来之前就按「登录」画出来 —— 边缘缓存的营销页不必等鉴权，
 * 而 Clerk 会把已登录访客自己转走。
 */
export function HomeV4Topbar() {
  const tAuth = useTranslations('Auth')
  const tCommon = useTranslations('Common')
  const tLocale = useTranslations('LocaleSwitcher')
  const activeLocale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { openAuth } = useAuthDialog()

  const isIn = isLoaded && isSignedIn

  return (
    <header className="topbar">
      <Link href={HOME_V4_ROUTES.home} className="logo">
        {tCommon('brand')}
      </Link>

      <span className="spacer" />

      <nav className="locales" aria-label={tLocale('label')}>
        {LOCALES.map((locale) => (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            title={tLocale(`names.${locale}`)}
            aria-current={locale === activeLocale ? 'true' : undefined}
            data-active={locale === activeLocale ? true : undefined}
          >
            {tLocale(`options.${locale}`)}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        className="login"
        onClick={() => {
          if (isIn) {
            router.push(HOME_V4_ROUTES.studio)
            return
          }
          openAuth()
        }}
      >
        {isIn ? tAuth('enterStudio') : tAuth('open')}
      </button>
    </header>
  )
}
