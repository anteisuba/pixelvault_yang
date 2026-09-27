'use client'

/**
 * 视频台的**素材排** —— 挂在输入框顶上（owner 2026-09-27 视频台 A「素材在输入框里」，
 * 画板「视频台 A · 全部状态」）。
 *
 * ── 一排，按类型编号 ───────────────────────────────────────────────
 * 图、视频、音频都进这一排，各自按挂上的顺序编号「图片1 · 视频1 · 音频1」——
 * 与助手写进提示词的编号一一对应。首帧 / 尾帧只是图片左上角的角标：点图片 →
 * 设为首帧 / 设为尾帧 / 作为参考 / 移除。
 *
 * ── 没有模式 ──────────────────────────────────────────────────────
 * 这一枪怎么发由挂了什么推出来，写在这一排最右一行只读灰字。判定与画布视频节点
 * 同一个函数（`videoSendMode`）。
 *
 * ── 说实话 ────────────────────────────────────────────────────────
 * 挂着但这一枪不发的（只挂了尾帧、换了型号它不收的、超出格数的）那几格变淡，灰字直说
 * 「… 这次不发」—— 与发送口读同一份 `send.unsent`（`planStudioVideoSend`），⛔ 不静默丢，
 * 也⛔ 不自动删：换回能收的型号就还在。
 *
 * ── 挂了才出现 ────────────────────────────────────────────────────
 * 什么都没挂时整排不渲染（⛔ 不写「文生视频」）。「＋」是工具行的「素材」chip
 * （`StudioVideoAssetChip`），拖放落点是整个输入框 —— 这一排里没有第二个入口。
 */

import { useLocale, useTranslations } from 'next-intl'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { useStudioForm } from '@/contexts/studio-context'
import type { UseStudioVideoAssetsReturn } from '@/hooks/use-studio-video-assets'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { getTranslatedModelLabel } from '@/lib/model-options'
import type { StudioVideoImageRole } from '@/lib/studio/video-workbench-slots'
import { cn } from '@/lib/utils'

interface StudioVideoAssetRailProps {
  /** 宿主（提示词区）那一份 —— 「素材」chip 用的是同一份，上传中的状态两边看得见。 */
  assets: UseStudioVideoAssetsReturn
  disabled?: boolean
}

const TILE_CLASS =
  'relative flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border transition-[border-color,opacity] duration-base ease-linear hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none'

/** 这一枪不发的那一格：200ms 线性变淡（动效表），编号也跟着淡。 */
const UNSENT_TILE_CLASS = 'opacity-40'

function Tile({
  label,
  children,
  testId,
  unsent = false,
}: {
  label: string
  children: React.ReactNode
  testId?: string
  unsent?: boolean
}) {
  return (
    <span
      data-testid={testId}
      data-unsent={unsent || undefined}
      className="flex shrink-0 animate-in flex-col items-center gap-1 fade-in-0 duration-base ease-linear motion-reduce:animate-none"
    >
      {children}
      <span
        className={cn(
          'text-2xs text-muted-foreground transition-colors duration-base ease-linear motion-reduce:transition-none',
          unsent && 'text-muted-foreground/60',
        )}
      >
        {label}
      </span>
    </span>
  )
}

