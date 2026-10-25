import { auth } from '@clerk/nextjs/server'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ROUTES } from '@/constants/routes'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'
import { TavernLibraryDesk } from '@/components/business/cards/TavernLibraryDesk'
import { StudioLibraryOverlay } from '@/components/business/studio/shell/StudioLibraryOverlay'

interface LibraryTavernPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: LibraryTavernPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Navbar.links' })
  return { title: t('tavern'), robots: 'noindex, nofollow' }
}

/** `/library/tavern`：酒馆库（chub.ai 公开卡，用户 10-25 从角色库拆出来）。 */
export default async function LibraryTavernPage({
  params,
}: LibraryTavernPageProps) {
  const { locale } = await params
  const { userId: clerkId } = await auth()
  if (!clerkId) {
    const tNav = await getTranslations({ locale, namespace: 'Navbar' })
    return (
      <StudioLibraryOverlay category="tavern">
        <div className="grid h-page place-items-center">
          <Button asChild size="lg" className="h-11 rounded-full px-6">
            <Link href={ROUTES.SIGN_IN}>{tNav('signIn')}</Link>
          </Button>
        </div>
      </StudioLibraryOverlay>
    )
  }
  return (
    <StudioLibraryOverlay category="tavern">
      <TavernLibraryDesk />
    </StudioLibraryOverlay>
  )
}
