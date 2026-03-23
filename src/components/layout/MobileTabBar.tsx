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

import styles from './MobileTabBar.module.css'

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
    <div className={styles.tabList}>
      {tabs.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(styles.tabLink, pathname === href && styles.active)}
        >
          <Icon className="size-5" />
          <span className={styles.tabLabel}>{label}</span>
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
      aria-label="Mobile navigation"
      className="fixed bottom-0 inset-x-0 z-50 h-14 border-t border-border/75 bg-background/92 backdrop-blur-md md:hidden"
    >
      <SignedIn>
        <TabList tabs={signedInTabs} pathname={pathname} />
      </SignedIn>
      <SignedOut>
        <TabList tabs={signedOutTabs} pathname={pathname} />
      </SignedOut>
    </nav>
  )
}
