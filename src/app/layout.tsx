import type { Metadata } from 'next'
import { VercelToolbar } from '@vercel/toolbar/next'
import { getLocale } from 'next-intl/server'

import { HOMEPAGE_METADATA } from '@/constants/homepage'
import {
  appSans,
  chineseSans,
  displayFont,
  editorialSerif,
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
  const isDev = process.env.NODE_ENV === 'development'
  const showVercelToolbar =
    isDev && process.env.NEXT_PUBLIC_ENABLE_VERCEL_TOOLBAR === 'true'

  return (
    <html
      lang={locale}
      className="dark"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body
        className={`${appSans.variable} ${displayFont.variable} ${serifFont.variable} ${editorialSerif.variable} ${geistMono.variable} ${japaneseSans.variable} ${chineseSans.variable} font-sans antialiased`}
      >
        {children}
        {showVercelToolbar && <VercelToolbar />}
      </body>
    </html>
  )
}
