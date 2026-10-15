'use client'

/**
 * **找到的视频**（搜索期第二片，附录 I §四，owner 2026-10-14）。
 *
 * ── 摆在哪 ──────────────────────────────────────────────────────
 * 与找到的图同一条路：摆在**回答正文下面**（`StudioOperatorMessageBody.webFinds`，图在上、
 * 视频在下，按出场顺序），没等到回答时面板把它就地画在那一块工具步里，同一个 `entryId`
 * 当 key。过程那一行只剩一句「搜索视频：… · N 个」（`StudioOperatorLogItem`）。
 *
 * ── 一张卡（16:9）────────────────────────────────────────────────
 *  · 封面：第三方图，⛔ 不带我们的 Referer（`useThirdPartyImage`），到了由糊变清
 *    （`useMediaReveal`）；全取不到画一格占位图标，⛔ 破图标。
 *  · 左上平台角标（YouTube / B站 / niconico / Vimeo，别的站写域名）· 右下时长
 *    （取不到整枚不画，⛔ 不写「0:00」）· 下面两行标题 + 一行频道。
 *  · 手机横滑（`snap-x`）；桌面面板够宽时两列。
 *
 * ── 点开 ────────────────────────────────────────────────────────
 *  · 四家（`lib/web-video.ts` 认得出稿件号）：**在面板里播**，用各家官方嵌入播放器
 *    （iframe，`WEB_VIDEO_EMBED` 的 sandbox / allow，⛔ 没有 allow-top-navigation），
 *    全屏放行；等创作者在播放器里自己点播放。
 *  · 别的站 / 认不出稿件号（频道页、`b23.tv` 短链）：新窗口开源页
 *    （`rel="noopener noreferrer"`）。
 *  · ⛔ 不下载、不转存、不解码任何一帧 —— 播放全在对方的播放器里；这一排没有「选用」。
 *
 * ⚠ 播放器是本卡片自己的状态：回答写完、整排从工具步搬到回答底下时会重新挂载
 *   （与图那一格同一个 key 规则），正在播的那一支要再点一次。
 */

import { useState } from 'react'
import { Clapperboard, ExternalLink, Play, X } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_WEB_VIDEO_COVER_PIXELS } from '@/constants/studio-assistant-operator'
import { WEB_VIDEO_EMBED, WEB_VIDEO_PLATFORM_IDS } from '@/constants/web-video'
import { revealStep, useMediaReveal } from '@/components/ui/load-reveal'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatVideoDuration, resolveWebVideo } from '@/lib/web-video'
import type { AssistantOperatorWebVideo } from '@/types/assistant-operator'
import { useThirdPartyImage } from '@/hooks/use-third-party-image'

interface StudioOperatorWebVideoRowProps {
  /** 线程里这一条的 id —— 与找图那一格同一个 key 规则。 */
  entryId: string
  /** 这一次搜的什么 —— 头上那一行「搜索视频：… · N 个」。 */
  query: string
  /** 找到的视频；`null` = **还在搜**：画同形状的灰块，⛔ 呼吸闪烁（ui-defaults §7.2）。 */
  videos: readonly AssistantOperatorWebVideo[] | null
  /** 还在搜时画几张灰卡 —— 这一步要了几条（`payload.limit`）。 */
  placeholderCount?: number
}

const CARD_CLASS =
  'w-56 shrink-0 snap-start lg:@2xs:w-auto lg:@2xs:shrink lg:@2xs:snap-align-none'

export function StudioOperatorWebVideoRow({
  entryId,
  query,
  videos,
  placeholderCount = ASSISTANT_OPERATOR_LIMITS.maxWebVideoResults,
}: StudioOperatorWebVideoRowProps) {
  const t = useTranslations('StudioOperator')
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)

  const shown = videos?.slice(0, ASSISTANT_OPERATOR_LIMITS.maxWebVideoResults)
  if (shown && shown.length === 0) return null

  const playing = shown?.find((video) => video.url === playingUrl) ?? null
  const playingEmbed = playing ? resolveWebVideo(playing.url).embedUrl : null

  return (
    <section
      className="@container min-w-0"
      data-testid="operator-web-videos"
      data-entry-id={entryId}
      data-state={shown ? 'ready' : 'loading'}
      aria-busy={shown ? undefined : true}
    >
      {shown ? (
        <p
          data-testid="operator-web-videos-caption"
          className="mb-1.5 truncate text-2sm text-muted-foreground"
        >
          {t('web.videosFound', { query, count: shown.length })}
        </p>
      ) : (
        <Skeleton className="mb-1.5 h-5 w-48 max-w-full" />
      )}

      {playing && playingEmbed ? (
        <WebVideoPlayer
          video={playing}
          embedUrl={playingEmbed}
          onClose={() => setPlayingUrl(null)}
        />
      ) : null}

      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 lg:@2xs:grid lg:@2xs:grid-cols-2 lg:@2xs:overflow-visible lg:@2xs:pb-0">
        {shown
          ? shown.map((video, index) => (
              <li key={video.url} className={CARD_CLASS}>
                <WebVideoCard
                  video={video}
                  index={index}
                  playing={video.url === playingUrl}
                  onPlay={() =>
                    setPlayingUrl((current) =>
                      current === video.url ? null : video.url,
                    )
                  }
                />
              </li>
            ))
          : Array.from(
              {
                length: Math.min(
                  Math.max(placeholderCount, 1),
                  ASSISTANT_OPERATOR_LIMITS.maxWebVideoResults,
                ),
              },
              (_, index) => (
                <li key={index} className={cn(CARD_CLASS, 'flex flex-col')}>
                  <Skeleton
                    data-testid="operator-web-video-skeleton"
                    className="aspect-video w-full rounded-lg"
                  />
                  <Skeleton className="mt-1.5 h-4 w-full" />
                  <Skeleton className="mt-1 h-3 w-2/3" />
                </li>
              ),
            )}
      </ul>
    </section>
  )
}

