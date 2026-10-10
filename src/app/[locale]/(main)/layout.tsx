import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'

import { AuthArrivalToast } from '@/components/business/auth/AuthArrivalToast'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { MainProviders } from '@/components/layout/MainProviders'
import { MobileShell, MobileShellInset } from '@/components/layout/MobileShell'
import { SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { omitMessages, OUTSIDE_APP_NAMESPACES } from '@/i18n/messages-split'
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
  // subset. Re-wrap here so Studio/Gallery client components see
  // every namespace they can reach. use-intl 4.x replaces (not merges)
  // on nesting, so this provider must carry the whole app bundle —
  // minus the namespaces whose only consumers sit outside `(main)`
  // (marketing hero, legal prose, auth cards, `generateMetadata`).
  // See `src/i18n/messages-split.ts`.
  const appMessages = omitMessages(
    await getMessages({ locale }),
    OUTSIDE_APP_NAMESPACES,
  )

  return (
    <div className="min-h-svh overflow-x-clip bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        {tCommon('skipToMainContent')}
      </a>
      <NextIntlClientProvider locale={locale} messages={appMessages}>
        <MainProviders>
          <SidebarProvider defaultOpen={false}>
            <AppSidebar />
            {/* <768 走方向 P3「底栏」（app-shell.md §6）：页面上是底栏，工作台里
                换成顶上一条「← · 图片 ▾」。主区让位跟着路由走，见 `MobileShellInset`。 */}
            <MobileShell />
            <MobileShellInset>{children}</MobileShellInset>
          </SidebarProvider>
        </MainProviders>
        <Toaster />
        {/* After the Toaster on purpose: sibling effects run in order, so the
            bar is subscribed before the first「已登录」is pushed. */}
        <AuthArrivalToast />
      </NextIntlClientProvider>
    </div>
  )
}
