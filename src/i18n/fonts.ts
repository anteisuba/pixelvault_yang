import localFont from 'next/font/local'

/* CJK 四套走 fontsource 的样式表：按 unicode-range 切片，页面用到哪段字才下哪片，
   不进其他 locale 的关键路径。family 名在 globals.css 的 :root 接成 `--font-noto-*`。 */
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/noto-sans-jp'
import '@fontsource-variable/noto-serif-sc'
import '@fontsource-variable/noto-serif-jp'

/**
 * 字体三槽（docs/references/ui-defaults.md §1，owner 2026-09-03 拍板）：
 *   正文 `font-sans`    = Geist        + Noto Sans SC / JP
 *   等宽 `font-mono`    = Geist Mono   + 回落正文 CJK
 *   展示 `font-display` = Fraunces     + Noto Serif SC / JP
 *
 * 字体文件全部来自 npm 包、随仓库构建（owner 2026-10-27 定）：⛔ next/font/google——
 * 构建时去 Google 拉字体，拉不到整个 Production Build 就挂（10-27 两次）。
 *
 * 这里只声明 next/font 变量（挂在 <html> 上），三语字体栈在 globals.css 的
 * `:root` / `html:lang(ja)` 里组装。变量名与栈名刻意不同：此前 next/font 把
 * `--font-app-sans` 挂在 body 上，把 globals.css 里 `html:lang(zh)` 的同名覆盖
 * 整个遮掉，中文环境实际从未加载 Noto Sans SC。
 */

export const geistSans = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
})

export const geistMono = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
})

export const fraunces = localFont({
  src: '../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2',
  variable: '--font-fraunces',
  weight: '100 900',
  display: 'swap',
})

export const FONT_VARIABLE_CLASSES = [
  geistSans.variable,
  geistMono.variable,
  fraunces.variable,
].join(' ')
