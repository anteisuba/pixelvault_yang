'use client'

import {
  BookOpen,
  LayoutGrid,
  LogIn,
  Sparkles,
  Swords,
  User,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { SignedIn, SignedOut } from '@clerk/nextjs'

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

function TabList({ tabs, pathname }: TabListProps) {
  return (
    <div className="flex h-full items-stretch">
      {tabs.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-[0.35rem] text-muted-foreground transition-colors duration-[180ms] ease-out [&:active]:opacity-72 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-ring/75 focus-visible:-outline-offset-2 focus-visible:rounded-sm',
            pathname === href && 'text-primary',
          )}
        >
          <Icon className="size-5" />
          <span className="text-tab font-semibold tracking-[0.12em] uppercase leading-none">
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

  const signedInTabs: TabItem[] = [
    { href: ROUTES.GALLERY, label: t('links.gallery'), icon: LayoutGrid },
    { href: ROUTES.STUDIO, label: t('links.studio'), icon: Sparkles },
    { href: ROUTES.ARENA, label: t('links.arena'), icon: Swords },
    { href: ROUTES.STORYBOARD, label: t('links.storyboard'), icon: BookOpen },
    { href: ROUTES.PROFILE, label: t('links.library'), icon: User },
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
        <SignedIn>
          <TabList tabs={signedInTabs} pathname={pathname} />
        </SignedIn>
        <SignedOut>
          <TabList tabs={signedOutTabs} pathname={pathname} />
        </SignedOut>
      </div>
    </nav>
  )
}
