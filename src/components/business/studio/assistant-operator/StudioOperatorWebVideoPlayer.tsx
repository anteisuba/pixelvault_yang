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
 *
 * ⭐ **放大**（owner 2026-10-16「播放暂停，放大画中框，不跳转」，卡上选「页面中间大窗口」）：
 *   整张卡是 `popover="auto"`（样式 `operator-video-stage`，见 globals.css），「放大」=
 *   `showPopover()` 把**同一个元素**提到顶层、浮在页面中间，⛔ 不搬 DOM、iframe 不重载，
 *   接着播。点旁边 / Esc 由浏览器收回（light dismiss），面板里留一块占位写「在大窗口里播」。
 *   放大时 Esc 在 window 捕获阶段拦下（不 preventDefault，浏览器照常收回）——
 *   ⛔ 别让画布的 Esc 梯或手机 Sheet 把整个助手一起收掉。不认 popover 的浏览器不画放大键。
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ExternalLink, Maximize2, Minimize2, X } from '@/components/icons'
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

const BAR_BUTTON =
  'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none coarse:size-11'

const noSubscription = () => () => {}

/** 认不认 popover（Safari 17+ / Chrome 114+ / Firefox 125+）。服务端一律当不认。 */
function usePopoverSupported(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => typeof HTMLElement.prototype.togglePopover === 'function',
    () => false,
  )
}

/**
 * 官方嵌入页 + 一行「标题 · 放大 · 去原站 · 关上」。认不出稿件号就什么都不画 ——
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
  const canEnlarge = usePopoverSupported()
  const stageRef = useRef<HTMLDivElement>(null)
  const [enlarged, setEnlarged] = useState(false)
  const { embedUrl } = resolveWebVideo(video.url)

  // 开合以浏览器为准：放大键、点旁边、Esc 都只经过 `toggle` 这一个口。
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onToggle = (event: Event) =>
      setEnlarged((event as ToggleEvent).newState === 'open')
    stage.addEventListener('toggle', onToggle)
    return () => stage.removeEventListener('toggle', onToggle)
  }, [embedUrl])

  useEffect(() => {
    if (!enlarged) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') event.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enlarged])

  if (!embedUrl) return null

  const toggleEnlarged = () => stageRef.current?.togglePopover()

  return (
    <div>
      {enlarged ? (
        <div
          data-testid="operator-web-video-enlarged"
          className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-foreground"
        >
          <span>{t('web.videoEnlarged')}</span>
          <button
            type="button"
            data-testid="operator-web-video-shrink-placeholder"
            onClick={toggleEnlarged}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-foreground transition-colors duration-fast ease-standard hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none coarse:h-11"
          >
            <Minimize2 className="size-3.5" aria-hidden />
            {t('web.videoShrink')}
          </button>
        </div>
      ) : null}
      <div
        ref={stageRef}
        popover="auto"
        data-testid="operator-web-video-player"
        data-enlarged={enlarged}
        className="overflow-hidden rounded-lg border border-border bg-card operator-video-stage open:shadow-lg open:animate-in open:fade-in-0 open:zoom-in-95 duration-slow ease-standard backdrop:bg-foreground/70 backdrop:backdrop-blur-sm motion-reduce:animate-none"
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
          {canEnlarge ? (
            <button
              type="button"
              data-testid="operator-web-video-enlarge"
              onClick={toggleEnlarged}
              aria-pressed={enlarged}
              aria-label={
                enlarged ? t('web.videoShrink') : t('web.videoEnlarge')
              }
              title={enlarged ? t('web.videoShrink') : t('web.videoEnlarge')}
              className={BAR_BUTTON}
            >
              {enlarged ? (
                <Minimize2 className="size-3.5" aria-hidden />
              ) : (
                <Maximize2 className="size-3.5" aria-hidden />
              )}
            </button>
          ) : null}
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="operator-web-video-open-source"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted/60 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none coarse:h-11"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            {t('web.videoOpenSource', { site: siteLabel })}
          </a>
          <button
            type="button"
            data-testid="operator-web-video-close"
            onClick={onClose}
            aria-label={t('web.videoClose')}
            className={BAR_BUTTON}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
