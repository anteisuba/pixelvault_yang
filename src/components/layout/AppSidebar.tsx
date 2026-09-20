'use client'

import { useCallback, useMemo, useRef } from 'react'
import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'
import { ChevronDown, UserCircle } from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  isShellNavItemActive,
  resolveShellNavSections,
  type ResolvedShellNavItem,
} from '@/constants/navigation'
import { ROUTES } from '@/constants/routes'
import { Link, usePathname } from '@/i18n/navigation'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSlider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { useHasHydrated } from '@/hooks/use-has-hydrated'
import { useNavIndicator } from '@/hooks/use-nav-indicator'
import { useMyProfile } from '@/hooks/use-my-profile'
import { cn } from '@/lib/utils'

const SIDEBAR_FOOTER_CLASS =
  'gap-1 p-1.5 group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:p-1'

/**
 * AppSidebar — 全局导航轨。施工基准：`docs/references/pages/app-shell.md`。
 *
 * 形态「分段浮岛」（2026-08-18 owner 拍板）：壳底浅灰，轨坐在灰底上，主区是
 * 一张左缘浮起的白卡。轨宽 144 展开 / 44 收起。
 *
 * 结构：品牌 + 折叠钮 · 去处段 · 工具段 · 最底一行「账号」。
 * 条目清单**只在** `src/constants/navigation.ts`，任何断点都从那里取。
 *
 * ⚠ 三条别退回去的东西（都是改版前真机量出来的问题）：
 * 1. 菜单项的 `transition-property` **必须含 color** —— 改版前只有
 *    `width,height,padding`，所以切工具时颜色是瞬时跳变的。
 * 2. 激活与 hover **反极性**：hover 往暗、active 往亮。同向时只有 1.1:1。
 * 3. 激活态靠**墨竖条 + 字重墨色跃迁**承重，白浮片只是材质（对壳底 1.24:1）。
 */
