import { ROUTES } from '@/constants/routes'
import { redirect } from '@/i18n/navigation'
import type { AppLocale } from '@/i18n/routing'

interface StudioAudioPageProps {
  params: Promise<{ locale: AppLocale }>
}

/**
 * 原来的「聊天」页（配音间）10-26 删了：聊天并回对话（②c）。旧链接回首页对话。
 * ⚠ 路径先留着：③ 配音台还要用它。
 */
export default async function StudioAudioPage({
  params,
}: StudioAudioPageProps) {
  const { locale } = await params
  redirect({ href: ROUTES.STUDIO, locale })
}
