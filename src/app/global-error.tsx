'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'
import zhMessages from '@/messages/zh.json'
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/i18n/routing'

const GLOBAL_ERROR_COPY: Record<
  AppLocale,
  { title: string; description: string; action: string }
> = {
  en: enMessages.GlobalError,
  ja: jaMessages.GlobalError,
  zh: zhMessages.GlobalError,
}

function getLocaleFromPath(pathname: string | null): AppLocale {
  const localeCandidate = pathname?.split('/')[1] ?? DEFAULT_LOCALE
  return isAppLocale(localeCandidate) ? localeCandidate : DEFAULT_LOCALE
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  const locale = getLocaleFromPath(pathname)
  const copy = GLOBAL_ERROR_COPY[locale]

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background text-foreground">
        <main className="editorial-page flex min-h-screen items-center justify-center">
          <div className="editorial-container">
            <section className="editorial-panel mx-auto max-w-xl text-center">
              <div className="space-y-4">
                <p className="editorial-eyebrow mx-auto">{copy.title}</p>
                <h1 className="font-display text-3xl font-medium tracking-tight text-balance sm:text-4xl">
                  {copy.title}
                </h1>
                <p className="font-serif text-sm leading-7 text-muted-foreground sm:text-base">
                  {copy.description}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {copy.action}
                </button>
              </div>
            </section>
          </div>
        </main>
      </body>
    </html>
  )
}
