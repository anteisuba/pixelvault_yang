import type { Metadata, Viewport } from 'next'
import { getLocale } from 'next-intl/server'

import { HOMEPAGE_METADATA } from '@/constants/homepage'
import { FONT_VARIABLE_CLASSES } from '@/i18n/fonts'

import './globals.css'
import './canvas.css'

export const metadata: Metadata = {
  title: HOMEPAGE_METADATA.title,
  description: HOMEPAGE_METADATA.description,
}

// 移动端软键盘弹出问题的一半修法（另一半是把所有可聚焦控件的字号钉在 16px，
// 见 owner 报告）。这里只解决"键盘怎么弹出"：
// - viewportFit: 'cover' — 配合 safe-area-inset-* 吃满刘海屏（画布/工作台已在用 env(safe-area-inset-bottom)）
// - interactiveWidget: 'resizes-content' — Android Chrome 键盘弹出时收缩布局视口而不是覆盖，
//   这样 100dvh/100svh 类布局和 sticky 底栏能跟着让位（iOS Safari 本就是这个行为，无需此字段）
// 故意不设 maximumScale/userScalable=false —— 会砸掉双指缩放的可访问性，
// 而且一旦所有输入控件都 >=16px，iOS 的 focus-zoom 就不会被触发，没必要用这两个字段去堵。
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
