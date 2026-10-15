'use client'

/**
 * **面板里的视频播放器**（搜索期第二片，owner 2026-10-14「视频优先面板内直接播，难实现才退回新窗口」）。
 *
 * ⭐ 全面板只有这一个：找到的视频那一排（`StudioOperatorWebVideoRow`）与回答底下的
 *   资料（`StudioOperatorAnswerSources`：媒体条里的视频封面、标成视频的来源卡）都用它，
 *   ⛔ 别再写第二个。能不能嵌只问 `resolveWebVideo`（`lib/web-video.ts`）——
 *   调用方用它决定「点了在这里播」还是「新窗口开源页」，这里用它算嵌入地址。
 *
 * ⚠ `sandbox` 放行脚本、同源（对方自己的源）、弹窗与演示；⛔ 没有 allow-top-navigation
 *   —— 嵌进来的页面不许把整个面板导走。全屏单独放行（`allowFullScreen` + `allow`）。
 * ⚠ `referrerPolicy` 只带源站：YouTube 的嵌入要看到来源站才肯放。
 * ⛔ 不下载、不转存、不解码任何一帧 —— 播放全在对方的播放器里。
 */

import { ExternalLink, X } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { WEB_VIDEO_EMBED, WEB_VIDEO_PLATFORM_IDS } from '@/constants/web-video'
import { resolveWebVideo } from '@/lib/web-video'
import type { AssistantOperatorWebVideo } from '@/types/assistant-operator'

/** 播一支视频要的那几样 —— 找到的视频整条给得出，调查证据按它投影。 */
export type StudioOperatorPlayableVideo = Pick<
  AssistantOperatorWebVideo,
  'url' | 'title' | 'platform' | 'domain'
>

/** 角标 / 播放器上写的站名：四家走 i18n（B站 / ニコニコ），别的站写域名。 */
export function useWebVideoSiteLabel(
  video: Pick<StudioOperatorPlayableVideo, 'platform' | 'domain'>,
): string {
  const t = useTranslations('StudioOperator')
  return video.platform === WEB_VIDEO_PLATFORM_IDS.other
    ? (video.domain ?? t('web.publisherUnknown'))
    : t(`web.videoPlatform.${video.platform}`)
}

/**
 * 官方嵌入页 + 一行「标题 · 去原站 · 关上」。认不出稿件号就什么都不画 ——
 * 那种调用方本该给新窗口链接，⛔ 不在这里退一个空播放器。
 */
export function StudioOperatorWebVideoPlayer({
  video,
  onClose,
}: {
  video: StudioOperatorPlayableVideo
  onClose(): void
}) {
  const t = useTranslations('StudioOperator')
  const siteLabel = useWebVideoSiteLabel(video)
  const { embedUrl } = resolveWebVideo(video.url)
  if (!embedUrl) return null
  return (
    <div
      data-testid="operator-web-video-player"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="aspect-video w-full bg-foreground">
        <iframe
          key={embedUrl}
          data-testid="operator-web-video-iframe"
          src={embedUrl}
          title={t('web.videoPlayerTitle', {
            title: video.title,
            site: siteLabel,
          })}
          sandbox={WEB_VIDEO_EMBED.sandbox}
          allow={WEB_VIDEO_EMBED.allow}
          allowFullScreen
          referrerPolicy={WEB_VIDEO_EMBED.referrerPolicy}
          className="size-full border-0"
        />
      </div>
      <div className="flex min-w-0 items-center gap-1 py-1 pl-2 pr-1">
        <p className="min-w-0 flex-1 truncate text-xs text-foreground">
          {video.title}
        </p>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="operator-web-video-open-source"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {t('web.videoOpenSource', { site: siteLabel })}
        </a>
        <button
          type="button"
          data-testid="operator-web-video-close"
          onClick={onClose}
          aria-label={t('web.videoClose')}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
