import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { Navbar } from '@/components/layout/Navbar'
import { Toaster } from '@/components/ui/sonner'

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="pb-14 md:pb-0">
        {children}
      </main>
      <MobileTabBar />
      <Toaster />
    </div>
  )
}
