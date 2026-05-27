'use client'

import { LayoutGrid, LogIn, PanelLeft, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'

import { ROUTES } from '@/constants/routes'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/components/ui/sidebar'

const MOBILE_TAB_ITEM_CLASS_NAME =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors duration-[180ms] ease-out [&:active]:opacity-72 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring/75 focus-visible:-outline-offset-2 focus-visible:rounded-sm'

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

interface TabListProps {
  tabs: TabItem[]
  pathname: string
}

function isTabActive(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
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

export function MobileHeader() {
  const pathname = usePathname()
  const t = useTranslations('Navbar')
  const tCommon = useTranslations('Common')
  const { openMobile, toggleSidebar } = useSidebar()
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
    <header className="fixed inset-x-0 top-0 z-40 flex h-11 items-center border-b border-border/60 bg-background/90 backdrop-blur-xl backdrop-saturate-150 md:hidden">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={t('openMenu')}
        aria-expanded={openMobile}
        className={cn(
          'flex h-full w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-[180ms] ease-out',
          '[&:active]:opacity-72 [-webkit-tap-highlight-color:transparent] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring/75 focus-visible:-outline-offset-2 focus-visible:rounded-sm',
        )}
      >
        <PanelLeft className="size-4" />
      </button>
      <div className="min-w-0 flex-1 px-1">
        <div className="truncate text-center font-display text-sm font-semibold text-foreground">
          {title}
        </div>
      </div>
      <div className="w-11 shrink-0" aria-hidden />
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-xl backdrop-saturate-150 md:hidden"
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
