'use client'

import {
  BookOpen,
  FolderOpen,
  LayoutGrid,
  LogIn,
  Sparkles,
  Swords,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'

import { ROUTES } from '@/constants/routes'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

interface TabItem {
  href: string
  label: string
  icon: React.ElementType
}

interface TabListProps {
  tabs: TabItem[]
  pathname: string
}

/**
 * Whether `pathname` should activate a tab pointing at `href`. Equality covers
 * the literal route, prefix-with-trailing-slash covers per-media-type Studio
 * routes (`/studio/image|video|audio` all activate the `/studio` tab) and the
 * Assets sub-routes if any are added later.
 */
function isTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function TabList({ tabs, pathname }: TabListProps) {
  return (
    <div className="flex h-full items-stretch">
      {tabs.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-[0.35rem] text-muted-foreground transition-colors duration-[180ms] ease-out [&:active]:opacity-72 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring/75 focus-visible:-outline-offset-2 focus-visible:rounded-sm',
            isTabActive(pathname, href) && 'text-primary',
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

export function MobileTabBar() {
  const pathname = usePathname()
  const t = useTranslations('Navbar')
  // Same hydration story as AppSidebar — wait for Clerk before rendering
  // the auth-conditional tab list.
  const { isLoaded } = useUser()

  const signedInTabs: TabItem[] = [
    { href: ROUTES.GALLERY, label: t('links.gallery'), icon: LayoutGrid },
    { href: ROUTES.STUDIO, label: t('links.studio'), icon: Sparkles },
    { href: ROUTES.ARENA, label: t('links.arena'), icon: Swords },
    { href: ROUTES.STORYBOARD, label: t('links.storyboard'), icon: BookOpen },
    { href: ROUTES.ASSETS, label: t('links.assets'), icon: FolderOpen },
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
