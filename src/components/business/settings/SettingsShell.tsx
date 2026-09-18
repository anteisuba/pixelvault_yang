'use client'

import { useCallback } from 'react'
import { useClerk } from '@clerk/nextjs'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, LogOut } from '@/components/icons'

import { ROUTES, safeReturnPath, settingsPath } from '@/constants/routes'
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_ROUTES,
  type SettingsSection,
} from '@/constants/settings'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

interface SettingsShellProps {
  section: SettingsSection
  children: React.ReactNode
}

/**
 * `/settings` 的外壳（D3 ④ 画板）。
 *
 * 桌面：灰底地台上一张白卡 = 左 200px 分区导航（最底一行「退出登录」）+ 右内容
 * 720px。手机：⛔ 没有导航列，只有二级页——顶部一行「← 分区名」，返回键回一级
 * 列表（`/settings`）。
 */
export function SettingsShell({ section, children }: SettingsShellProps) {
  const t = useTranslations('Settings')
  const searchParams = useSearchParams()
  const from = safeReturnPath(searchParams.get('from'))

  return (
    <main className="min-h-full bg-background px-4 py-4 lg:bg-surface-workbench lg:px-6 lg:py-6">
      <div className="mx-auto flex w-full max-w-settings-shell overflow-hidden rounded-none border-0 bg-transparent lg:min-h-settings-shell lg:rounded-xl lg:border lg:border-border lg:bg-card lg:shadow-md">
        <SettingsNav section={section} from={from} />
        <div className="min-w-0 flex-1 lg:px-8 lg:py-6">
          <header className="mb-4 flex items-center gap-2 lg:hidden">
            <Link
              href={settingsPath(ROUTES.SETTINGS, from)}
              aria-label={t('backToList')}
              className="-ml-2 inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-5" />
            </Link>
            <h1 className="text-xl font-semibold">
              {t(`sections.${section}`)}
            </h1>
          </header>
          <div className="w-full max-w-settings">{children}</div>
        </div>
      </div>
    </main>
  )
}

function SettingsNav({
  section,
  from,
}: {
  section: SettingsSection
  from: string | null
}) {
  const t = useTranslations('Settings')

  return (
    <nav
      aria-label={t('title')}
      className="hidden w-settings-nav shrink-0 flex-col gap-0.5 border-r border-border px-3.5 py-5 lg:flex"
    >
      <h1 className="px-2.5 pb-3 text-lg font-semibold">{t('title')}</h1>
      {SETTINGS_SECTIONS.map((item) => (
        <Link
          key={item}
          href={settingsPath(SETTINGS_SECTION_ROUTES[item], from)}
          aria-current={item === section ? 'page' : undefined}
          className={cn(
            'rounded-md px-2.5 py-2 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            item === section
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {t(`sections.${item}`)}
        </Link>
      ))}
      <div className="flex-1" />
      <SignOutRow />
    </nav>
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
      className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <LogOut className="size-4" />
      {t('signOut')}
    </button>
  )
}
