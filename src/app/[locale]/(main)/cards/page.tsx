import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { CardsPageContent } from '@/components/business/CardsPageContent'

interface CardsPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: CardsPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('cards.title'),
    description: t('cards.description'),
    robots: 'noindex, nofollow',
  }
}

export default async function CardsPage({ params }: CardsPageProps) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'StudioV2' })
  const tNav = await getTranslations({ locale, namespace: 'Navbar' })
  const { userId: clerkId } = await auth()

  if (!clerkId) {
    return (
      <div className="editorial-page">
        <div className="editorial-container">
          <div className="editorial-panel text-center">
            <div className="mx-auto max-w-xl space-y-4">
              <h1 className="font-display text-3xl font-medium tracking-tight">
                {t('cardManagement')}
              </h1>
              <p className="font-serif text-sm leading-7 text-muted-foreground">
                {tNav('signIn')}
              </p>
              <Button asChild className="rounded-full px-5">
                <Link href={ROUTES.SIGN_IN}>{tNav('signIn')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <CardsPageContent />
}
