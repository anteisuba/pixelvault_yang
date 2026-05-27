'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SignedIn, SignedOut, useClerk, useUser } from '@clerk/nextjs'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  BookOpen,
  ChevronDown,
  Coins,
  FileText,
  Image as ImageIcon,
  KeyRound,
  Layers,
  LayoutGrid,
  Library,
  Loader2,
  LogOut,
  Box,
  Lock,
  Mic,
  Palette,
  ScanSearch,
  Sparkles,
  Swords,
  User,
  UserCircle,
  Video,
  Wand2,
  Workflow,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslations } from 'next-intl'

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
import { HyperText } from '@/components/ui/hyper-text'
import { NumberTicker } from '@/components/ui/number-ticker'
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
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { cn } from '@/lib/utils'

/**
 * AppSidebar — global navigation sidebar (replaces top Navbar).
 *
 * Architecture (Krea-aligned):
 * - Header: brand + sidebar toggle
 * - Main nav: Gallery / Prompt library / Assets / Cards
 * - Footer: credit badge / avatar dropdown / LocaleSwitcher
 *
 * Visual: dark theme (uses shadcn sidebar token's dark-mode values via local
 * `dark` class) layered on top of the light editorial main surface.
 */
export function AppSidebar() {
  return (
    <Sidebar
      collapsible="icon"
      className="z-40 dark border-r border-sidebar-border text-sidebar-foreground"
    >
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
    <SidebarHeader className="border-b border-sidebar-border/40 p-2 md:p-2">
      <div
        className={cn(
          'flex min-h-11 items-center justify-between gap-2 px-1',
          isCollapsed && 'justify-center px-0',
        )}
      >
        <Link
          href={ROUTES.STUDIO}
          className={cn(
            'flex min-w-0 shrink-0 items-center px-1 py-1.5',
            isCollapsed && 'hidden',
          )}
        >
          <HyperText
            as="span"
            duration={600}
            animateOnHover
            animateOnMount={false}
            className="font-display text-lg font-bold leading-none tracking-brand text-sidebar-foreground !py-0 md:text-brand"
          >
            {t('brand')}
          </HyperText>
        </Link>
        <SidebarTrigger className="size-11 rounded-full border border-sidebar-border/60 bg-sidebar-accent/35 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground md:size-8 md:border-0 md:bg-transparent" />
      </div>
    </SidebarHeader>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Content — main nav links
// ──────────────────────────────────────────────────────────────────────

function AppSidebarContent() {
  const pathname = usePathname()
  const t = useTranslations('Navbar')
  const tTools = useTranslations('StudioTools')
  const { isMobile, setOpenMobile } = useSidebar()
  const [showComingSoon, setShowComingSoon] = useState(false)
  const closeMobileSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])
  // The nav links don't depend on auth state — they render identically for
  // signed-in and signed-out visitors. Anything protected (Prompts / Assets /
  // Studio / Cards) is gated by Clerk middleware on click, so we can render
  // SSR-first and skip the Clerk hydration wait that used to leave the
  // sidebar empty (the previous `useUser().isLoaded` gate would never flip
  // true for visitors with `Clerk.loaded === false`, e.g. when the Clerk
  // session probe is still in flight on first paint of a public page).
  // Active state comes from `pathname`, which is known both on the server
  // and on the client, so there's no hydration mismatch.

  const signedInLinks = [
    {
      href: ROUTES.GALLERY,
      label: t('links.gallery'),
      icon: LayoutGrid,
    },
    {
      href: ROUTES.PROMPTS,
      label: t('links.prompts'),
      icon: FileText,
    },
    {
      // Krea-style asset browser. This is the private asset-management surface.
      href: ROUTES.ASSETS,
      label: t('links.assets'),
      icon: Library,
    },
    {
      href: ROUTES.CARDS,
      label: t('links.cards'),
      icon: Layers,
    },
  ] as const

  const pinnedToolLinks = [
    {
      href: ROUTES.ARENA,
      label: t('links.arena'),
      icon: Swords,
      activePaths: [
        ROUTES.ARENA,
        ROUTES.ARENA_HISTORY,
        ROUTES.ARENA_LEADERBOARD,
      ],
    },
  ] as const

  // Tools group — Krea-aligned per-tool entries. Image / Video / Audio map to
  // their per-media-type routes; Edit is the dedicated image editor while
  // Enhance / Analyze / LoRA / Node stay discoverable as later-phase tools.
  const toolLinks = [
    {
      href: ROUTES.STUDIO_IMAGE,
      label: tTools('tools.image.label'),
      icon: ImageIcon,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO, ROUTES.STUDIO_IMAGE],
    },
    {
      href: ROUTES.STUDIO_VIDEO,
      label: tTools('tools.video.label'),
      icon: Video,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO_VIDEO],
    },
    {
      href: ROUTES.STUDIO_AUDIO,
      label: tTools('tools.audio.label'),
      icon: Mic,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO_AUDIO],
    },
    {
      href: ROUTES.STUDIO_3D,
      label: tTools('tools.model3d.label'),
      icon: Box,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO_3D],
    },
    {
      href: ROUTES.STUDIO_EDIT,
      label: tTools('tools.edit.label'),
      icon: Wand2,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO_EDIT],
    },
    {
      href: ROUTES.STUDIO_ENHANCE,
      label: tTools('tools.enhance.label'),
      icon: Sparkles,
      comingSoon: true,
      activePaths: [ROUTES.STUDIO_ENHANCE],
    },
    {
      href: ROUTES.STUDIO_ANALYZE,
      label: tTools('tools.analyze.label'),
      icon: ScanSearch,
      comingSoon: true,
      activePaths: [ROUTES.STUDIO_ANALYZE],
    },
    {
      href: ROUTES.STUDIO_LORA,
      label: tTools('tools.lora.label'),
      icon: Palette,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO_LORA],
    },
    {
      href: ROUTES.STUDIO_NODE,
      label: tTools('tools.node.label'),
      icon: Workflow,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO_NODE],
    },
  ] as const

  const comingSoonToolLinks = [
    ...toolLinks.filter((tool) => tool.comingSoon),
    {
      href: ROUTES.STORYBOARD,
      label: t('links.storyboard'),
      icon: BookOpen,
      activePaths: [ROUTES.STORYBOARD],
    },
  ] as const

  const hasActiveComingSoonLink = comingSoonToolLinks.some((tool) =>
    tool.activePaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    ),
  )

  const isComingSoonOpen = showComingSoon || hasActiveComingSoonLink

  // Render the full nav regardless of auth state so a signed-out visitor
  // landing on /gallery still sees Krea-style discovery (Gallery / Prompts /
  // Assets / Cards + Tools). Clicking a protected link triggers the standard
  // Clerk middleware sign-in redirect — no special handling needed here.
  return (
    <SidebarContent className="gap-1 py-2 md:gap-2 md:py-0">
      <SidebarGroup className="px-2 py-1.5 md:p-2">
        <SidebarGroupContent>
          <SidebarMenu>
            {signedInLinks.map((link) => {
              const isActive = pathname === link.href
              const Icon = link.icon
              return (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={link.label}
                  >
                    <Link href={link.href} onClick={closeMobileSidebar}>
                      <Icon className="size-4 shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup className="px-2 py-1.5 md:p-2">
        <SidebarGroupLabel className="h-7 px-2.5 text-sidebar-foreground/55 md:h-8 md:px-2 md:text-sidebar-foreground/60">
          {tTools('groupLabel')}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {toolLinks
              .filter((tool) => !tool.comingSoon)
              .map((tool) => {
                const isActive = tool.activePaths.some((p) => pathname === p)
                const Icon = tool.icon
                return (
                  <SidebarMenuItem key={tool.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tool.label}
                    >
                      <Link href={tool.href} onClick={closeMobileSidebar}>
                        <Icon className="size-4 shrink-0" />
                        <span>{tool.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}

            {pinnedToolLinks.map((tool) => {
              const isActive = tool.activePaths.some(
                (p) => pathname === p || pathname.startsWith(`${p}/`),
              )
              const Icon = tool.icon
              return (
                <SidebarMenuItem key={tool.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={tool.label}
                  >
                    <Link href={tool.href} onClick={closeMobileSidebar}>
                      <Icon className="size-4 shrink-0" />
                      <span>{tool.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}

            {/* Coming Soon expander — keeps locked tools out of the
                default fold while staying discoverable. */}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setShowComingSoon((v) => !v)}
                tooltip={tTools('comingSoon')}
                aria-expanded={isComingSoonOpen}
                className="text-sidebar-foreground/60"
              >
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-200',
                    !isComingSoonOpen && '-rotate-90',
                  )}
                />
                <span>{tTools('comingSoon')}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge className="text-sidebar-foreground/40">
                {comingSoonToolLinks.length}
              </SidebarMenuBadge>
            </SidebarMenuItem>

            {isComingSoonOpen &&
              comingSoonToolLinks.map((tool) => {
                const isActive = tool.activePaths.some(
                  (p) => pathname === p || pathname.startsWith(`${p}/`),
                )
                const Icon = tool.icon
                return (
                  <SidebarMenuItem key={tool.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tool.label}
                    >
                      <Link href={tool.href} onClick={closeMobileSidebar}>
                        <Icon className="size-4 shrink-0" />
                        <span>{tool.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuBadge className="text-sidebar-foreground/50">
                      <Lock className="size-3" />
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                )
              })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Footer — credit badge / cards / avatar / locale
// ──────────────────────────────────────────────────────────────────────

function AppSidebarFooter() {
  const t = useTranslations('Navbar')
  const { isLoaded } = useUser()
  const { isMobile } = useSidebar()

  if (!isLoaded) {
    return <SidebarFooter className="border-t border-sidebar-border/40 gap-2" />
  }

  return (
    <SidebarFooter className="gap-2 border-t border-sidebar-border/40 p-3 group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:p-1 md:p-2">
      <SignedIn>
        {isMobile ? (
          <>
            <div className="flex items-center gap-2">
              <SidebarFooterCreditBadge />
              <div className="min-w-0 flex-1">
                <SidebarFooterFreeQuotaBar />
              </div>
              <SidebarFooterUserMenu />
            </div>
            <LocaleSwitcher tone="sidebar" size="compact" className="w-full" />
          </>
        ) : (
          <>
            <div className="sidebar-collapsed-locale hidden justify-center group-data-[collapsible=icon]:flex">
              <LocaleSwitcher tone="sidebar" orientation="vertical" />
            </div>
            <SidebarFooterCreditBadge />
            <SidebarFooterFreeQuotaBar />
            <SidebarFooterUserMenu />
            <div className="flex px-1 group-data-[collapsible=icon]:hidden">
              <LocaleSwitcher
                tone="sidebar"
                size="compact"
                className="w-full"
              />
            </div>
          </>
        )}
      </SignedIn>

      <SignedOut>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="w-full rounded-full border-sidebar-border bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 group-data-[collapsible=icon]:px-0"
        >
          <Link href={ROUTES.SIGN_IN}>
            <span className="group-data-[collapsible=icon]:hidden">
              {t('signIn')}
            </span>
            <UserCircle className="hidden size-4 group-data-[collapsible=icon]:inline-block" />
          </Link>
        </Button>
      </SignedOut>
    </SidebarFooter>
  )
}

/**
 * SidebarFooterFreeQuotaBar — Krea-style daily free-quota indicator.
 * Used to live in the Studio top bar as a bright orange "🎁 today free 20/20"
 * chip, which fought every other dark-workspace pixel for attention.
 * Now it's a quiet hairline progress bar plus `remaining/limit` text under
 * the credits badge, where every other persistent account indicator lives.
 *
 * Collapsed-rail behaviour: only show a 1.5px hue-coded dot (green/amber/red)
 * so the sidebar can shrink to icon mode without losing the signal.
 */
function SidebarFooterFreeQuotaBar() {
  const { summary, isLoading } = useUsageSummary()
  const tStudio = useTranslations('StudioPage')
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const limit = summary.freeGenerationLimit
  const used = Math.min(summary.freeGenerationsToday, limit)
  const remaining = Math.max(0, limit - used)
  const usedPct = limit > 0 ? (used / limit) * 100 : 0
  const isLow = remaining > 0 && remaining <= Math.max(1, Math.floor(limit / 5))
  const isOut = remaining === 0
  const dotClass = isOut
    ? 'bg-destructive'
    : isLow
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  if (isLoading) {
    return (
      <div
        className={cn(
          'h-1 rounded-full bg-sidebar-accent/40',
          isCollapsed && 'mx-2 h-1.5 w-1.5 rounded-full',
        )}
      />
    )
  }

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="mx-auto my-0.5 size-1.5 rounded-full ring-1 ring-sidebar-border/60">
              <span className={cn('block size-full rounded-full', dotClass)} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{tStudio('freeQuota', { remaining, limit })}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="flex flex-col gap-1 px-1">
      <div className="flex items-baseline justify-between text-2xs text-sidebar-foreground/70">
        <span className="tracking-nav-dense uppercase">
          {tStudio('freeQuota', { remaining, limit }).replace(
            ` ${remaining}/${limit}`,
            '',
          )}
        </span>
        <span className="font-semibold tabular-nums text-sidebar-foreground">
          {remaining}
          <span className="text-sidebar-foreground/50">/{limit}</span>
        </span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-sidebar-accent/40"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-label={tStudio('freeQuota', { remaining, limit })}
      >
        <span
          className={cn('block h-full rounded-full transition-all', dotClass)}
          style={{ width: `${usedPct}%` }}
        />
      </div>
    </div>
  )
}

function SidebarFooterCreditBadge() {
  const { summary, isLoading } = useUsageSummary()
  const t = useTranslations('Navbar')
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-2 rounded-md border border-sidebar-border/50 bg-sidebar-accent/40 px-2 py-1.5 text-xs',
              isCollapsed && 'size-8 justify-center p-0',
            )}
          >
            <Coins className="size-3.5 shrink-0 text-sidebar-primary" />
            <span
              className={cn(
                'font-semibold tracking-nav-dense uppercase text-sidebar-foreground',
                isCollapsed && 'hidden',
              )}
            >
              {isLoading ? (
                t('requestsLoading')
              ) : (
                <NumberTicker
                  value={summary.totalRequests}
                  className="text-xs font-semibold text-sidebar-foreground"
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
  const isCollapsed = state === 'collapsed'
  const isCompact = isCollapsed || isMobile

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
        className={cn(
          'flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent',
          isCompact && 'mx-auto size-8 shrink-0 justify-center p-0',
        )}
        aria-label={t('viewProfile')}
        aria-expanded={isMenuOpen}
        aria-haspopup="true"
      >
        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sidebar-border/60 bg-sidebar-accent text-sidebar-foreground/80">
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
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs font-medium',
            isCompact && 'hidden',
          )}
        >
          {myProfile?.displayName ?? t('viewProfile')}
        </span>
      </button>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'absolute z-50 rounded-xl border border-sidebar-border/60 bg-sidebar/95 py-1 shadow-lg backdrop-blur-xl',
              isCompact
                ? 'bottom-0 left-full ml-2 w-48 origin-bottom-left'
                : 'bottom-full left-0 right-0 mb-2 origin-bottom',
            )}
          >
            <button
              type="button"
              onClick={handleViewProfile}
              disabled={isProfileNavigationPending}
              aria-busy={isProfileNavigationPending}
              className="flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent disabled:cursor-wait disabled:opacity-70"
            >
              {isProfileNavigationPending ? (
                <Loader2 className="size-4 animate-spin text-sidebar-foreground/70" />
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
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={apiKeysOpen} onOpenChange={setApiKeysOpen}>
        <SheetContent className="w-full overflow-y-auto border-l bg-background/95 px-0 sm:max-w-2xl">
          <SheetHeader className="gap-3 border-b px-6 pb-5 pt-6">
            <SheetTitle className="flex items-center gap-2 font-display text-lg font-medium">
              <KeyRound className="size-4" />
              {tApiKeys('sheetTitle')}
            </SheetTitle>
            <SheetDescription className="max-w-md font-serif leading-6">
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
