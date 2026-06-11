'use client'

import Image from 'next/image'
import {
  Box,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Library,
  LogIn,
  Mic,
  Palette,
  PanelLeft,
  Sparkles,
  Swords,
  UserCircle,
  Video,
  Wand2,
  Workflow,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'

import { ROUTES } from '@/constants/routes'
import { Link, usePathname } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/components/ui/sidebar'

const MOBILE_TAB_ITEM_CLASS_NAME =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors duration-[180ms] ease-out [&:active]:opacity-72 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring/75 focus-visible:-outline-offset-2 focus-visible:rounded-sm'

const MOBILE_RAIL_ITEM_CLASS_NAME =
  'flex h-11 w-11 shrink-0 items-center justify-center text-sidebar-foreground/58 transition-colors duration-[180ms] ease-out [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring/75 focus-visible:-outline-offset-2'

interface TabItem {
  href: string
  label: string
  icon: React.ElementType
  /**
   * Optional override for the route prefix used to compute the active state.
   * Defaults to `href`. The Studio tab points at `/studio/image` for fast
   * navigation but should still light up on `/studio/video|audio|3d` etc.
   */
  activePrefix?: string
}

interface RailActiveRule {
  path: string
  exact?: boolean
}

interface RailItem {
  href: string
  label: string
  icon: React.ElementType
  activeRules: RailActiveRule[]
}

interface TabListProps {
  tabs: TabItem[]
  pathname: string
}

function isTabActive(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function isRailItemActive(pathname: string, rules: RailActiveRule[]): boolean {
  return rules.some(({ path, exact }) =>
    exact ? pathname === path : isTabActive(pathname, path),
  )
}

function TabList({ tabs, pathname }: TabListProps) {
  return (
    <div className="flex h-full flex-1 items-stretch">
      {tabs.map(({ href, label, icon: Icon, activePrefix }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            MOBILE_TAB_ITEM_CLASS_NAME,
            isTabActive(pathname, activePrefix ?? href) && 'text-primary',
          )}
        >
          <Icon className="size-5" />
          <span className="max-w-[4.5rem] truncate text-3xs font-medium leading-none">
            {label}
          </span>
        </Link>
      ))}
    </div>
  )
}

function MobileRailLink({ href, label, icon: Icon, activeRules }: RailItem) {
  const pathname = usePathname()
  const isActive = isRailItemActive(pathname, activeRules)

  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        MOBILE_RAIL_ITEM_CLASS_NAME,
        'hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:bg-sidebar-accent active:text-sidebar-foreground',
        isActive && 'text-sidebar-foreground',
      )}
    >
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-lg transition-colors duration-[180ms]',
          isActive && 'bg-sidebar-accent text-sidebar-foreground',
        )}
      >
        <Icon className="size-4" />
      </span>
    </Link>
  )
}

function MobileRailAccountButton() {
  const t = useTranslations('Navbar')
  const { user } = useUser()
  const { setOpenMobile } = useSidebar()

  return (
    <button
      type="button"
      onClick={() => setOpenMobile(true)}
      aria-label={t('viewProfile')}
      className={cn(
        MOBILE_RAIL_ITEM_CLASS_NAME,
        'hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:bg-sidebar-accent active:text-sidebar-foreground',
      )}
    >
      <span className="flex size-8 items-center justify-center overflow-hidden rounded-full border border-sidebar-border/70 bg-sidebar-accent text-sidebar-foreground/70">
        {user?.imageUrl ? (
          <Image
            src={user.imageUrl}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          <UserCircle className="size-5" aria-hidden />
        )}
      </span>
    </button>
  )
}