export function AppSidebar() {
  const { isMobile } = useSidebar()

  // <1024 **完全没有侧栏**（方向 M2「顶栏当切换器」）——由 MobileShell 接管。
  // 不挡的话，原语的移动分支会挂一个永远打不开的 Sheet 在 DOM 里。
  // 首帧 useIsMobile 返回 false，与 SSR 一致，不会水合不匹配。
  if (isMobile) return null

  return (
    <Sidebar collapsible="icon" className="z-40 text-sidebar-foreground">
      <AppSidebarHeader />
      <AppSidebarContent />
      <AppSidebarFooter />
    </Sidebar>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Header — brand + collapse toggle
// ──────────────────────────────────────────────────────────────────────

function AppSidebarHeader() {
  const t = useTranslations('Navbar')
  const { state, isMobile } = useSidebar()
  const isCollapsed = !isMobile && state === 'collapsed'

  // Brand link is rendered unconditionally (no SignedIn / SignedOut wrapper)
  // — Clerk's auth status is unknown at SSR time, so wrapping it caused a
  // hydration mismatch where the server saw only <SidebarTrigger> while the
  // client (after Clerk hydrated) inserted an <a> before it. Pointing the
  // brand at /studio works for both states: signed-in users land in their
  // workspace; signed-out users hit the protected-route redirect to sign-in.
  return (
    <SidebarHeader className="p-1.5">
      <div
        className={cn(
          'flex min-h-9 items-center justify-between gap-1',
          isCollapsed && 'justify-center',
        )}
      >
        <Link
          href={ROUTES.STUDIO}
          className={cn(
            'flex min-w-0 shrink-0 items-center rounded-md px-2 py-1 text-sidebar-accent-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-sidebar-accent',
            isCollapsed && 'hidden',
          )}
        >
          {/* 静态字。改版前这里挂着 HyperText 的逐字乱码 hover 动画 ——
              一个每天要看几百次的导航元素上放炫技动画，与
              `interaction.md §5`「动效只服务状态 / 连续性 / 反馈」冲突。 */}
          <span className="text-base font-bold leading-none tracking-brand">
            {t('brand')}
          </span>
        </Link>
        {/* 头像不在这里了（D11 ④）—— 它下沉到最底与「设置」合成账号入口。
            顶端只剩品牌与折叠钮。 */}
        <SidebarTrigger className="size-11 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:size-8" />
      </div>
    </SidebarHeader>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Content — main nav links
// ──────────────────────────────────────────────────────────────────────

function AppSidebarContent() {
  const pathname = usePathname()
  const t = useTranslations()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const navScopeRef = useRef<HTMLDivElement>(null)
  const { profile } = useMyProfile()

  // 「我的主页」的地址要等 username（D11 ④）。解析在 constants 那支，这里只
  // 递运行时事实；username 还没回来时那一条**不产出**，不会出现死链接。
  const sections = useMemo(
    () => resolveShellNavSections({ username: profile?.username ?? null }),
    [profile?.username],
  )

  const indicator = useNavIndicator(navScopeRef, pathname, state)

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  // 导航不依赖登录态：登入与未登入渲染完全一致。受保护的路由（提示词 / 素材 /
  // 工作台 / 卡片）由 Clerk 中间件在点击时拦截，所以这里可以 SSR 优先，不必等
  // Clerk 水合 —— 之前那个 `useUser().isLoaded` 闸门对 `Clerk.loaded === false`
  // 的访客永远不会翻 true，会把整条侧栏留空。激活态来自 pathname，服务端与
  // 客户端都算得出，不存在水合不一致。
  const renderItem = (item: ResolvedShellNavItem) => {
    const Icon = item.icon
    const label = t(item.labelKey)
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          asChild
          isActive={isShellNavItemActive(item, pathname)}
          tooltip={label}
        >
          <Link
            href={item.href}
            aria-label={label}
            onClick={closeMobileSidebar}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarContent
      ref={navScopeRef}
      onPointerOver={indicator.onPointerOver}
      onPointerLeave={indicator.onPointerLeave}
      className="relative gap-1 py-1 md:gap-1"
    >
      {/* 整栏唯一的两个运动主体（app-shell.md §5.1）。DOM 上排在菜单之前，
          所以画在项的下面；两块都只动 transform。 */}
      <SidebarMenuSlider
        rect={indicator.hover}
        tone="hover"
        visible={indicator.hoverVisible}
        jumped={indicator.hoverJumped}
      />
      <SidebarMenuSlider
        rect={indicator.active}
        tone="active"
        visible={indicator.active !== null}
      />

      {sections.map((section) => (
        <SidebarGroup
          key={section.id}
          className="px-1.5 py-1 group-data-[collapsible=icon]:px-1 md:p-1.5 md:group-data-[collapsible=icon]:p-1"
        >
          <SidebarGroupLabel className="h-7 px-2 text-sidebar-subtle">
            {t(section.labelKey)}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => renderItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Footer — 账号入口
// ──────────────────────────────────────────────────────────────────────

/**
 * 最底那一行就是账号入口（D11 ④，2026-09-20 owner 确认画板）：
 * 头像 + 名字 + ▾，整行一颗触发器，点开**向上弹**账号菜单（语言 / 设置 /
 * 退出登录）。收起 40 只剩头像，仍是一颗**真 button**，tooltip「账号」，
 * 菜单锚到右侧 —— 那一档它是**唯一**的账号入口，键盘必须到得了。
 *
 * ⚠ 底色三档走侧栏的**反极性**（app-shell.md §5.1，别破例）：
 * hover 往暗 `--sidebar-accent` → pressed / 菜单打开更暗
 * `--sidebar-accent-strong`。⛔ 不动字重、⛔ 行不能抖（只过渡颜色）。
 *
 * ⛔ 这一行不读任何账户数字：额度在 `/settings/usage`，失效 key 在
 * `/settings/keys`，⛔ 不挂红点 / 角标。
 */
function AppSidebarFooter() {
  const t = useTranslations('Navbar')
  const { isLoaded } = useUser()
  const hasHydrated = useHasHydrated()
  const { state, isMobile } = useSidebar()
  const { profile } = useMyProfile()
  const isCollapsed = !isMobile && state === 'collapsed'
  const name = profile?.displayName ?? profile?.username

  return (
    <SidebarFooter className={SIDEBAR_FOOTER_CLASS}>
      {hasHydrated && isLoaded ? (
        <>
          <SignedIn>
            <div className="border-t border-sidebar-border pt-1">
              <AccountMenu
                side={isCollapsed ? 'right' : 'top'}
                align={isCollapsed ? 'end' : 'start'}
                tooltip={isCollapsed ? t('account') : undefined}
              >
                <button
                  type="button"
                  aria-label={t('account')}
                  /* 引导第 4 步的锚点。「设置」那一行收进菜单后落到这里 ——
                     ⛔ 别把它挂进菜单内容里：那一层只在打开后才挂载，
                     `OnboardingTooltip` 查不到目标就只能把气泡居中。 */
                  data-onboarding="apiKey"
                  className="flex h-9 w-full items-center gap-2 overflow-hidden rounded-md px-1.5 text-left text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring transition-colors duration-(--duration-fast) ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent-strong data-[state=open]:bg-sidebar-accent-strong data-[state=open]:text-sidebar-accent-foreground motion-reduce:transition-none group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
                >
                  <ProfileAvatar
                    avatarUrl={profile?.avatarUrl}
                    size={24}
                    className="size-6"
                    iconClassName="size-3.5"
                  />
                  <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                    {name ?? t('account')}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-sidebar-subtle group-data-[collapsible=icon]:hidden" />
                </button>
              </AccountMenu>
            </div>
          </SignedIn>

          <SignedOut>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="w-full rounded-full border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:px-0"
            >
              <Link href={ROUTES.SIGN_IN}>
                <span className="group-data-[collapsible=icon]:hidden">
                  {t('signIn')}
                </span>
                <UserCircle className="hidden size-4 group-data-[collapsible=icon]:inline-block" />
              </Link>
            </Button>
          </SignedOut>
        </>
      ) : (
        <SidebarFooterLoadingState />
      )}
    </SidebarFooter>
  )
}

function SidebarFooterLoadingState() {
  return (
    <div className="flex h-9 items-center gap-2 border-t border-sidebar-border px-2 pt-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
      <div className="size-4 rounded-sm bg-sidebar-accent" />
      <div className="h-3 w-12 rounded-sm bg-sidebar-accent group-data-[collapsible=icon]:hidden" />
    </div>
  )
}