/** 角标上写的平台名：四家走 i18n（B站 / ニコニコ），别的站写域名。 */
function usePlatformLabel(video: AssistantOperatorWebVideo): string {
  const t = useTranslations('StudioOperator')
  return video.platform === WEB_VIDEO_PLATFORM_IDS.other
    ? (video.domain ?? t('web.publisherUnknown'))
    : t(`web.videoPlatform.${video.platform}`)
}

function WebVideoCard({
  video,
  index,
  playing,
  onPlay,
}: {
  video: AssistantOperatorWebVideo
  index: number
  playing: boolean
  onPlay(): void
}) {
  const t = useTranslations('StudioOperator')
  const platformLabel = usePlatformLabel(video)
  const { embedUrl } = resolveWebVideo(video.url)
  const cover = useThirdPartyImage(video.thumbnailUrl)
  const {
    imageRef: revealRef,
    onLoad: onRevealLoad,
    style: revealStyle,
    className: revealClassName,
  } = useMediaReveal({ src: cover.src ?? '', step: revealStep(index, 0) })

  const body = (
    <>
      <span
        className={cn(
          'relative block aspect-video w-full overflow-hidden rounded-lg border border-border/70 bg-accent',
          playing && 'border-foreground ring-1 ring-foreground',
        )}
      >
        {cover.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- 任意第三方封面，进不了 next.config 的 remotePatterns 白名单。
          <img
            key={cover.src}
            ref={revealRef}
            src={cover.src}
            alt=""
            width={STUDIO_OPERATOR_WEB_VIDEO_COVER_PIXELS.width}
            height={STUDIO_OPERATOR_WEB_VIDEO_COVER_PIXELS.height}
            loading="lazy"
            referrerPolicy={cover.referrerPolicy}
            onLoad={onRevealLoad}
            onError={cover.onError}
            style={revealStyle}
            className={cn('size-full object-cover', revealClassName)}
          />
        ) : (
          <span
            data-testid="operator-web-video-cover-unavailable"
            className="grid size-full place-items-center text-muted-foreground"
          >
            <Clapperboard className="size-5" aria-hidden />
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <span className="grid size-8 place-items-center rounded-full bg-foreground/55 text-background">
            {embedUrl ? (
              <Play className="size-3.5" />
            ) : (
              <ExternalLink className="size-3.5" />
            )}
          </span>
        </span>
        <span className="pointer-events-none absolute inset-x-1 top-1 flex">
          <span
            data-testid="operator-web-video-platform"
            className={cn(
              'max-w-full truncate rounded-sm bg-foreground/70 px-1 text-3xs leading-4 text-background',
              video.platform === WEB_VIDEO_PLATFORM_IDS.other && 'font-mono',
            )}
          >
            {platformLabel}
          </span>
        </span>
        {video.durationSeconds ? (
          <span
            data-testid="operator-web-video-duration"
            className="pointer-events-none absolute bottom-1 right-1 rounded-sm bg-foreground/70 px-1 font-mono text-2xs tabular-nums leading-4 text-background"
          >
            {formatVideoDuration(video.durationSeconds)}
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 line-clamp-2 text-xs leading-snug text-foreground">
        {video.title}
      </span>
      {video.channel ? (
        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
          {video.channel}
        </span>
      ) : null}
    </>
  )

  const className =
    'block w-full min-w-0 rounded-lg text-left transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none'

  /** 认不出稿件号 / 别的站：新窗口开源页（⛔ 不带我们的页面句柄与 Referer）。 */
  if (!embedUrl)
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="operator-web-video-link"
        data-platform={video.platform}
        aria-label={t('web.videoOpenExternal', {
          title: video.title,
          site: platformLabel,
        })}
        className={className}
      >
        {body}
      </a>
    )

  return (
    <button
      type="button"
      data-testid="operator-web-video-card"
      data-platform={video.platform}
      aria-pressed={playing}
      aria-label={t('web.videoPlay', { title: video.title })}
      onClick={onPlay}
      className={className}
    >
      {body}
    </button>
  )
}

/**
 * 面板里的播放器：官方嵌入页 + 一行「标题 · 去原站 · 关上」。
 *
 * ⚠ `sandbox` 放行脚本、同源（对方自己的源）、弹窗与演示；⛔ 没有 allow-top-navigation
 *   —— 嵌进来的页面不许把整个面板导走。全屏单独放行（`allowFullScreen` + `allow`）。
 * ⚠ `referrerPolicy` 只带源站：YouTube 的嵌入要看到来源站才肯放。
 */
function WebVideoPlayer({
  video,
  embedUrl,
  onClose,
}: {
  video: AssistantOperatorWebVideo
  embedUrl: string
  onClose(): void
}) {
  const t = useTranslations('StudioOperator')
  const platformLabel = usePlatformLabel(video)
  return (
    <div
      data-testid="operator-web-video-player"
      className="mb-2 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="aspect-video w-full bg-foreground">
        <iframe
          key={embedUrl}
          data-testid="operator-web-video-iframe"
          src={embedUrl}
          title={t('web.videoPlayerTitle', {
            title: video.title,
            site: platformLabel,
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
          {t('web.videoOpenSource', { site: platformLabel })}
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
