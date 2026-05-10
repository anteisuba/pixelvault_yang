'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SignedIn, SignedOut, useClerk } from '@clerk/nextjs'
import Image from 'next/image'
import {
  BookOpen,
  Coins,
  Image as ImageIcon,
  LayoutGrid,
  Library,
  LogOut,
  Lock,
  Palette,
  ScanSearch,
  Sparkles,
  Swords,
  User,
  UserCircle,
  Wand2,
  Workflow,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'

import { ROUTES, creatorProfilePath } from '@/constants/routes'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { LOCALES, type AppLocale } from '@/i18n/routing'
import { CardDrawer } from '@/components/business/CardDrawer'
import { Button } from '@/components/ui/button'
import { HyperText } from '@/components/ui/hyper-text'
import { NumberTicker } from '@/components/ui/number-ticker'
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
 * - Main nav: Gallery / Studio / Arena / Storyboard / Library
 * - Footer: CardDrawer / credit badge / avatar dropdown / LocaleSwitcher
 *
 * Visual: dark theme (uses shadcn sidebar token's dark-mode values via local
 * `dark` class) layered on top of the light editorial main surface.
 */
export function AppSidebar() {
  return (
    <Sidebar
      collapsible="icon"
      className="dark border-r border-sidebar-border text-sidebar-foreground"
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
  const tCommon = useTranslations('Common')
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  return (
    <SidebarHeader className="border-b border-sidebar-border/40">
      <div className="flex items-center justify-between gap-1 px-1">
        <SignedIn>
          <Link
            href={ROUTES.STUDIO}
            className={cn(
              'flex shrink-0 items-center px-1 py-1.5',
              isCollapsed && 'hidden',
            )}
          >
            <HyperText
              as="span"
              duration={600}
              animateOnHover
              className="font-display text-brand font-bold leading-none tracking-brand text-sidebar-foreground !py-0"
            >
              {tCommon('brand')}
            </HyperText>
          </Link>
        </SignedIn>
        <SignedOut>
          <Link
            href={ROUTES.HOME}
            className={cn(
              'flex shrink-0 items-center px-1 py-1.5',
              isCollapsed && 'hidden',
            )}
          >
            <HyperText
              as="span"
              duration={600}
              animateOnHover
              className="font-display text-brand font-bold leading-none tracking-brand text-sidebar-foreground !py-0"
            >
              {tCommon('brand')}
            </HyperText>
          </Link>
        </SignedOut>
        <SidebarTrigger className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground" />
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

  const signedInLinks = [
    {
      href: ROUTES.GALLERY,
      label: t('links.gallery'),
      icon: LayoutGrid,
    },
    {
      href: ROUTES.STUDIO,
      label: t('links.studio'),
      icon: Sparkles,
    },
    {
      href: ROUTES.ARENA,
      label: t('links.arena'),
      icon: Swords,
    },
    {
      href: ROUTES.STORYBOARD,
      label: t('links.storyboard'),
      icon: BookOpen,
    },
    {
      href: ROUTES.PROFILE,
      label: t('links.library'),
      icon: Library,
    },
  ] as const

  // Tools group — Krea-aligned per-tool entries. Image points to /studio
  // (current behaviour); the rest are Coming Soon placeholders for now.
  // video/audio land in Phase 3 when /studio is split per media type.
  const toolLinks = [
    {
      href: ROUTES.STUDIO,
      label: tTools('tools.image.label'),
      icon: ImageIcon,
      comingSoon: false,
      activePaths: [ROUTES.STUDIO],
    },
    {
      href: ROUTES.STUDIO_EDIT,
      label: tTools('tools.edit.label'),
      icon: Wand2,
      comingSoon: true,
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
      comingSoon: true,
      activePaths: [ROUTES.STUDIO_LORA],
    },
    {
      href: ROUTES.STUDIO_NODE,
      label: tTools('tools.node.label'),
      icon: Workflow,
      comingSoon: true,
      activePaths: [ROUTES.STUDIO_NODE],
    },
  ] as const

  return (
    <SidebarContent>
      <SignedIn>
        <SidebarGroup>
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
                      <Link href={link.href}>
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">
            {tTools('groupLabel')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolLinks.map((tool) => {
                const isActive = tool.activePaths.some((p) => pathname === p)
                const Icon = tool.icon
                return (
                  <SidebarMenuItem key={tool.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={tool.label}
                    >
                      <Link href={tool.href}>
                        <Icon className="size-4 shrink-0" />
                        <span>{tool.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {tool.comingSoon && (
                      <SidebarMenuBadge className="text-sidebar-foreground/50">
                        <Lock className="size-3" />
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SignedIn>

      <SignedOut>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === ROUTES.GALLERY}
                  tooltip={t('links.gallery')}
                >
                  <Link href={ROUTES.GALLERY}>
                    <LayoutGrid className="size-4 shrink-0" />
                    <span>{t('links.gallery')}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SignedOut>
    </SidebarContent>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Footer — credit badge / cards / avatar / locale
// ──────────────────────────────────────────────────────────────────────

function AppSidebarFooter() {
  const t = useTranslations('Navbar')

  return (
    <SidebarFooter className="border-t border-sidebar-border/40 gap-2">
      <SignedIn>
        <SidebarFooterCardDrawer />
        <SidebarFooterCreditBadge />
        <SidebarFooterUserMenu />
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

function SidebarFooterCardDrawer() {
  const t = useTranslations('StudioV2')
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <CardDrawer>
          <SidebarMenuButton tooltip={t('cardManagement')}>
            <Library className="size-4 shrink-0" />
            <span>{t('cardManagement')}</span>
          </SidebarMenuButton>
        </CardDrawer>
      </SidebarMenuItem>
    </SidebarMenu>
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
              isCollapsed && 'justify-center px-0',
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
  const { profile: myProfile } = useMyProfile()
  const t = useTranslations('Navbar')
  const tLocale = useTranslations('LocaleSwitcher')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const locale = useLocale() as AppLocale
  const { signOut } = useClerk()
  const router = useRouter()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  const queryString = searchParams.toString()
  const localeHref = queryString ? `${pathname}?${queryString}` : pathname

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPathname, setMenuPathname] = useState<string | null>(null)
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

  const handleViewProfile = useCallback(() => {
    setMenuOpen(false)
    const href = myProfile?.username
      ? creatorProfilePath(myProfile.username)
      : ROUTES.PROFILE
    router.push(href)
  }, [myProfile, router])

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
          isCollapsed && 'justify-center',
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
            isCollapsed && 'hidden',
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
            className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-sidebar-border/60 bg-sidebar/95 backdrop-blur-xl shadow-lg py-1"
          >
            <button
              type="button"
              onClick={handleViewProfile}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <User className="size-4 text-sidebar-foreground/70" />
              {t('viewProfile')}
            </button>
            <div className="mx-2 my-1 border-t border-sidebar-border/40" />
            {LOCALES.map((option) => {
              const isActive = locale === option
              return (
                <Link
                  key={option}
                  href={localeHref}
                  locale={option}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )}
                >
                  <span className="inline-flex size-4 shrink-0 items-center justify-center text-xs font-semibold uppercase text-sidebar-foreground/70">
                    {option.toUpperCase()}
                  </span>
                  {tLocale(`names.${option}`)}
                </Link>
              )
            })}
            <div className="mx-2 my-1 border-t border-sidebar-border/40" />
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <LogOut className="size-4" />
              {t('signOut')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
