'use client'

import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import { Coins } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher'
import { Button } from '@/components/ui/button'
import { useCredits } from '@/hooks/use-credits'
import { Link } from '@/i18n/navigation'

export function Navbar() {
  const { credits, isLoading } = useCredits()
  const t = useTranslations('Navbar')
  const tCommon = useTranslations('Common')

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <SignedIn>
          <Link
            href={ROUTES.STUDIO}
            className="font-display text-lg font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            {tCommon('brand')}
          </Link>
        </SignedIn>
        <SignedOut>
          <Link
            href={ROUTES.SIGN_IN}
            className="font-display text-lg font-bold tracking-tight hover:opacity-80 transition-opacity"
          >
            {tCommon('brand')}
          </Link>
        </SignedOut>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <LocaleSwitcher />

          <SignedIn>
            {/* Credits — icon always visible, text hidden on mobile */}
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm">
              <Coins className="size-4 shrink-0 text-yellow-500" />
              <span className="hidden sm:inline">
                {isLoading
                  ? t('creditsLoading')
                  : tCommon('creditCount', { count: credits })}
              </span>
            </div>
            <UserButton />
          </SignedIn>

          <SignedOut>
            <Button asChild size="sm">
              <Link href={ROUTES.SIGN_IN}>{t('signIn')}</Link>
            </Button>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
