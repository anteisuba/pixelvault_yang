import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { AppLocale } from '@/i18n/routing'
import { AuthModalCtaButton } from '@/components/business/AuthModalCtaButton'
import { CardsPageContent } from '@/components/business/cards/CardsPageContent'

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
                {t('cardManagementSignInDescription')}
              </p>
              <AuthModalCtaButton label={tNav('signIn')} intent="sign-in" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <CardsPageContent />
}
