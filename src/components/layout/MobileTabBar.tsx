'use client'

import { LayoutGrid, LogIn, PanelLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'

import { ROUTES } from '@/constants/routes'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/components/ui/sidebar'

const MOBILE_TAB_ITEM_CLASS_NAME =
  'flex flex-1 flex-col items-center justify-center gap-[0.35rem] text-muted-foreground transition-colors duration-[180ms] ease-out [&:active]:opacity-72 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring/75 focus-visible:-outline-offset-2 focus-visible:rounded-sm'

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
          <span className="text-tab font-semibold tracking-[0.04em] uppercase leading-none truncate max-w-[4.5rem]">
            {label}
          </span>
        </Link>
      ))}
    </div>
  )
}

function MobileMenuButton() {
  const t = useTranslations('Navbar')
  const { openMobile, toggleSidebar } = useSidebar()

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={t('openMenu')}
      aria-expanded={openMobile}
      className={MOBILE_TAB_ITEM_CLASS_NAME}
    >
      <PanelLeft className="size-5" />
      <span className="text-tab font-semibold tracking-[0.04em] uppercase leading-none truncate max-w-[4.5rem]">
        {t('menu')}
      </span>
    </button>
  )
}

export function MobileTabBar() {
  const pathname = usePathname()
  const t = useTranslations('Navbar')
  // Same hydration story as AppSidebar — wait for Clerk before rendering
  // the auth-conditional tab list.
  const { isLoaded } = useUser()

  const signedInTabs: TabItem[] = [
    { href: ROUTES.GALLERY, label: t('links.gallery'), icon: LayoutGrid },
  ]

  const signedOutTabs: TabItem[] = [
    { href: ROUTES.GALLERY, label: t('links.gallery'), icon: LayoutGrid },
    { href: ROUTES.SIGN_IN, label: t('signIn'), icon: LogIn },
  ]

  return (
    <nav
      aria-label={t('mobileNavigation')}
      className="fixed bottom-0 inset-x-0 z-50 border-t border-border/60 bg-background/80 backdrop-blur-xl backdrop-saturate-150 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="h-14">
        {isLoaded && (
          <>
            <SignedIn>
              <div className="flex h-full items-stretch">
                <MobileMenuButton />
                <TabList tabs={signedInTabs} pathname={pathname} />
              </div>
            </SignedIn>
            <SignedOut>
              <div className="flex h-full items-stretch">
                <MobileMenuButton />
                <TabList tabs={signedOutTabs} pathname={pathname} />
              </div>
            </SignedOut>
          </>
        )}
      </div>
    </nav>
  )
}
