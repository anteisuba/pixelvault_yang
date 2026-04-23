'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SignedIn, SignedOut, useClerk } from '@clerk/nextjs'
import Image from 'next/image'
import { Coins, LogOut, User, UserCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'

import { ROUTES, creatorProfilePath } from '@/constants/routes'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Button } from '@/components/ui/button'
import { HyperText } from '@/components/ui/hyper-text'
import { NumberTicker } from '@/components/ui/number-ticker'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CardDrawer } from '@/components/business/CardDrawer'
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
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isMenuOpen = menuOpen && menuPathname === pathname

  // Floating effect on scroll
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

  const renderNavLinks = (links: typeof signedInLinks) => (
    <nav className="hidden items-center gap-1 md:flex">
      {links.map((link) => {
        const isActive = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'relative rounded-full px-3 py-2.5 text-nav font-semibold uppercase tracking-nav text-muted-foreground transition-colors duration-200 hover:text-foreground',
              isActive && 'text-foreground',
            )}
          >
            {isActive && (
              <motion.span
                layoutId="navbar-indicator"
                className="absolute inset-0 rounded-full bg-primary/10"
                transition={{
                  type: 'tween',
                  ease: 'easeOut',
                  duration: 0.3,
                }}
              />
            )}
            <span className="relative z-10">{link.label}</span>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-border/40 bg-background/70 backdrop-blur-2xl backdrop-saturate-150 shadow-sm'
          : 'border-b border-border/60 bg-background/80 backdrop-blur-xl backdrop-saturate-150',
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-content items-center justify-between gap-3 px-4 transition-all duration-300 sm:gap-4 sm:px-6 lg:gap-5 lg:px-8',
          scrolled ? 'h-12' : 'h-14',
        )}
      >
        <div className="flex min-w-0 items-center gap-3 sm:gap-5 lg:gap-8">
          <SignedIn>
            <Link href={ROUTES.STUDIO} className="shrink-0">
              <HyperText
                as="span"
                duration={600}
                animateOnHover
                className="font-display text-brand font-bold leading-none tracking-brand max-sm:text-sm !py-0"
              >
                {tCommon('brand')}
              </HyperText>
            </Link>
          </SignedIn>
          <SignedOut>
            <Link href={ROUTES.HOME} className="shrink-0">
              <HyperText
                as="span"
                duration={600}
                animateOnHover
                className="font-display text-brand font-bold leading-none tracking-brand max-sm:text-sm !py-0"
              >
                {tCommon('brand')}
              </HyperText>
            </Link>
          </SignedOut>

          <SignedIn>{renderNavLinks(signedInLinks)}</SignedIn>
          <SignedOut>{renderNavLinks(signedOutLinks)}</SignedOut>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />

          <SignedIn>
            <CardDrawer />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-nav font-semibold uppercase tracking-nav-dense text-foreground">
                    <Coins className="size-3.5 shrink-0 text-primary" />
                    <span className="hidden sm:inline">
                      {isLoading ? (
                        t('creditsLoading')
                      ) : (
                        <NumberTicker
                          value={summary.totalRequests}
                          className="text-nav font-semibold text-foreground"
                        />
                      )}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('creditsTooltip')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Avatar dropdown with animated tooltip */}
            <div className="relative" ref={menuRef}>
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.button
                      type="button"
                      onClick={() => {
                        setMenuPathname(pathname)
                        setMenuOpen((value) => !value)
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-card/70 text-muted-foreground transition-colors hover:text-foreground hover:border-primary/25 hover:bg-primary/5"
                      aria-label={t('viewProfile')}
                      aria-expanded={isMenuOpen}
                      aria-haspopup="true"
                    >
                      {myProfile?.avatarUrl ? (
                        <Image
                          src={myProfile.avatarUrl}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="size-full rounded-full object-cover"
                        />
                      ) : (
                        <UserCircle className="size-4.5" />
                      )}
                    </motion.button>
                  </TooltipTrigger>
                  {!isMenuOpen && (
                    <TooltipContent>
                      <p>{myProfile?.displayName ?? t('viewProfile')}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              {/* Dropdown menu */}
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-lg py-1"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
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
