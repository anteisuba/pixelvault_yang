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
      <Navbar />
      <main className="pb-14 md:pb-0">{children}</main>
      <MobileTabBar />
      <Toaster />
    </div>
  )
}
