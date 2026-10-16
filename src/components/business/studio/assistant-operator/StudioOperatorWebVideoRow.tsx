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
 *    （取不到整枚不画，⛔ 不写「0:00」）· 回复点名的左下写「回复提到」· 下面两行标题 +
 *    一行频道 + 一行怎么看（在面板里播 / 去某站看）。
 *  · 胶片条（owner 2026-10-16 选 B）：与找到的图同一种横排，放不下就左右滑（`snap-x`），
 *    ⛔ 宽面板也不改成两列；播放器开在这一排**下面**。
 *
 * ── 点开 ────────────────────────────────────────────────────────
 *  · 四家（`lib/web-video.ts` 认得出稿件号）：**在面板里播**，播放器是全面板共用的那一个
 *    （`StudioOperatorWebVideoPlayer`：官方嵌入 iframe，⛔ 没有 allow-top-navigation，
 *    全屏放行）；等创作者在播放器里自己点播放。
 *  · 别的站 / 认不出稿件号（频道页、`b23.tv` 短链）：新窗口开源页
 *    （`rel="noopener noreferrer"`）。
 *  · ⛔ 不下载、不转存、不解码任何一帧 —— 播放全在对方的播放器里；这一排没有「选用」。
 *
 * ⚠ 播放器是本卡片自己的状态：回答写完、整排从工具步搬到回答底下时会重新挂载
 *   （与图那一格同一个 key 规则），正在播的那一支要再点一次。
 */

import { useId, useState } from 'react'
import { Clapperboard, ExternalLink, Play } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_WEB_VIDEO_COVER_PIXELS } from '@/constants/studio-assistant-operator'
import { WEB_VIDEO_PLATFORM_IDS } from '@/constants/web-video'
import {
  StudioOperatorWebVideoPlayer,
  useWebVideoSiteLabel,
} from '@/components/business/studio/assistant-operator/StudioOperatorWebVideoPlayer'
import {
  operatorFindCardProps,
  operatorFindRingClass,
  useOperatorFindHighlighted,
} from '@/components/business/studio/assistant-operator/StudioOperatorFindRef'
import { revealStep, useMediaReveal } from '@/components/ui/load-reveal'
import { Skeleton } from '@/components/ui/skeleton'
import { operatorFindKey } from '@/lib/studio-operator-timeline'
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
  /** 回复点名的那几支（`operatorFindKey`，搜索期第三片）：常驻一圈细黑框。 */
  namedFinds?: ReadonlySet<string>
}

const NO_NAMED: ReadonlySet<string> = new Set()

const CARD_CLASS = 'w-56 shrink-0 snap-start'

export function StudioOperatorWebVideoRow({
  entryId,
  query,
  videos,
  placeholderCount = ASSISTANT_OPERATOR_LIMITS.maxWebVideoResults,
  namedFinds = NO_NAMED,
}: StudioOperatorWebVideoRowProps) {
  const t = useTranslations('StudioOperator')
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)

  const shown = videos?.slice(0, ASSISTANT_OPERATOR_LIMITS.maxWebVideoResults)
  if (shown && shown.length === 0) return null

  const playing = shown?.find((video) => video.url === playingUrl) ?? null

  return (
    <section
      className="min-w-0"
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

      <ul
        aria-label={t('web.videoStripLabel', { count: shown?.length ?? 0 })}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-1"
      >
        {shown
          ? shown.map((video, index) => (
              <li key={video.url} className={CARD_CLASS}>
                <WebVideoCard
                  video={video}
                  index={index}
                  findKey={video.n ? operatorFindKey(entryId, video.n) : null}
                  named={
                    video.n !== undefined &&
                    namedFinds.has(operatorFindKey(entryId, video.n))
                  }
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

      {playing ? (
        <div className="mt-1">
          <StudioOperatorWebVideoPlayer
            video={playing}
            onClose={() => setPlayingUrl(null)}
          />
        </div>
      ) : null}
    </section>
  )
}

function WebVideoCard({
  video,
  index,
  findKey,
  named,
  playing,
  onPlay,
}: {
  video: AssistantOperatorWebVideo
  index: number
  /** 这一张的 `#n` 键（`operatorFindKey`）；没编号 = `null`。 */
  findKey: string | null
  /** 回复点名了这一支：常驻细黑框。 */
  named: boolean
  playing: boolean
  onPlay(): void
}) {
  const t = useTranslations('StudioOperator')
  const highlighted = useOperatorFindHighlighted(findKey)
  const namedId = useId()
  const platformLabel = useWebVideoSiteLabel(video)
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
          operatorFindRingClass(named, highlighted),
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
            {/* 编号 `#n`：与回复里的 `#3` 对得上（搜索期第三片）。 */}
            {video.n ? (
              <span
                data-testid="operator-web-video-number"
                className="font-mono font-semibold tabular-nums"
              >
                #{video.n} ·{' '}
              </span>
            ) : null}
            {platformLabel}
          </span>
        </span>
        {named ? (
          <span
            data-testid="operator-web-video-named"
            aria-hidden
            className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-foreground px-1.5 text-3xs leading-4 text-background"
          >
            {t('web.namedBadge')}
          </span>
        ) : null}
        {video.durationSeconds ? (
          <span
            data-testid="operator-web-video-duration"
            className="pointer-events-none absolute bottom-1 right-1 rounded-sm bg-foreground/70 px-1 font-mono text-2xs tabular-nums leading-4 text-background"
          >
            {formatVideoDuration(video.durationSeconds)}
          </span>
        ) : null}
      </span>
      <span className="mt-1.5 line-clamp-2 text-sm leading-snug text-foreground">
        {video.title}
      </span>
      {video.channel ? (
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {video.channel}
        </span>
      ) : null}
      <span
        data-testid="operator-web-video-mode"
        className={cn(
          'mt-0.5 flex items-center gap-1 text-xs',
          playing ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {embedUrl ? (
          <Play className="size-3" aria-hidden />
        ) : (
          <ExternalLink className="size-3" aria-hidden />
        )}
        {embedUrl
          ? playing
            ? t('web.videoModePlaying')
            : t('web.videoModePlay')
          : t('web.videoOpenSource', { site: platformLabel })}
      </span>
      {named ? (
        <span id={namedId} className="sr-only">
          {t('web.findNamed')}
        </span>
      ) : null}
    </>
  )

  /**
   * ⚠ 卡片本身带 `aria-label`（会盖掉里面的字），「回复里点到了」得用 `aria-describedby`
   *   挂上去读屏才念得到。
   */
  const findProps = {
    ...operatorFindCardProps(findKey, video.n, named, highlighted),
    ...(named ? { 'aria-describedby': namedId } : {}),
  }
  const className =
    'block w-full min-w-0 scroll-m-2 rounded-lg text-left transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none'

  /** 认不出稿件号 / 别的站：新窗口开源页（⛔ 不带我们的页面句柄与 Referer）。 */
  if (!embedUrl)
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="operator-web-video-link"
        data-platform={video.platform}
        {...findProps}
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
      {...findProps}
      aria-pressed={playing}
      aria-label={t('web.videoPlay', { title: video.title })}
      onClick={onPlay}
      className={className}
    >
      {body}
    </button>
  )
}
