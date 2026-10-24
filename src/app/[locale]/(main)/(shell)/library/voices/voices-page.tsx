import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { VoicesPage } from '@/components/business/voices/VoicesPage'

interface VoicesRouteProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: VoicesRouteProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('voices.title'),
    description: t('voices.description'),
    robots: 'noindex, nofollow',
  }
}

export default async function VoicesRoute({ params }: VoicesRouteProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'VoicesPage' })
  const tNav = await getTranslations({ locale, namespace: 'Navbar' })
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return (
      <div className="editorial-page">
        <div className="editorial-container">
          <div className="editorial-panel text-center">
            <div className="mx-auto max-w-xl space-y-4">
              <h1 className="text-3xl font-medium tracking-tight">
                {t('title')}
              </h1>
              <Button asChild size="lg" className="h-11 rounded-full px-6">
                <Link href={ROUTES.SIGN_IN}>{tNav('signIn')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <VoicesPage />
}