export function StudioVideoAssetRail({
  assets,
  disabled = false,
}: StudioVideoAssetRailProps) {
  const t = useTranslations('StudioVideoSlots')
  const tMode = useTranslations('StudioNode.v4.video.mode')
  const tModels = useTranslations('Models')
  const locale = useLocale()
  const { state, dispatch } = useStudioForm()
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')

  const audioRefs = state.videoAudioRefs
  const empty =
    assets.images.length === 0 &&
    assets.videos.length === 0 &&
    audioRefs.length === 0
  if (empty && !assets.isUploading) return null

  const roleLabel: Record<StudioVideoImageRole, string> = {
    first: t('setFirst'),
    last: t('setLast'),
    reference: t('setReference'),
  }

  const send = assets.send
  const unsentImages = new Set(send?.unsent.images)
  const unsentVideos = new Set(send?.unsent.videos)
  const audioFrom = send?.unsent.audioFrom ?? audioRefs.length
  const unsentLabels = [
    ...assets.images
      .filter((image) => unsentImages.has(image.url))
      .map((image) => t('image', { n: image.n })),
    ...assets.videos
      .map((url, index) => ({ url, n: index + 1 }))
      .filter((video) => unsentVideos.has(video.url))
      .map((video) => t('video', { n: video.n })),
    ...audioRefs
      .slice(audioFrom)
      .map((_, index) => t('audio', { n: audioFrom + index + 1 })),
  ]
  const strong = (chunks: React.ReactNode) => (
    <span className="font-semibold text-foreground">{chunks}</span>
  )
  /**
   * 为什么这次不发：格数是 0 的合成一句「不收 A 和 B」，有格数但挂多了的各说「最多收 N」。
   * 上限一律是**实际跑的那个端点**的（`send.limits`）。
   */
  const unsentReasons = () => {
    if (!send) return ''
    const over = {
      image: unsentImages.size > 0 && !send.unsent.lastWithoutFirst,
      video: unsentVideos.size > 0,
      audio: audioFrom < audioRefs.length,
    }
    const none = (['image', 'video', 'audio'] as const).filter(
      (kind) => over[kind] && send.limits[`${kind}s`] === 0,
    )
    const reasons = [
      none.length > 0
        ? t('unsent.none', {
            kinds: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
              none.map((kind) => t(`unsent.kind.${kind}`)),
            ),
          })
        : null,
      ...(['image', 'video', 'audio'] as const)
        .filter((kind) => over[kind] && send.limits[`${kind}s`] > 0)
        .map((kind) =>
          t(`unsent.${kind}Max`, { max: send.limits[`${kind}s`] }),
        ),
    ]
    return reasons.filter(Boolean).join(t('unsent.separator'))
  }

  return (
    <div
      data-testid="studio-video-asset-rail"
      className="flex min-w-0 items-start gap-2.5"
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2.5">
        {assets.images.map((image) => {
          const roles = assets.rolesFor(image)
          const label = t('image', { n: image.n })
          return (
            <Tile
              key={image.url}
              label={label}
              testId={`video-asset-image-${image.n}`}
              unsent={unsentImages.has(image.url)}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    className={cn(
                      TILE_CLASS,
                      unsentImages.has(image.url) && UNSENT_TILE_CLASS,
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      className="size-full object-cover"
                    />
                    {image.role !== 'reference' ? (
                      <span
                        data-testid={`video-asset-badge-${image.role}`}
                        className="absolute left-1 top-1 rounded-sm bg-foreground/75 px-1 text-3xs leading-4 text-background"
                      >
                        {image.role === 'first'
                          ? t('firstFrame')
                          : t('lastFrame')}
                      </span>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {roles.map((role) => (
                    <DropdownMenuItem
                      key={role}
                      onSelect={() => assets.setRole(image.url, role)}
                    >
                      {roleLabel[role]}
                    </DropdownMenuItem>
                  ))}
                  {roles.length > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => assets.removeImage(image.url)}
                  >
                    {t('remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tile>
          )
        })}

        {assets.videos.map((url, index) => {
          const label = t('video', { n: index + 1 })
          return (
            <Tile
              key={url}
              label={label}
              testId={`video-asset-video-${index + 1}`}
              unsent={unsentVideos.has(url)}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    className={cn(
                      TILE_CLASS,
                      unsentVideos.has(url) && UNSENT_TILE_CLASS,
                    )}
                  >
                    <video
                      src={url}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => assets.removeVideo(url)}
                  >
                    {t('remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tile>
          )
        })}

        {audioRefs.map((ref, index) => {
          const label = t('audio', { n: index + 1 })
          return (
            <Tile
              key={ref.url}
              label={label}
              testId={`video-asset-audio-${index + 1}`}
              unsent={index >= audioFrom}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    title={ref.ownerName ?? ref.fileName}
                    className={cn(
                      TILE_CLASS,
                      'bg-muted px-1',
                      index >= audioFrom && UNSENT_TILE_CLASS,
                    )}
                  >
                    <span className="line-clamp-2 break-all text-3xs text-muted-foreground">
                      {ref.ownerName ?? ref.fileName ?? label}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() =>
                      dispatch({ type: 'OPEN_PANEL', payload: 'videoAudio' })
                    }
                  >
                    {t('editAudio')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      dispatch({
                        type: 'SET_VIDEO_AUDIO_REFS',
                        payload: audioRefs.filter(
                          (entry) => entry.url !== ref.url,
                        ),
                      })
                    }
                  >
                    {t('remove')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Tile>
          )
        })}

        {assets.isUploading ? (
          <Tile label={t('uploading')}>
            <span
              role="status"
              aria-label={t('uploading')}
              className={cn(TILE_CLASS, 'border-dashed')}
            >
              <Spinner size="sm" />
            </span>
          </Tile>
        ) : null}
      </div>

      {send && !empty ? (
        <span
          // 换词时交叉淡化一下（动效表：旧的 120ms 淡出 → 新的 200ms 淡入）。
          key={`${send.mode}:${unsentLabels.join('|')}`}
          data-testid="video-asset-send-mode"
          // 与缩略图的中线对齐（下面那一行编号不算）。
          className="ml-auto shrink-0 animate-in self-center pb-4 text-xs text-muted-foreground fade-in-0 duration-base ease-linear motion-reduce:animate-none"
        >
          {send.unsent.lastWithoutFirst
            ? t.rich('unsent.lastWithoutFirst', { strong })
            : unsentLabels.length > 0
              ? t.rich('unsent.line', {
                  model: selectedModel
                    ? getTranslatedModelLabel(tModels, selectedModel.modelId)
                    : '',
                  reasons: unsentReasons(),
                  labels: unsentLabels.join(t('unsent.labelSeparator')),
                  strong,
                })
              : t.rich('sendLine', {
                  mode: tMode(send.mode),
                  reason: t(`reason.${send.mode}`),
                  strong,
                })}
        </span>
      ) : null}
    </div>
  )
}
