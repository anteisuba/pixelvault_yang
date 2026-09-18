'use client'

import { useState } from 'react'
import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'
import {
  ArrowRight,
  ChevronDown,
  Settings,
  UserCircle,
} from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  SHELL_NAV_GO,
  SHELL_NAV_TOOLS,
  isShellNavItemActive,
  type ShellNavItem,
} from '@/constants/navigation'
import { ROUTES, creatorProfilePath, settingsPath } from '@/constants/routes'
import { Link, usePathname } from '@/i18n/navigation'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useHasHydrated } from '@/hooks/use-has-hydrated'
import { useMyProfile } from '@/hooks/use-my-profile'
import { cn } from '@/lib/utils'

/**
 * 手机 / 平板（<1024）的导航壳 —— 方向 M2「顶栏当切换器」
 * （2026-08-18 owner 拍板，`docs/references/pages/app-shell.md` §6）。
 *
 * **这里没有竖轨。** 改版前是一条 44px 常驻左轨 + 顶栏；M2 把它整个撤掉，
 * 导航收进顶栏中间那颗「当前位置」按钮。理由不是审美：
 * - 触屏没有 hover，桌面那套跟随幽灵块在这里是死的；
 * - 左上是右手拇指最差的可达区；
 * - 44px 竖轨吃掉 375 宽度的 12%，而且是永久占用；
 * - 触摸目标要 44px，竖轨在小屏上反而得比桌面更宽 —— 形态本身就不对。
 *
 * ⚠ 断点仍是 1024（`useIsMobile`）。别为了让平板拿到桌面竖轨而下调到 768：
 * `use-mobile.ts` 的注释记着，768–1023 挂桌面侧栏会把 studio 内容裁出视口。
 * M2 天然覆盖整个 <1024，不需要第三种形态。
 *
 * ⛔ 条目清单只来自 `src/constants/navigation.ts`。曾经这里手抄过第二份，
 * 结果桌面独有的那一组入口在小屏直接不可达。
 */

const PANEL_CELL_CLASS =
  'flex h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-2xs font-medium text-sidebar-foreground transition-colors duration-(--duration-fast) ease-standard active:bg-sidebar-accent-strong [&>svg]:size-5'

function useCurrentEntry(pathname: string) {
  const all = [...SHELL_NAV_TOOLS, ...SHELL_NAV_GO]
  return all.find((item) => isShellNavItemActive(item, pathname))
}

function PanelGrid({
  items,
  pathname,
  onNavigate,
}: {
  items: readonly ShellNavItem[]
  pathname: string
  onNavigate: () => void
}) {
  const t = useTranslations()
  return (
    <div className="grid grid-cols-4 gap-1">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = isShellNavItemActive(item, pathname)
        return (
          <Link
            key={item.id}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              PANEL_CELL_CLASS,
              // 小尺寸下用墨色填充表达激活，不是桌面那套白浮片：没有 hover
              // 就不需要反极性，而深色块在 375 上更容易一眼认出。
              isActive && 'bg-sidebar-primary text-sidebar-primary-foreground',
            )}
          >
            <Icon />
            <span className="max-w-full truncate">{t(item.labelKey)}</span>
          </Link>
        )
      })}
    </div>
  )
}

function PanelSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-3 text-2xs font-semibold uppercase tracking-nav-dense text-sidebar-subtle">
      {children}
    </p>
  )
}

/**
 * 抽屉顶部的「我」区（D3 ④ 入口收口）：头像 · 显示名 ·「查看主页 →」。
 *
 * ⛔ 这里没有 key 数、没有额度、没有红点、没有语言切换 —— 语言进了
 * `/settings/preferences`，退出登录进了 `/settings` 导航底部，
 * 抽屉最底只留一行「设置」。
 */
