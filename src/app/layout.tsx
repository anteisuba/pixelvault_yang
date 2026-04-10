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

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${appSans.variable} ${displayFont.variable} ${serifFont.variable} ${geistMono.variable} ${japaneseSans.variable} ${chineseSans.variable} font-sans antialiased`}
      >
        <ClerkProvider
          localization={CLERK_LOCALIZATIONS[locale] ?? CLERK_LOCALIZATIONS.en}
          signInFallbackRedirectUrl={getPathname({
            locale,
            href: ROUTES.STUDIO,
          })}
          signUpFallbackRedirectUrl={getPathname({
            locale,
            href: ROUTES.STUDIO,
          })}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
