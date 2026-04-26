'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function CreatorProfileErrorPage({
  error,
  reset,
}: ErrorPageProps) {
  const t = useTranslations('ErrorBoundary')

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
          <span className="rounded-2xl bg-destructive/10 p-4 text-destructive">
            <AlertTriangle className="size-8" />
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-medium tracking-tight">
              {t('title')}
            </h1>
            <p className="max-w-md font-serif text-sm leading-6 text-muted-foreground">
              {t('description')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={reset} className="rounded-full">
              <RotateCcw className="size-4" />
              {t('retry')}
            </Button>
            <Button asChild className="rounded-full">
              <a href={ROUTES.HOME}>
                <Home className="size-4" />
                {t('home')}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
