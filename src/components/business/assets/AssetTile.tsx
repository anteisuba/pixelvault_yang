'use client'

import { CheckCircle2, Circle, Heart, Mic, Play } from 'lucide-react'
import NextImage from 'next/image'
import { useTranslations } from 'next-intl'

import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { getGenerationThumbnailUrl } from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/video-utils'
import type { GenerationRecord } from '@/types'

/**
 * 一张素材瓦片 —— 媒体表达契约见 `docs/references/pages/assets.md` §6。
 *
 * | 类型 | 表达 |
 * | --- | --- |
 * | 图片 | 真实比例；**hover 才**浮出底部渐隐条（提示词或模型 + 像素尺寸） |
 * | 视频 | poster 帧 + 时长角标 + hover 静音预览 |
 * | 音频 | **恒 1:1 封面卡**（比例在排版层锁死）+ 播放键 + 时长 + 类型徽标 |
 * | 3D | poster + 立方体角标 |
 *
 * ⛔ **没有真实波形数据就不画伪波形** —— 音频卡的图形只作抽象表达。
 * ⚠ 瓦片本身是 `<button>`，所以里面的播放键只能是**非交互的 span**
 * （嵌套交互元素在 a11y 上是坏的）。真正的播放在详情面板里。
 */

interface AssetTileProps {
  generation: GenerationRecord
  width: number
  height: number
  selected: boolean
  /** 左上角勾选圈：选择模式 / picker 多选时才出。 */
  showSelectionMark: boolean
  /** 影响 `aria-pressed` 与「收藏心」的让位。 */
  selectionMode: boolean
  draggable: boolean
  /** 音频封面四级回退链算出的当前候选；用尽为 undefined。 */
  audioCoverUrl?: string
  onAudioCoverError: (url: string) => void
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
}

export function AssetTile({
  generation,
  width,
  height,
  selected,
  showSelectionMark,
  selectionMode,
  draggable,
  audioCoverUrl,
  onAudioCoverError,
  onClick,
  onContextMenu,
  onDragStart,
}: AssetTileProps) {
  const t = useTranslations('AssetsPage')
  const isAudio = generation.outputType === 'AUDIO'
  const isVideo = generation.outputType === 'VIDEO'
  const is3D = generation.outputType === 'MODEL_3D'
  const durationLabel =
    typeof generation.duration === 'number' && generation.duration > 0
      ? formatDuration(Math.round(generation.duration))
      : null
  const hasPixelSize = generation.width > 0 && generation.height > 0
  // 「提示词或模型」（§6）。⚠ 本地上传的 `model` 是 `user-upload` 哨兵，
  // 不是模型名 —— 与其在作品上压一行英文 slug，不如只留像素尺寸。
  const veilCaption =
    generation.prompt?.trim() ||
    (generation.model === USER_UPLOAD_PROVIDER ? '' : generation.model)

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{ width, height }}
      className={cn(
        'group relative shrink-0 overflow-hidden rounded-lg border bg-muted/40 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        selected
          ? 'border-primary ring-2 ring-primary/40'
          : 'border-border/60 hover:border-primary/40',
      )}
      aria-label={generation.prompt || generation.id}
      aria-pressed={selectionMode ? selected : undefined}
      title={generation.prompt || undefined}
    >
      {isVideo ? (
        <VideoTileMedia generation={generation} />
      ) : isAudio ? (
        <AudioTileCover
          coverUrl={audioCoverUrl}
          onCoverError={onAudioCoverError}
        />
      ) : (
        <NextImage
          src={getGenerationThumbnailUrl(generation)}
          alt={generation.prompt || ''}
          fill
          sizes={`${width}px`}
          className="object-cover"
          loading="lazy"
        />
      )}

      {/* 播放键：音频常显（它是封面卡的一部分），视频 hover 才浮。 */}
      {(isAudio || isVideo) && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-opacity duration-200',
            'asset-tile-badge',
            isAudio ? 'opacity-90' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <Play className="size-3.5 translate-x-px fill-current" />
        </span>
      )}

      {/* 右下角角标：视频/音频=时长，3D=立方体。hover 时让位给渐隐条。 */}
      {(durationLabel || is3D) && (
        <span
          className={cn(
            'asset-tile-badge pointer-events-none absolute bottom-1.5 right-1.5 flex h-5 items-center gap-1 rounded-md px-1.5 text-2xs tabular-nums transition-opacity duration-200',
            !isAudio && 'group-hover:opacity-0',
          )}
        >
          {isAudio && <Mic className="size-2.5" />}
          {is3D ? t('badge3D') : durationLabel}
        </span>
      )}

      {/* hover 渐隐条 —— 不长期压住作品，所以只在 hover / focus 时出。
          音频卡不挂它：那张卡本来就是「封面 + 元信息」，再压一层就糊了。 */}
      {!isAudio && (
        <span
          className="asset-tile-veil pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2 pb-1.5 pt-6 text-left opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        >
          <span className="min-w-0 flex-1 truncate text-2xs text-white">
            {veilCaption}
          </span>
          {hasPixelSize && (
            <span className="asset-tile-veil-sub shrink-0 text-3xs tabular-nums">
              {generation.width}×{generation.height}
            </span>
          )}
        </span>
      )}

      {showSelectionMark && (
        <span
          className={cn(
            'pointer-events-none absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full',
            selected
              ? 'bg-primary text-primary-foreground'
              : 'bg-background/90 text-foreground/70',
          )}
        >
          {selected ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <Circle className="size-3.5" />
          )}
        </span>
      )}
      {generation.isLiked && !selectionMode && (
        <span
          className="pointer-events-none absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-background/80 text-rose-500 shadow-sm backdrop-blur-sm"
          aria-hidden
        >
          <Heart className="size-3 fill-current" />
        </span>
      )}
    </button>
  )
}

