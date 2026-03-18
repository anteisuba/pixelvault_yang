import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { Navbar } from '@/components/layout/Navbar'

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pb-14 md:pb-0">{children}</main>
      <MobileTabBar />
    </div>
  )
}
