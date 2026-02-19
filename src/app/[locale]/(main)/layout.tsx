/**
 * (main) layout — shared layout for main app pages (studio, gallery, etc.)
 *
 * Will include Navbar and footer in Phase 4.
 */
export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="min-h-screen bg-background">{children}</main>;
}
