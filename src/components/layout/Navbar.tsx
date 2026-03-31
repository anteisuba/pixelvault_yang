'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SignedIn, SignedOut, useClerk } from '@clerk/nextjs'
import Image from 'next/image'
import { Coins, LogOut, User, UserCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ROUTES, creatorProfilePath } from '@/constants/routes'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Button } from '@/components/ui/button'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { summary, isLoading } = useUsageSummary()
  const { profile: myProfile } = useMyProfile()
  const t = useTranslations('Navbar')
  const tCommon = useTranslations('Common')
  const pathname = usePathname()
  const { signOut } = useClerk()
  const router = useRouter()

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPathname, setMenuPathname] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMenuOpen = menuOpen && menuPathname === pathname

  // Close menu on outside click
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

  const signedInLinks = [
    { href: ROUTES.GALLERY, label: t('links.gallery') },
    { href: ROUTES.STUDIO, label: t('links.studio') },
    { href: ROUTES.ARENA, label: t('links.arena') },
    { href: ROUTES.STORYBOARD, label: t('links.storyboard') },
    { href: ROUTES.PROFILE, label: t('links.library') },
  ]
  const signedOutLinks = [{ href: ROUTES.GALLERY, label: t('links.gallery') }]

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-content items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:gap-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-5 lg:gap-8">
          <SignedIn>
            <Link
              href={ROUTES.STUDIO}
              className="font-display text-brand font-medium tracking-brand transition-opacity hover:opacity-75"
            >
              {tCommon('brand')}
            </Link>
          </SignedIn>
          <SignedOut>
            <Link
              href={ROUTES.HOME}
              className="font-display text-brand font-medium tracking-brand transition-opacity hover:opacity-75"
            >
              {tCommon('brand')}
            </Link>
          </SignedOut>

          <SignedIn>
            <nav className="hidden items-center gap-4 md:flex">
              {signedInLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative py-1 text-nav font-semibold uppercase tracking-nav text-muted-foreground transition-colors hover:text-foreground',
                    'after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-full after:origin-left after:scale-x-0 after:bg-primary after:transition-transform hover:after:scale-x-100',
                    pathname === link.href &&
                      'text-foreground after:scale-x-100',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </SignedIn>

          <SignedOut>
            <nav className="hidden items-center gap-4 md:flex">
              {signedOutLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'relative py-1 text-nav font-semibold uppercase tracking-nav text-muted-foreground transition-colors hover:text-foreground',
                    'after:absolute after:bottom-0 after:left-0 after:h-[1.5px] after:w-full after:origin-left after:scale-x-0 after:bg-primary after:transition-transform hover:after:scale-x-100',
                    pathname === link.href &&
                      'text-foreground after:scale-x-100',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </SignedOut>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />

          <SignedIn>
            <div className="flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-nav font-semibold uppercase tracking-nav-dense text-foreground">
              <Coins className="size-3.5 shrink-0 text-primary" />
              <span className="hidden sm:inline">
                {isLoading
                  ? t('creditsLoading')
                  : tCommon('creditCount', { count: summary.totalRequests })}
              </span>
            </div>

            {/* Avatar dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => {
                  setMenuPathname(pathname)
                  setMenuOpen((value) => !value)
                }}
                className="flex size-12 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-card/70 text-muted-foreground transition-all hover:text-foreground hover:border-primary/25 hover:bg-primary/5"
                aria-label={t('viewProfile')}
                aria-expanded={isMenuOpen}
                aria-haspopup="true"
              >
                {myProfile?.avatarUrl ? (
                  <Image
                    src={myProfile.avatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="size-full rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <UserCircle className="size-4.5" />
                )}
              </button>

              {/* Dropdown menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-border/60 bg-background/95 backdrop-blur-xl shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <button
                    type="button"
                    onClick={handleViewProfile}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-primary/5 transition-colors"
                  >
                    <User className="size-4 text-muted-foreground" />
                    {t('viewProfile')}
                  </button>
                  <div className="mx-2 my-1 border-t border-border/40" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-colors"
                  >
                    <LogOut className="size-4" />
                    {t('signOut')}
                  </button>
                </div>
              )}
            </div>
          </SignedIn>

          <SignedOut>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-full border-primary/20 bg-primary/5 px-4 text-nav font-semibold uppercase tracking-nav hover:bg-primary/10"
            >
              <Link href={ROUTES.SIGN_IN}>{t('signIn')}</Link>
            </Button>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
