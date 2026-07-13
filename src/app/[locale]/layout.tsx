import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { NextIntlClientProvider } from 'next-intl'
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server'
import { notFound } from 'next/navigation'

import { getAppOrigin, getClerkAllowedOrigins } from '@/constants/config'
import { ROUTES } from '@/constants/routes'
import { AuthModalProvider } from '@/components/business/AuthModalProvider'
import { CLERK_LOCALIZATIONS } from '@/i18n/clerk'
import { MARKETING_NAMESPACES, pickMessages } from '@/i18n/messages-split'
import { getPathname } from '@/i18n/navigation'
import { isAppLocale, LOCALES } from '@/i18n/routing'

const APP_ORIGIN = getAppOrigin()
const CLERK_ALLOWED_REDIRECT_ORIGINS = getClerkAllowedOrigins()

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>
}>): Promise<Metadata> {
  const { locale } = await params

  if (!isAppLocale(locale)) {
    return {}
  }

  const t = await getTranslations({
    locale,
    namespace: 'Metadata',
  })

  const title = t('title')
  const description = t('description')
  const keywords = t.has('keywords') ? t('keywords') : undefined

  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    metadataBase: new URL(APP_ORIGIN),
    openGraph: {
      title,
      description,
      siteName: 'PixelVault',
      type: 'website',
      locale,
      url: `${APP_ORIGIN}/${locale}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `${APP_ORIGIN}/${locale}`,
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `${APP_ORIGIN}/${l}`]),
      ),
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  if (!isAppLocale(locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const signInUrl = getPathname({
    locale,
    href: ROUTES.SIGN_IN,
  })
  const signUpUrl = getPathname({
    locale,
    href: ROUTES.SIGN_UP,
  })
  const studioUrl = getPathname({
    locale,
    href: ROUTES.STUDIO_IMAGE,
  })
  // Root provider only carries the namespaces used by marketing + auth
  // surfaces. `(main)/layout.tsx` re-wraps with the full bundle. See
  // `src/i18n/messages-split.ts` for details.
  const allMessages = await getMessages({ locale })
  const marketingMessages = pickMessages(allMessages, MARKETING_NAMESPACES)

  return (
    <ClerkProvider
      localization={CLERK_LOCALIZATIONS[locale]}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={studioUrl}
      signUpFallbackRedirectUrl={studioUrl}
      allowedRedirectOrigins={CLERK_ALLOWED_REDIRECT_ORIGINS}
    >
      <NextIntlClientProvider locale={locale} messages={marketingMessages}>
        <AuthModalProvider>{children}</AuthModalProvider>
      </NextIntlClientProvider>
    </ClerkProvider>
  )
}
