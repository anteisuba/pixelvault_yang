import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'

import { HOMEPAGE_METADATA } from '@/constants/homepage'
import {
  appSans,
  chineseSans,
  geistMono,
  homepageSerif,
  japaneseSans,
} from '@/i18n/fonts'

import './globals.css'

/**
 * ⚠ Only app-wide faces belong on this `<body>` (2026-09-03 font pass). Every
 * variable here is inherited by every route, so a route-specific face declared
 * up here costs every other route a `<link rel=preload>` and an `@font-face`
 * block. The route-scoped ones now mount on their own domain roots:
 *   - `homepageSans` / `homepageMono` / `homepageSerifJapanese` → `.home-v4`
 *     in `HomeV4Shell`
 *   - `editorialSerif` → `.legal-page` in `LegalPage` / `LocaleNotFound`
 * `homepageSerif` is the one exception that has to stay — VoiceRoom's
 * `.vr-flier` is mounted on `<body>` and reads it (see the note in
 * `src/i18n/fonts.ts`).
 */
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
        className={`${appSans.variable} ${geistMono.variable} ${japaneseSans.variable} ${chineseSans.variable} ${homepageSerif.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  )
}
