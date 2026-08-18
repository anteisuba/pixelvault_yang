import { cookies, headers } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'

import { AppSidebar } from '@/components/layout/AppSidebar'
import { MainProviders } from '@/components/layout/MainProviders'
import { MobileShell } from '@/components/layout/MobileShell'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'

export default async function MainLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale: localeParam } = await params
  const locale = isAppLocale(localeParam) ? localeParam : DEFAULT_LOCALE
  const tCommon = await getTranslations({ locale, namespace: 'Common' })
  // Root layout's NextIntlClientProvider only ships the marketing
  // subset. Re-wrap with the full bundle so Studio/Gallery/Arena
  // client components see every namespace. use-intl 4.x replaces
  // (not merges) on nesting.
  const fullMessages = await getMessages({ locale })
  const sidebarState = (await cookies()).get('sidebar_state')?.value
  const userAgent = (await headers()).get('user-agent') ?? ''
  const isMobileUA = /Mobile|iP(hone|ad|od)|Android/i.test(userAgent)
  const defaultSidebarOpen = isMobileUA
    ? false
    : sidebarState === undefined
      ? true
      : sidebarState === 'true'

  return (
    <div className="min-h-svh overflow-x-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        {tCommon('skipToMainContent')}
      </a>
      <NextIntlClientProvider locale={locale} messages={fullMessages}>
        <MainProviders>
          <SidebarProvider defaultOpen={defaultSidebarOpen}>
            <AppSidebar />
            {/* <1024 走方向 M2「顶栏当切换器」：没有竖轨，导航收进顶栏中间那颗
                按钮（app-shell.md §6）。所以下面只给顶栏让位 44px，
                ⚠ 原来的 `pl-11` 是给已删除的左轨让的，必须一起去掉，
                否则每个移动端页面左边会留一条死白。 */}
            <MobileShell />
            <SidebarInset id="main-content" className="pt-11 lg:pt-0">
              {children}
            </SidebarInset>
          </SidebarProvider>
        </MainProviders>
        <Toaster />
      </NextIntlClientProvider>
    </div>
  )
}
