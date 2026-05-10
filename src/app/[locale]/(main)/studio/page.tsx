import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface StudioPageProps {
  params: Promise<{ locale: AppLocale }>
}

/**
 * /studio is a thin redirect into /studio/image — the image workspace is the
 * canonical entry point after the Krea-style route split (Phase 3.4). The
 * legacy unified Studio page used to live here directly.
 */
export default async function StudioPage({ params }: StudioPageProps) {
  const { locale } = await params
  redirect({ href: '/studio/image', locale })
}
