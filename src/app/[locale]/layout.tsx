/**
 * Locale layout — wraps all pages under /[locale]/...
 *
 * Currently hardcoded to "en"; multi-language support (next-intl)
 * will be added in Phase 3.
 */
export default function LocaleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
