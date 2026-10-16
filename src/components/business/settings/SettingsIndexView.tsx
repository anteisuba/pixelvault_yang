'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft,
  Gauge,
  ChevronRight,
  FileText,
  KeyRound,
  Link2,
  MessagesSquare,
  type Icon,
} from '@/components/icons'

import { ROUTES, safeReturnPath, settingsPath } from '@/constants/routes'
import {
  SETTINGS_DEFAULT_SECTION,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTION_ROUTES,
  type SettingsSection,
} from '@/constants/settings'
import { DESK_BREAKPOINT } from '@/hooks/use-mobile'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useProviderKeyRows } from '@/hooks/use-provider-key-rows'
import { Link, useRouter } from '@/i18n/navigation'

import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { SettingsPreferenceRows } from '@/components/business/settings/SettingsPreferencesSection'
import { SettingsSignOutButton } from '@/components/business/settings/SettingsShell'

const GROUP_CLASS =
  'mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card'
const ROW_CLASS =
  'flex min-h-12 items-center gap-3 px-3.5 py-2.5 text-base transition-colors duration-fast active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

/**
 * `/settings` 本身 = 手机的「我的」（iOS 稿 owner 2026-10-16：设置页取消，内容全部
 * 摊在「我的」上，退出登录放最底）。分组列表：主页卡 · 提示词 · 渠道与密钥 / 用量 ·
 * 助手 / 连接 · 偏好（就地摊开）· 退出登录。
 *
 * 桌面：这条路由没有内容，进来就重定向到第一个分区（`/settings/keys`）。
 *
 * ⚠ 判据用**挂载时读一次 `innerWidth`**，不是 `useIsMobile()`：后者首帧恒为
 * false，手机上会先被弹去 keys 再也回不到列表。门槛与底栏、设置外壳同一档
 * （`DESK_BREAKPOINT`，`lg`）：底栏还在的宽度，「我的」就得停在这张列表上。
 */
export function SettingsIndexView() {
  const t = useTranslations('Settings')
  const tMobile = useTranslations('MobileNav')
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = safeReturnPath(searchParams.get('from'))

  useEffect(() => {
    if (window.innerWidth >= DESK_BREAKPOINT) {
      router.replace(
        settingsPath(SETTINGS_SECTION_ROUTES[SETTINGS_DEFAULT_SECTION], from),
      )
    }
    // 只在挂载时判一次：窗口后来被拉宽不该把用户从列表里弹走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="min-h-full bg-background px-4 py-4 lg:hidden">
      <header className="flex min-h-11 items-center gap-2">
        {/* 底栏「我的」是根页，没有返回；从别处带着 `from` 进来才给一颗 ←。 */}
        {from ? (
          <Link
            href={from}
            aria-label={t('back')}
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-5" />
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold">{tMobile('tabs.profile')}</h1>
      </header>

      <ProfileRow />

      <ul className={GROUP_CLASS}>
        <li>
          <HubRow
            href={ROUTES.PROMPTS}
            icon={FileText}
            label={tMobile('me.prompts')}
          />
        </li>
      </ul>

      <SectionGroup
        sections={[SETTINGS_SECTION_IDS.keys, SETTINGS_SECTION_IDS.usage]}
        from={from}
      />
      <SectionGroup
        sections={[
          SETTINGS_SECTION_IDS.assistant,
          SETTINGS_SECTION_IDS.connections,
        ]}
        from={from}
      />

      <h2 className="mt-6 px-3.5 text-xs text-muted-foreground">
        {t('sections.preferences')}
      </h2>
      <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-card px-3.5">
        <SettingsPreferenceRows className="*:first:border-t-0" />
      </div>

      <div className="mt-6 mb-4 flex justify-center rounded-xl border border-border bg-card">
        <SettingsSignOutButton className="min-h-12 self-center px-3.5 text-destructive hover:text-destructive" />
      </div>
    </main>
  )
}

const SECTION_ICONS: Partial<Record<SettingsSection, Icon>> = {
  [SETTINGS_SECTION_IDS.keys]: KeyRound,
  [SETTINGS_SECTION_IDS.usage]: Gauge,
  [SETTINGS_SECTION_IDS.assistant]: MessagesSquare,
  [SETTINGS_SECTION_IDS.connections]: Link2,
}

function SectionGroup({
  sections,
  from,
}: {
  sections: readonly SettingsSection[]
  from: string | null
}) {
  const t = useTranslations('Settings')
  const { invalidKeyCount } = useProviderKeyRows()

  return (
    <ul className={GROUP_CLASS}>
      {sections.map((section) => (
        <li key={section}>
          <HubRow
            href={settingsPath(SETTINGS_SECTION_ROUTES[section], from)}
            icon={SECTION_ICONS[section]}
            label={t(`sections.${section}`)}
          >
            {section === SETTINGS_SECTION_IDS.keys && invalidKeyCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-destructive">
                <span className="size-2 shrink-0 rounded-full bg-destructive" />
                {t('keys.invalidSummary', { count: invalidKeyCount })}
              </span>
            ) : null}
          </HubRow>
        </li>
      ))}
    </ul>
  )
}

function HubRow({
  href,
  icon: RowIcon,
  label,
  children,
}: {
  href: string
  icon?: Icon
  label: string
  children?: React.ReactNode
}) {
  return (
    <Link href={href} className={ROW_CLASS}>
      {RowIcon ? (
        <RowIcon className="size-5 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {children}
        <ChevronRight className="size-4" />
      </span>
    </Link>
  )
}

/** 主页卡：头像 + 名字 + @handle，点进 `/u/me`（主页与资料）。 */
function ProfileRow() {
  const tMobile = useTranslations('MobileNav')
  const { profile } = useMyProfile()
  const name = profile?.displayName ?? profile?.username

  return (
    <Link
      href={ROUTES.MY_PROFILE}
      className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors duration-fast active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProfileAvatar
        avatarUrl={profile?.avatarUrl}
        size={48}
        className="size-12"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-semibold">
          {name ?? tMobile('tabs.profile')}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {profile?.username ? (
            // @handle 是机器串，走等宽槽（ui-defaults.md §1）。
            <span className="font-mono">@{profile.username} · </span>
          ) : null}
          {tMobile('me.profileHint')}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  )
}
