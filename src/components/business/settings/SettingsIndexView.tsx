'use client'

import { useCallback, useEffect } from 'react'
import { useClerk } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ChevronRight, LogOut } from '@/components/icons'

import { ROUTES, safeReturnPath, settingsPath } from '@/constants/routes'
import {
  SETTINGS_DEFAULT_SECTION,
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_ROUTES,
} from '@/constants/settings'
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'
import { useProviderKeyRows } from '@/hooks/use-provider-key-rows'
import { Link, useRouter } from '@/i18n/navigation'

/**
 * `/settings` 本身（D3 ④）。
 *
 * 桌面：这条路由没有内容，进来就重定向到第一个分区（`/settings/keys`）。
 * 手机：停在一级列表，点一行进二级页。
 *
 * ⚠ 判据用**挂载时读一次 `innerWidth`**，不是 `useIsMobile()`：后者首帧恒为
 * false，手机上会先被弹去 keys 再也回不到列表。
 */
export function SettingsIndexView() {
  const t = useTranslations('Settings')
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = safeReturnPath(searchParams.get('from'))
  const { invalidKeyCount } = useProviderKeyRows()

  useEffect(() => {
    if (window.innerWidth >= MOBILE_BREAKPOINT) {
      router.replace(
        settingsPath(SETTINGS_SECTION_ROUTES[SETTINGS_DEFAULT_SECTION], from),
      )
    }
    // 只在挂载时判一次：窗口后来被拉宽不该把用户从列表里弹走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="min-h-full bg-background px-4 py-4 lg:hidden">
      <header className="flex items-center gap-2">
        <Link
          href={from ?? ROUTES.STUDIO}
          aria-label={t('back')}
          className="-ml-2 inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
      </header>

      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section}>
            <Link
              href={settingsPath(SETTINGS_SECTION_ROUTES[section], from)}
              className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-3 text-base transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{t(`sections.${section}`)}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {section === SETTINGS_SECTION_IDS.keys &&
                invalidKeyCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <span className="size-2 shrink-0 rounded-full bg-destructive" />
                    {t('keys.invalidSummary', { count: invalidKeyCount })}
                  </span>
                ) : null}
                <ChevronRight className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <SignOutRow />
    </main>
  )
}

function SignOutRow() {
  const t = useTranslations('Settings')
  const { signOut } = useClerk()
  const handleSignOut = useCallback(() => {
    void signOut({ redirectUrl: ROUTES.HOME })
  }, [signOut])

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <LogOut className="size-4" />
      {t('signOut')}
    </button>
  )
}
