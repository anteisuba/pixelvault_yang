'use client'

import { SignedIn, SignedOut } from '@clerk/nextjs'
import { Coins, UserCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Button } from '@/components/ui/button'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { summary, isLoading } = useUsageSummary()
  const t = useTranslations('Navbar')
  const tCommon = useTranslations('Common')
  const pathname = usePathname()

  const signedInLinks = [
    { href: ROUTES.GALLERY, label: t('links.gallery') },
    { href: ROUTES.STUDIO, label: t('links.studio') },
    { href: ROUTES.ARENA, label: t('links.arena') },
    { href: ROUTES.STORYBOARD, label: t('links.storyboard') },
    { href: ROUTES.PROFILE, label: t('links.library') },
  ]
  const signedOutLinks = [{ href: ROUTES.GALLERY, label: t('links.gallery') }]

  return (
    <header className="sticky top-0 z-50 border-b border-border/75 bg-background/88 backdrop-blur-md">
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
                    'after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform hover:after:scale-x-100',
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
                    'after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform hover:after:scale-x-100',
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
            <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-card/84 px-3 py-1.5 text-nav font-semibold uppercase tracking-nav-dense text-foreground">
              <Coins className="size-3.5 shrink-0 text-primary" />
              <span className="hidden sm:inline">
                {isLoading
                  ? t('creditsLoading')
                  : tCommon('creditCount', { count: summary.totalRequests })}
              </span>
            </div>
            <Link
              href={ROUTES.PROFILE}
              className="flex size-8 items-center justify-center rounded-full border border-border/80 bg-card/84 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('links.library')}
            >
              <UserCircle className="size-4.5" />
            </Link>
          </SignedIn>

          <SignedOut>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-full border-border/80 bg-card/72 px-4 text-nav font-semibold uppercase tracking-nav"
            >
              <Link href={ROUTES.SIGN_IN}>{t('signIn')}</Link>
            </Button>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