function MobileMeSection({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations('Navbar')
  const { profile } = useMyProfile()

  const body = (
    <>
      <ProfileAvatar
        avatarUrl={profile?.avatarUrl}
        size={36}
        className="size-9"
        iconClassName="size-5"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-sidebar-accent-foreground">
          {profile?.displayName ?? t('viewProfile')}
        </span>
        <span className="flex items-center gap-1 text-2xs text-sidebar-subtle">
          {t('viewProfile')}
          <ArrowRight className="size-3" aria-hidden />
        </span>
      </span>
    </>
  )

  if (!profile?.username) {
    return <div className="flex items-center gap-3 px-2">{body}</div>
  }

  return (
    <Link
      href={creatorProfilePath(profile.username)}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-lg px-2 py-1 transition-colors duration-(--duration-fast) ease-standard active:bg-sidebar-accent-strong"
    >
      {body}
    </Link>
  )
}

export function MobileShell() {
  const pathname = usePathname()
  const t = useTranslations()
  const tNav = useTranslations('Navbar')
  const tTools = useTranslations('StudioTools')
  const tCommon = useTranslations('Common')
  const [open, setOpen] = useState(false)
  const hasHydrated = useHasHydrated()
  const { isLoaded } = useUser()
  const { profile } = useMyProfile()

  const current = useCurrentEntry(pathname)
  const CurrentIcon = current?.icon
  const currentLabel = current ? t(current.labelKey) : tCommon('brand')

  const close = () => setOpen(false)

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-11 items-center px-2 lg:hidden">
        <div className="pointer-events-auto flex h-9 w-full items-center gap-2 rounded-full bg-sidebar-active-surface px-1 shadow-sidebar-chip">
          {/* 左侧留白只为把切换器压在正中 —— 中间是拇指之外最容易命中的位置，
            而这颗按钮是整个手机档唯一的导航入口。 */}
          <span className="size-9 shrink-0" aria-hidden />

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-sidebar-accent-foreground transition-colors duration-(--duration-fast) ease-standard active:bg-sidebar-accent"
          >
            {CurrentIcon ? <CurrentIcon className="size-4 shrink-0" /> : null}
            <span className="truncate">{currentLabel}</span>
            <ChevronDown className="size-3.5 shrink-0 text-sidebar-subtle" />
          </button>

          {hasHydrated && isLoaded ? (
            <>
              <SignedIn>
                {/* 头像 = 去个人主页（D3 ④）。⛔ 不再是「开抽屉」，也不挂红点。 */}
                {profile?.username ? (
                  <Link
                    href={creatorProfilePath(profile.username)}
                    aria-label={tNav('viewProfile')}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  >
                    <ProfileAvatar
                      avatarUrl={profile.avatarUrl}
                      size={28}
                      className="size-7"
                    />
                  </Link>
                ) : (
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full"
                  >
                    <ProfileAvatar size={28} className="size-7" />
                  </span>
                )}
              </SignedIn>
              <SignedOut>
                <Link
                  href={ROUTES.SIGN_IN}
                  aria-label={tNav('signIn')}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-sidebar-foreground"
                >
                  <UserCircle className="size-5" />
                </Link>
              </SignedOut>
            </>
          ) : (
            <span className="size-9 shrink-0" aria-hidden />
          )}
        </div>
      </header>

      {/* 面板从顶栏落下。用 Radix Sheet 而不是自己搭浮层 —— focus trap、Esc、
          焦点归位都是它给的，brand-dna 明写这些行为不得破坏。 */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="top"
          className="max-h-[85svh] overflow-y-auto rounded-b-2xl border-sidebar-border bg-sidebar px-2 pb-4 pt-3 text-sidebar-foreground lg:hidden [&>button]:top-3"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{tCommon('sidebar')}</SheetTitle>
            <SheetDescription>{tCommon('sidebarDescription')}</SheetDescription>
          </SheetHeader>

          {hasHydrated && isLoaded && (
            <SignedIn>
              <MobileMeSection onNavigate={close} />
            </SignedIn>
          )}

          <PanelSectionLabel>{tTools('groupLabel')}</PanelSectionLabel>
          <PanelGrid
            items={SHELL_NAV_TOOLS}
            pathname={pathname}
            onNavigate={close}
          />

          <PanelSectionLabel>{tNav('groupLabel')}</PanelSectionLabel>
          <PanelGrid
            items={SHELL_NAV_GO}
            pathname={pathname}
            onNavigate={close}
          />

          {hasHydrated && isLoaded && (
            <SignedIn>
              <Link
                href={settingsPath(ROUTES.SETTINGS, pathname)}
                onClick={close}
                className="mt-4 flex h-11 items-center gap-2.5 border-t border-sidebar-border px-2 text-sm text-sidebar-foreground transition-colors duration-(--duration-fast) ease-standard active:bg-sidebar-accent-strong"
              >
                <Settings className="size-4" aria-hidden />
                {tNav('settings')}
              </Link>
            </SignedIn>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
