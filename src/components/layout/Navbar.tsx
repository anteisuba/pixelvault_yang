'use client'

import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import { Coins } from 'lucide-react'
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
    { href: ROUTES.PROFILE, label: t('links.library') },
  ]
  const signedOutLinks = [{ href: ROUTES.GALLERY, label: t('links.gallery') }]

  return (
    <header className="sticky top-0 z-50 border-b border-border/75 bg-background/88 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[78rem] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-5 lg:gap-8">
          <SignedIn>
            <Link
              href={ROUTES.STUDIO}
              className="font-display text-[1.12rem] font-medium tracking-[-0.04em] transition-opacity hover:opacity-75"
            >
              {tCommon('brand')}
            </Link>
          </SignedIn>
          <SignedOut>
            <Link
              href={ROUTES.HOME}
              className="font-display text-[1.12rem] font-medium tracking-[-0.04em] transition-opacity hover:opacity-75"
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
                    'relative py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground',
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
                    'relative py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground',
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
            <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-card/84 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
              <Coins className="size-3.5 shrink-0 text-primary" />
              <span className="hidden sm:inline">
                {isLoading
                  ? t('creditsLoading')
                  : tCommon('creditCount', { count: summary.totalRequests })}
              </span>
            </div>
            <UserButton />
          </SignedIn>

          <SignedOut>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-full border-border/80 bg-card/72 px-4 text-[11px] font-semibold uppercase tracking-[0.16em]"
            >
              <Link href={ROUTES.SIGN_IN}>{t('signIn')}</Link>
            </Button>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
