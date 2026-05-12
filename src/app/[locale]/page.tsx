import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { HomepageShell } from '@/components/business/HomepageShell'
import type { AppLocale } from '@/i18n/routing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Marketing homepage is auth-agnostic on the server — the auth-aware CTA is
// resolved client-side via Clerk's useUser(). This lets the page be served
// from Vercel's edge cache for non-US visitors instead of round-tripping to
// the us-east-1 lambda + Neon. Revalidate every hour so translation/content
// updates land within an hour without a redeploy.
export const revalidate = 3600

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })

  const title = t('title')
  const description = t('description')

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/${locale}`,
      type: 'website',
    },
    alternates: {
      canonical: `${APP_URL}/${locale}`,
    },
  }
}

interface LocalizedRootPageProps {
  params: Promise<{ locale: AppLocale }>
}

export default async function LocalizedRootPage({
  params,
}: LocalizedRootPageProps) {
  // Touch params so the static generation pipeline records the route — but
  // don't branch on it. The locale itself is consumed by next-intl via the
  // request scope set up in [locale]/layout.tsx.
  await params

  return <HomepageShell />
}
