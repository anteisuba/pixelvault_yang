'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SignedIn, SignedOut, useClerk, useUser } from '@clerk/nextjs'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  ChevronDown,
  Coins,
  KeyRound,
  Lock,
  LogOut,
  User,
  UserCircle,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { motionTransition } from '@/constants/motion'
import {
  SHELL_NAV_LOCKED,
  SHELL_NAV_SECTIONS,
  isShellNavItemActive,
  type ShellNavItem,
} from '@/constants/navigation'
import { ROUTES, creatorProfilePath } from '@/constants/routes'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'

// Lazy-load ApiKeyManager so its bundle (forms + tables) stays out of the
// main-layout chunk that loads on every page in the (main) route group.
// The Sheet only mounts content when opened from the user menu.
const ApiKeyManager = dynamic(
  () =>
    import('@/components/business/ApiKeyManager').then((m) => m.ApiKeyManager),
  { ssr: false },
)
import { Button } from '@/components/ui/button'
import { NumberTicker } from '@/components/ui/number-ticker'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSlider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useHasHydrated } from '@/hooks/use-has-hydrated'
import { useNavIndicator } from '@/hooks/use-nav-indicator'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { cn } from '@/lib/utils'

const SIDEBAR_FOOTER_CLASS =
  'gap-1 p-1.5 group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:p-1'

/**
 * AppSidebar — 全局导航轨。施工基准：`docs/references/pages/app-shell.md`。
 *
 * 形态「分段浮岛」（2026-08-18 owner 拍板）：壳底浅灰，轨坐在灰底上，主区是
 * 一张左缘浮起的白卡。轨宽 144 展开 / 44 收起。
 *
 * 结构：品牌 + 折叠钮 · 去处段 · 工具段（末尾折叠「敬请期待」）· 账户一行。
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
  const tTools = useTranslations('StudioTools')
  const { isMobile, setOpenMobile, state } = useSidebar()
  const [showLocked, setShowLocked] = useState(false)
  const navScopeRef = useRef<HTMLDivElement>(null)

  const hasActiveLockedItem = SHELL_NAV_LOCKED.some((item) =>
    isShellNavItemActive(item, pathname),
  )
  const isLockedOpen = showLocked || hasActiveLockedItem
  const isCollapsed = !isMobile && state === 'collapsed'

  // 收展改宽度、展开「敬请期待」改纵向位置 —— 两者都要让滑片重量。
  const indicator = useNavIndicator(navScopeRef, pathname, state, isLockedOpen)

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  // 导航不依赖登录态：登入与未登入渲染完全一致。受保护的路由（提示词 / 素材 /
  // 工作台 / 卡片）由 Clerk 中间件在点击时拦截，所以这里可以 SSR 优先，不必等
  // Clerk 水合 —— 之前那个 `useUser().isLoaded` 闸门对 `Clerk.loaded === false`
  // 的访客永远不会翻 true，会把整条侧栏留空。激活态来自 pathname，服务端与
  // 客户端都算得出，不存在水合不一致。
  const renderItem = (item: ShellNavItem, locked = false) => {
    const Icon = item.icon
    const label = t(item.labelKey)
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton
          asChild
          isActive={isShellNavItemActive(item, pathname)}
          tooltip={label}
        >
          <Link href={item.href} onClick={closeMobileSidebar}>
            <Icon />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
        {locked && (
          <SidebarMenuBadge className="text-sidebar-subtle">
            <Lock className="size-3" />
          </SidebarMenuBadge>
        )}
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

      {SHELL_NAV_SECTIONS.map((section) => (
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

              {/* 「敬请期待」展开器只挂在工具组末尾。
                  ⚠ 收起态整行不渲染 —— 44px 轨里点开无处显示标签，
                  badge 也被藏，缩成一个箭头没有意义（app-shell.md §6）。 */}
              {section.id === 'tools' && !isCollapsed && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setShowLocked((value) => !value)}
                      aria-expanded={isLockedOpen}
                      className="text-sidebar-subtle"
                    >
                      <ChevronDown
                        className={cn(
                          'transition-transform duration-(--duration-fast) ease-standard',
                          !isLockedOpen && '-rotate-90',
                        )}
                      />
                      <span>{tTools('comingSoon')}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="text-sidebar-subtle">
                      {SHELL_NAV_LOCKED.length}
                    </SidebarMenuBadge>
                  </SidebarMenuItem>

                  {isLockedOpen &&
                    SHELL_NAV_LOCKED.map((item) => renderItem(item, true))}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Footer — credit badge / cards / avatar / locale
