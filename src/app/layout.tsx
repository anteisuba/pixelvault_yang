import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'

import { HOMEPAGE_METADATA } from '@/constants/homepage'
import { FONT_VARIABLE_CLASSES } from '@/i18n/fonts'

import './globals.css'
import './canvas.css'

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
    <html
      lang={locale}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={FONT_VARIABLE_CLASSES}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
