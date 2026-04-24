import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'

import { HOMEPAGE_METADATA } from '@/constants/homepage'
import {
  appSans,
  chineseSans,
  displayFont,
  geistMono,
  japaneseSans,
  serifFont,
} from '@/i18n/fonts'

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
    <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${appSans.variable} ${displayFont.variable} ${serifFont.variable} ${geistMono.variable} ${japaneseSans.variable} ${chineseSans.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
