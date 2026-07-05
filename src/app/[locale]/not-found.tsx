import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import '@/app/legal.css'

import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'

/**
 * Branded 404 for unmatched routes under a locale. Reuses the ivory
 * "white hall" surface from legal.css and always offers a way back home.
 */
export default function LocaleNotFound() {
  const t = useTranslations('NotFound')

  return (
    <div className="legal-page flex flex-col">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <p className="legal-updated font-mono">404</p>
        <h1 className="legal-title text-foreground text-balance">
          {t('title')}
        </h1>
        <p className="legal-intro max-w-md text-pretty">{t('description')}</p>
        <Button
          asChild
          size="lg"
          className="mt-2 h-14 rounded-full px-8 text-base font-semibold"
        >
          <Link href={ROUTES.HOME} className="inline-flex items-center gap-2">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('backHome')}
          </Link>
        </Button>
      </main>
    </div>
  )
}