/**
 * 视频瓦片。⚠ **切片 0（poster 派生）还没落地** —— 实测 7/7 条视频的
 * `thumbnailUrl`/`previewUrl` 全空，所以这里仍要靠「加载元数据后跳到 0.12s」
 * 自己抠一帧当封面。派生管线补上后，`poster` 会直接命中，`preload` 也就
 * 退回 `none`（省一次视频请求）。
 */
function VideoTileMedia({ generation }: { generation: GenerationRecord }) {
  const poster = generation.thumbnailUrl ?? generation.previewUrl ?? undefined

  return (
    <video
      src={generation.url}
      poster={poster}
      muted
      loop
      playsInline
      preload={poster ? 'none' : 'metadata'}
      onLoadedMetadata={(event) => {
        if (poster) return
        const video = event.currentTarget
        if (!Number.isFinite(video.duration) || video.duration <= 0) return
        video.currentTime = Math.min(0.12, video.duration / 2)
      }}
      // hover 静音预览（§6）。移开就回到封面帧，不留在半路。
      onMouseEnter={(event) => {
        void event.currentTarget.play().catch(() => {})
      }}
      onMouseLeave={(event) => {
        const video = event.currentTarget
        video.pause()
        video.currentTime = Math.min(0.12, video.duration / 2 || 0.12)
      }}
      className="absolute inset-0 size-full bg-muted/40 object-cover"
    />
  )
}

/**
 * 音频封面卡。回退链（§6）：用户设置 → 生成请求/声音角色封面 →
 * provider/模型封面 → 系统默认，由调用方一层层往下挑，这里只负责画。
 * ⛔ 全部落空时画一个抽象的同心圆，**不画伪波形**。
 */
function AudioTileCover({
  coverUrl,
  onCoverError,
}: {
  coverUrl?: string
  onCoverError: (url: string) => void
}) {
  if (!coverUrl) {
    return (
      <span className="absolute inset-0 grid place-items-center bg-muted/40">
        <span className="grid size-[46%] place-items-center rounded-full border border-border">
          <span className="size-[62%] rounded-full border border-border" />
        </span>
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Audio cover URLs can be provider/model configured.
    <img
      src={coverUrl}
      alt=""
      loading="lazy"
      className="absolute inset-0 size-full object-cover"
      onError={() => onCoverError(coverUrl)}
    />
  )
}
