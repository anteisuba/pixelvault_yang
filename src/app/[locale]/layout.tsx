import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server'
import { notFound } from 'next/navigation'

import { isAppLocale, LOCALES } from '@/i18n/routing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

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
    metadataBase: new URL(APP_URL),
    openGraph: {
      title,
      description,
      siteName: 'PixelVault',
      type: 'website',
      locale,
      url: `${APP_URL}/${locale}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `${APP_URL}/${locale}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${APP_URL}/${l}`])),
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

  const messages = await getMessages({ locale })

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
