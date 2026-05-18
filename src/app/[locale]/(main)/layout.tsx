import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'

import { AppSidebar } from '@/components/layout/AppSidebar'
import { MainProviders } from '@/components/layout/MainProviders'
import { MobileHeader, MobileTabBar } from '@/components/layout/MobileTabBar'
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        {tCommon('skipToMainContent')}
      </a>
      <NextIntlClientProvider locale={locale} messages={fullMessages}>
        <MainProviders>
          <SidebarProvider defaultOpen={true}>
            <AppSidebar />
            <MobileHeader />
            <SidebarInset
              id="main-content"
              className="pt-11 pb-12 md:pt-0 md:pb-0"
            >
              {children}
            </SidebarInset>
            <MobileTabBar />
          </SidebarProvider>
        </MainProviders>
        <Toaster />
      </NextIntlClientProvider>
    </div>
  )
}
