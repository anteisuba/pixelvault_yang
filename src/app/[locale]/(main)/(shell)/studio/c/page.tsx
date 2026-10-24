import { ROUTES } from '@/constants/routes'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface StudioConversationIndexProps {
  params: Promise<{ locale: AppLocale }>
}

/** `/studio/c` 没有编号 = 首页。 */
export default async function StudioConversationIndex({
  params,
}: StudioConversationIndexProps) {
  const { locale } = await params
  redirect({ href: ROUTES.STUDIO, locale })
}