function MobileRailSignedOutLink() {
  const t = useTranslations('Navbar')

  return (
    <Link
      href={ROUTES.SIGN_IN}
      aria-label={t('signIn')}
      title={t('signIn')}
      className={cn(
        MOBILE_RAIL_ITEM_CLASS_NAME,
        'hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:bg-sidebar-accent active:text-sidebar-foreground',
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-sidebar-border/70 bg-sidebar-accent text-sidebar-foreground/70">
        <UserCircle className="size-5" aria-hidden />
      </span>
    </Link>
  )
}

export function MobileCollapsedRail() {
  const t = useTranslations('Navbar')
  const tTools = useTranslations('StudioTools')
  const { openMobile, toggleSidebar } = useSidebar()

  if (openMobile) return null

  const primaryLinks: RailItem[] = [
    {
      href: ROUTES.GALLERY,
      label: t('links.gallery'),
      icon: LayoutGrid,
      activeRules: [{ path: ROUTES.GALLERY }],
    },
    {
      href: ROUTES.PROMPTS,
      label: t('links.prompts'),
      icon: FileText,
      activeRules: [{ path: ROUTES.PROMPTS }],
    },
    {
      href: ROUTES.ASSETS,
      label: t('links.assets'),
      icon: Library,
      activeRules: [{ path: ROUTES.ASSETS }],
    },
    {
      href: ROUTES.CARDS,
      label: t('links.cards'),
      icon: Layers,
      activeRules: [{ path: ROUTES.CARDS }],
    },
  ]

  const toolLinks: RailItem[] = [
    {
      href: ROUTES.STUDIO_IMAGE,
      label: tTools('tools.image.label'),
      icon: ImageIcon,
      activeRules: [
        { path: ROUTES.STUDIO, exact: true },
        { path: ROUTES.STUDIO_IMAGE },
      ],
    },
    {
      href: ROUTES.STUDIO_VIDEO,
      label: tTools('tools.video.label'),
      icon: Video,
      activeRules: [{ path: ROUTES.STUDIO_VIDEO }],
    },
    {
      href: ROUTES.STUDIO_AUDIO,
      label: tTools('tools.audio.label'),
      icon: Mic,
      activeRules: [{ path: ROUTES.STUDIO_AUDIO }],
    },
    {
      href: ROUTES.STUDIO_3D,
      label: tTools('tools.model3d.label'),
      icon: Box,
      activeRules: [{ path: ROUTES.STUDIO_3D }],
    },
    {
      href: ROUTES.STUDIO_EDIT,
      label: tTools('tools.edit.label'),
      icon: Wand2,
      activeRules: [{ path: ROUTES.STUDIO_EDIT }],
    },
    {
      href: ROUTES.STUDIO_LORA,
      label: tTools('tools.lora.label'),
      icon: Palette,
      activeRules: [{ path: ROUTES.STUDIO_LORA }],
    },
    {
      href: ROUTES.STUDIO_NODE,
      label: tTools('tools.node.label'),
      icon: Workflow,
      activeRules: [{ path: ROUTES.STUDIO_NODE }],
    },
    {
      href: ROUTES.ARENA,
      label: t('links.arena'),
      icon: Swords,
      activeRules: [
        { path: ROUTES.ARENA },
        { path: ROUTES.ARENA_HISTORY },
        { path: ROUTES.ARENA_LEADERBOARD },
      ],
    },
  ]

  return (
    <aside
      aria-label={t('mobileNavigation')}
      className="dark fixed inset-y-0 left-0 z-50 flex w-11 flex-col border-r border-sidebar-border/80 bg-sidebar text-sidebar-foreground lg:hidden"
    >
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={t('openMenu')}
        aria-expanded={openMobile}
        className={cn(
          MOBILE_RAIL_ITEM_CLASS_NAME,
          'border-b border-sidebar-border/40 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground active:bg-sidebar-accent',
        )}
      >
        <PanelLeft className="size-4" />
      </button>

      <nav className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col">
          {primaryLinks.map((item) => (
            <MobileRailLink key={item.href} {...item} />
          ))}
        </div>
        <div className="my-1 border-t border-sidebar-border/40" />
        <div className="flex flex-col">
          {toolLinks.map((item) => (
            <MobileRailLink key={item.href} {...item} />
          ))}
        </div>
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-sidebar-border/40 py-1">
        <LocaleSwitcher tone="sidebar" orientation="vertical" />
        <SignedIn>
          <MobileRailAccountButton />
        </SignedIn>
        <SignedOut>
          <MobileRailSignedOutLink />
        </SignedOut>
      </div>
    </aside>
  )
}

export function MobileHeader() {
  const pathname = usePathname()
  const t = useTranslations('Navbar')
  const tCommon = useTranslations('Common')
  const title = (() => {
    if (isTabActive(pathname, ROUTES.STUDIO)) return t('links.studio')
    if (isTabActive(pathname, ROUTES.GALLERY)) return t('links.gallery')
    if (isTabActive(pathname, ROUTES.PROMPTS)) return t('links.prompts')
    if (isTabActive(pathname, ROUTES.ASSETS)) return t('links.assets')
    if (isTabActive(pathname, ROUTES.CARDS)) return t('links.cards')
    if (isTabActive(pathname, ROUTES.ARENA)) return t('links.arena')
    if (isTabActive(pathname, ROUTES.STORYBOARD)) return t('links.storyboard')
    return tCommon('brand')
  })()

  return (
    <header className="fixed left-11 right-0 top-0 z-40 flex h-11 items-center border-b border-border/60 bg-background/90 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="min-w-0 flex-1 px-1">
        <div className="truncate text-center font-display text-sm font-semibold text-foreground">
          {title}
        </div>
      </div>
    </header>
  )
}

export function MobileTabBar() {
  const pathname = usePathname()
  const t = useTranslations('Navbar')
  // Same hydration story as AppSidebar — wait for Clerk before rendering
  // the auth-conditional tab list.
  const { isLoaded } = useUser()

  const signedInTabs: TabItem[] = [
    {
      href: ROUTES.STUDIO_IMAGE,
      label: t('links.create'),
      icon: Sparkles,
      activePrefix: ROUTES.STUDIO,
    },
    { href: ROUTES.GALLERY, label: t('links.gallery'), icon: LayoutGrid },
  ]

  const signedOutTabs: TabItem[] = [
    { href: ROUTES.GALLERY, label: t('links.gallery'), icon: LayoutGrid },
    { href: ROUTES.SIGN_IN, label: t('signIn'), icon: LogIn },
  ]

  return (
    <nav
      aria-label={t('mobileNavigation')}
      className="fixed bottom-0 left-11 right-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl backdrop-saturate-150 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="h-12">
        {isLoaded && (
          <>
            <SignedIn>
              <TabList tabs={signedInTabs} pathname={pathname} />
            </SignedIn>
            <SignedOut>
              <TabList tabs={signedOutTabs} pathname={pathname} />
            </SignedOut>
          </>
        )}
      </div>
    </nav>
  )
}
