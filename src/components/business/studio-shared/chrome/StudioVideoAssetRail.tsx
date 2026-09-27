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
 * ── 挂了才出现 ────────────────────────────────────────────────────
 * 什么都没挂时整排不渲染（⛔ 不写「文生视频」）。「＋」是工具行的「素材」chip
 * （`StudioVideoAssetChip`），拖放落点是整个输入框 —— 这一排里没有第二个入口。
 */

import { useTranslations } from 'next-intl'

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
import type { StudioVideoImageRole } from '@/lib/studio/video-workbench-slots'
import { cn } from '@/lib/utils'

interface StudioVideoAssetRailProps {
  /** 宿主（提示词区）那一份 —— 「素材」chip 用的是同一份，上传中的状态两边看得见。 */
  assets: UseStudioVideoAssetsReturn
  disabled?: boolean
}

const TILE_CLASS =
  'relative flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border transition-colors duration-fast ease-linear hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none'

function Tile({
  label,
  children,
  testId,
}: {
  label: string
  children: React.ReactNode
  testId?: string
}) {
  return (
    <span
      data-testid={testId}
      className="flex shrink-0 animate-in flex-col items-center gap-1 fade-in-0 duration-base ease-linear motion-reduce:animate-none"
    >
      {children}
      <span className="text-2xs text-muted-foreground">{label}</span>
    </span>
  )
}

export function StudioVideoAssetRail({
  assets,
  disabled = false,
}: StudioVideoAssetRailProps) {
  const t = useTranslations('StudioVideoSlots')
  const tMode = useTranslations('StudioNode.v4.video.mode')
  const { state, dispatch } = useStudioForm()

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
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    className={TILE_CLASS}
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
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    className={TILE_CLASS}
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
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={disabled}>
                  <button
                    type="button"
                    aria-label={label}
                    title={ref.ownerName ?? ref.fileName}
                    className={cn(TILE_CLASS, 'bg-muted px-1')}
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

      {assets.send && !empty ? (
        <span
          data-testid="video-asset-send-mode"
          // 与缩略图的中线对齐（下面那一行编号不算）。
          className="ml-auto shrink-0 self-center pb-4 text-xs text-muted-foreground"
        >
          {t.rich('sendLine', {
            mode: tMode(assets.send.mode),
            reason: t(`reason.${assets.send.mode}`),
            strong: (chunks) => (
              <span className="font-semibold text-foreground">{chunks}</span>
            ),
          })}
        </span>
      ) : null}
    </div>
  )
}
