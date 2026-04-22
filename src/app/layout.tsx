import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { getLocale } from 'next-intl/server'

import { HOMEPAGE_METADATA } from '@/constants/homepage'
import { ROUTES } from '@/constants/routes'
import { CLERK_LOCALIZATIONS } from '@/i18n/clerk'
import { appSans, chineseSans, displayFont, geistMono, japaneseSans, serifFont } from '@/i18n/fonts'
import { getPathname } from '@/i18n/navigation'

import './globals.css'

export const metadata: Metadata = {
  title: HOMEPAGE_METADATA.title,
  description: HOMEPAGE_METADATA.description,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
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
    href: ROUTES.STUDIO,
  })

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${appSans.variable} ${displayFont.variable} ${serifFont.variable} ${geistMono.variable} ${japaneseSans.variable} ${chineseSans.variable} font-sans antialiased`}
      >
        <ClerkProvider
          localization={CLERK_LOCALIZATIONS[locale] ?? CLERK_LOCALIZATIONS.en}
          signInUrl={signInUrl}
          signUpUrl={signUpUrl}
          signInFallbackRedirectUrl={studioUrl}
          signUpFallbackRedirectUrl={studioUrl}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
