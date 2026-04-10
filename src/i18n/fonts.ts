import {
  Geist_Mono,
  Inter,
  Lora,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Space_Grotesk,
} from 'next/font/google'

export const appSans = Inter({
  variable: '--font-app-sans',
  subsets: ['latin'],
  display: 'swap',
})

export const displayFont = Space_Grotesk({
  variable: '--font-app-display',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const serifFont = Lora({
  variable: '--font-app-serif',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
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
