import { studioLibraryPath } from '@/constants/studio-shell'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface LibraryIndexProps {
  params: Promise<{ locale: AppLocale }>
}

/** `/library` 没有类 = 素材。 */
export default async function LibraryIndex({ params }: LibraryIndexProps) {
  const { locale } = await params
  redirect({ href: studioLibraryPath('assets'), locale })
}
