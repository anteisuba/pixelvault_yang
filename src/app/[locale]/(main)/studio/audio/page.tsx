import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { VoiceRoomPage } from '@/components/business/voiceroom/VoiceRoomPage'
import type { AppLocale } from '@/i18n/routing'

interface StudioAudioPageProps {
  params: Promise<{ locale: AppLocale }>
}

export async function generateMetadata({
  params,
}: StudioAudioPageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Metadata' })
  return {
    title: t('studio.audio.title'),
    description: t('studio.audio.description'),
    robots: 'noindex, nofollow',
  }
}

/**
 * 配音间。
 *
 * ⚠ 这一页**故意住在 `(workspace)` 路由组外面**（2026-08-29）。那个路由组的
 * layout 会给 image / video / audio 三者套上 `StudioProvider` +
 * `StudioWorkspaceUI`——共享参数栏、助手浮标、模态切换器全在里面。配音间不是
 * 工作台的第三个模态，是一个房间；搬出路由组之后那些东西自然不出现，不需要
 * 逐个加「音频档隐藏」的开关。
 *
 * URL 不变：路由组不进路径，`(workspace)/audio` 和 `audio` 都是 `/studio/audio`。
 * 也正因为如此，两处**不能同时存在**——旧的那份已随本次改动删除。
 */
export default function StudioAudioPage() {
  return <VoiceRoomPage />
}