// ──────────────────────────────────────────────────────────────────────

function AppSidebarFooter() {
  const t = useTranslations('Navbar')
  const { isLoaded } = useUser()
  const hasHydrated = useHasHydrated()

  // 账户区收成**一行**（app-shell.md §8）。改版前是四行、竖向 167.5px（占 18%），
  // 而它们是读数不是去处，不该和导航抢层级。
  // 免费额度 → 头像上的一个点；语言与显示名 → 头像菜单里。
  return (
    <SidebarFooter className={SIDEBAR_FOOTER_CLASS}>
      {hasHydrated && isLoaded ? (
        <>
          <SignedIn>
            <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:justify-center">
              <SidebarFooterCreditBadge />
              <SidebarFooterUserMenu />
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
    <div className="flex items-center justify-between gap-1 group-data-[collapsible=icon]:justify-center">
      <div className="h-7 w-16 rounded-md bg-sidebar-accent group-data-[collapsible=icon]:hidden" />
      <div className="size-7 rounded-full bg-sidebar-accent" />
    </div>
  )
}

/**
 * 免费额度 —— 头像右下角的一个点（app-shell.md §8）。
 *
 * 改版前它是独立一行：「今日免费 20/20」+ 一条发丝进度条。在 144px 的轨里，
 * 那是账户区三个读数中最占地方、又最不需要精确到个位的一个。降级成点：
 * 绿=充足 / 琥珀=快用完 / 红=用尽，确切数字进 tooltip 与头像菜单。
 * ⚠ 状态不能只靠颜色 —— tooltip 里始终带文字读数。
 */
function SidebarFooterQuotaDot() {
  const { summary, isLoading } = useUsageSummary()
  const limit = summary.freeGenerationLimit
  const used = Math.min(summary.freeGenerationsToday, limit)
  const remaining = Math.max(0, limit - used)
  const isLow = remaining > 0 && remaining <= Math.max(1, Math.floor(limit / 5))
  const isOut = remaining === 0

  if (isLoading) return null

  return (
    <span
      aria-hidden
      className={cn(
        'absolute -bottom-px -right-px size-2.5 rounded-full ring-2 ring-sidebar',
        isOut ? 'bg-destructive' : isLow ? 'bg-amber-500' : 'bg-emerald-500',
      )}
    />
  )
}

function useFreeQuotaLabel() {
  const { summary } = useUsageSummary()
  const tStudio = useTranslations('StudioPage')
  const limit = summary.freeGenerationLimit
  const remaining = Math.max(
    0,
    limit - Math.min(summary.freeGenerationsToday, limit),
  )
  return tStudio('freeQuota', { remaining, limit })
}

/** 积分读数。改版前是个带边框的盒子，和导航项抢重量 —— 现在只剩图标 + 数字。 */
function SidebarFooterCreditBadge() {
  const { summary, isLoading } = useUsageSummary()
  const t = useTranslations('Navbar')

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
            <Coins className="size-3.5 shrink-0 text-sidebar-primary" />
            <span className="truncate font-semibold tabular-nums">
              {isLoading ? (
                t('requestsLoading')
              ) : (
                <NumberTicker
                  value={summary.totalRequests}
                  className="text-xs font-semibold text-sidebar-accent-foreground"
                />
              )}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{t('requestsTooltip')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function SidebarFooterUserMenu() {
  const { profile: myProfile, refresh: refreshMyProfile } = useMyProfile()
  const t = useTranslations('Navbar')
  const tApiKeys = useTranslations('StudioApiKeys')
  const pathname = usePathname()
  const { signOut } = useClerk()
  const router = useRouter()
  const { isMobile, state } = useSidebar()
  const reducedMotion = useReducedMotion()
  const isCollapsed = state === 'collapsed'
  const isCompact = isCollapsed || isMobile

  const freeQuotaLabel = useFreeQuotaLabel()
  const accountLabel = myProfile?.displayName ?? t('viewProfile')

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPathname, setMenuPathname] = useState<string | null>(null)
  const [apiKeysOpen, setApiKeysOpen] = useState(false)
  const [isProfileNavigationPending, setIsProfileNavigationPending] =
    useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMenuOpen = menuOpen && menuPathname === pathname

  useEffect(() => {
    if (!isMenuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isMenuOpen])

  const handleViewProfile = useCallback(async () => {
    setMenuOpen(false)
    if (myProfile?.username) {
      router.push(creatorProfilePath(myProfile.username))
      return
    }

    setIsProfileNavigationPending(true)
    try {
      const nextProfile = await refreshMyProfile()
      if (nextProfile?.username) {
        router.push(creatorProfilePath(nextProfile.username))
      }
    } finally {
      setIsProfileNavigationPending(false)
    }
  }, [myProfile?.username, refreshMyProfile, router])

  const handleOpenApiKeys = useCallback(() => {
    setMenuOpen(false)
    setApiKeysOpen(true)
  }, [])

  const handleSignOut = useCallback(() => {
    setMenuOpen(false)
    signOut({ redirectUrl: ROUTES.HOME })
  }, [signOut])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          setMenuPathname(pathname)
          setMenuOpen((value) => !value)
        }}
        className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-sidebar-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-sidebar-accent"
        aria-label={accountLabel}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
      >
        <span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground">
          {myProfile?.avatarUrl ? (
            <Image
              src={myProfile.avatarUrl}
              alt=""
              width={28}
              height={28}
              unoptimized
              className="size-full rounded-full object-cover"
            />
          ) : (
            <UserCircle className="size-4" />
          )}
        </span>
        {/* 免费额度：整整一行读数降级成头像上的一个点。overflow-hidden 在上面
            那层，所以点要挂在按钮上，不然会被圆形头像裁掉。 */}
        <SidebarFooterQuotaDot />
        <span className="sr-only">{accountLabel}</span>
      </button>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={motionTransition('fast', reducedMotion)}
            className={cn(
              'absolute z-50 rounded-xl border border-sidebar-border/60 bg-sidebar/95 py-1 shadow-lg backdrop-blur-xl',
              isCompact
                ? 'bottom-0 left-full ml-2 w-48 origin-bottom-left'
                : 'bottom-full left-0 right-0 mb-2 origin-bottom',
            )}
          >
            {/* 从轨里撤下来的两样东西在这里落地：显示名与免费额度读数。 */}
            <div className="border-b border-sidebar-border px-3 pb-2 pt-2">
              <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
                {myProfile?.displayName ?? t('viewProfile')}
              </p>
              <p className="truncate text-xs text-sidebar-subtle">
                {freeQuotaLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={handleViewProfile}
              disabled={isProfileNavigationPending}
              aria-busy={isProfileNavigationPending}
              className="flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent disabled:cursor-wait disabled:opacity-70"
            >
              {isProfileNavigationPending ? (
                <Spinner size="md" className="text-sidebar-foreground/70" />
              ) : (
                <User className="size-4 text-sidebar-foreground/70" />
              )}
              {t('viewProfile')}
            </button>
            <button
              type="button"
              onClick={handleOpenApiKeys}
              className="flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <KeyRound className="size-4 text-sidebar-foreground/70" />
              {t('apiKeys')}
            </button>
            <div className="mx-2 my-1 border-t border-sidebar-border/40" />
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" />
              {t('signOut')}
            </button>
            {/* 语言从常驻一行搬进来。⚠ 它在轨里时未选中态只有 3.14:1
                （app-shell.md §8 记了 18 天没修）；菜单里走的是原语自己的
                墨阶，不再叠 alpha。 */}
            <div className="mx-2 my-1 border-t border-sidebar-border" />
            <div className="px-2 pb-1">
              <LocaleSwitcher
                tone="sidebar"
                size="compact"
                className="w-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={apiKeysOpen} onOpenChange={setApiKeysOpen}>
        <SheetContent className="w-full overflow-y-auto border-l bg-background/95 px-0 sm:max-w-2xl">
          <SheetHeader className="gap-3 border-b px-6 pb-5 pt-6">
            <SheetTitle className="flex items-center gap-2 text-lg font-medium">
              <KeyRound className="size-4" />
              {tApiKeys('sheetTitle')}
            </SheetTitle>
            <SheetDescription className="max-w-md leading-6">
              {tApiKeys('sheetDescription')}
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 py-6">
            <ApiKeyManager />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
