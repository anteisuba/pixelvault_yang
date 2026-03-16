import {
  Geist_Mono,
  Instrument_Sans,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Noto_Serif_JP,
  Noto_Serif_SC,
  Source_Serif_4,
  Space_Grotesk,
} from 'next/font/google'

export const appSans = Instrument_Sans({
  variable: '--font-instrument-sans',
  subsets: ['latin'],
  display: 'swap',
})

export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const appDisplay = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const appSerif = Source_Serif_4({
  variable: '--font-source-serif',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const japaneseSans = Noto_Sans_JP({
  variable: '--font-japanese-sans',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['Hiragino Sans', 'Yu Gothic UI', 'sans-serif'],
})

export const japaneseDisplay = Noto_Serif_JP({
  variable: '--font-japanese-display',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  fallback: ['Hiragino Mincho ProN', 'Yu Mincho', 'serif'],
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
