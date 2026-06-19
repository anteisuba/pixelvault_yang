import {
  Fraunces,
  Geist,
  Geist_Mono,
  Noto_Sans_JP,
  Noto_Sans_SC,
} from 'next/font/google'

export const appSans = Geist({
  variable: '--font-app-sans',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const displayFont = Geist({
  variable: '--font-app-display',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const serifFont = Geist({
  variable: '--font-app-serif',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

/**
 * Editorial display serif for the marketing hero headline only. Latin glyphs
 * use Fraunces; CJK headlines fall back to a Song/Mincho system stack (see
 * `.homepage-hero-title` in homepage.css) so we don't ship a heavy CJK webfont.
 */
export const editorialSerif = Fraunces({
  variable: '--font-editorial',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
})

export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const japaneseSans = Noto_Sans_JP({
  variable: '--font-japanese-sans',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['Hiragino Sans', 'Yu Gothic UI', 'sans-serif'],
})

export const chineseSans = Noto_Sans_SC({
  variable: '--font-chinese-sans',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
})
