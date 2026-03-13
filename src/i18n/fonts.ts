import {
  Geist,
  Geist_Mono,
  M_PLUS_Rounded_1c,
  Noto_Sans_SC,
  Noto_Serif_SC,
} from 'next/font/google'

export const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const japaneseSans = M_PLUS_Rounded_1c({
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

export const chineseDisplay = Noto_Serif_SC({
  variable: '--font-chinese-display',
  weight: ['400', '600', '700'],
  display: 'swap',
  preload: false,
  fallback: ['Songti SC', 'STSong', 'serif'],
})
