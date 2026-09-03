import {
  Fraunces,
  Geist,
  Geist_Mono,
  Noto_Sans_JP,
  Noto_Sans_SC,
  Noto_Serif_JP,
  Noto_Serif_SC,
} from 'next/font/google'

/**
 * 字体三槽（docs/references/ui-defaults.md §1，owner 2026-09-03 拍板）：
 *   正文 `font-sans`    = Geist        + Noto Sans SC / JP
 *   等宽 `font-mono`    = Geist Mono   + 回落正文 CJK
 *   展示 `font-display` = Fraunces     + Noto Serif SC / JP
 *
 * 这里只声明 next/font 变量（挂在 <html> 上），三语字体栈在 globals.css 的
 * `:root` / `html:lang(ja)` 里组装。变量名与栈名刻意不同：此前 next/font 把
 * `--font-app-sans` 挂在 body 上，把 globals.css 里 `html:lang(zh)` 的同名覆盖
 * 整个遮掉，中文环境实际从未加载 Noto Sans SC。
 */

export const geistSans = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
  weight: 'variable',
})

/* CJK 面没有有用的 latin-only 切片，不 subset；preload: false 让它们不进
   其他 locale 的关键路径。fallback 保证 webfont 未到时先用系统 CJK。 */

export const notoSansSC = Noto_Sans_SC({
  variable: '--font-noto-sans-sc',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
})

export const notoSansJP = Noto_Sans_JP({
  variable: '--font-noto-sans-jp',
  weight: ['400', '500', '700'],
  display: 'swap',
  preload: false,
  fallback: ['Hiragino Sans', 'Yu Gothic UI', 'sans-serif'],
})

export const notoSerifSC = Noto_Serif_SC({
  variable: '--font-noto-serif-sc',
  weight: ['600', '900'],
  display: 'swap',
  preload: false,
  fallback: ['Songti SC', 'serif'],
})

export const notoSerifJP = Noto_Serif_JP({
  variable: '--font-noto-serif-jp',
  weight: ['600', '900'],
  display: 'swap',
  preload: false,
  fallback: ['Hiragino Mincho ProN', 'Yu Mincho', 'serif'],
})

export const FONT_VARIABLE_CLASSES = [
  geistSans.variable,
  geistMono.variable,
  fraunces.variable,
  notoSansSC.variable,
  notoSansJP.variable,
  notoSerifSC.variable,
  notoSerifJP.variable,
].join(' ')
