'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  CheckCircle2,
  Circle,
  Film,
  Heart,
  Mic,
  Play,
} from '@/components/icons'
import NextImage from 'next/image'
import { useTranslations } from 'next-intl'

import { ASSET_TILE_VIDEO_MOUNT_ROOT_MARGIN } from '@/constants/assets-grid'
import { USER_UPLOAD_PROVIDER } from '@/constants/uploads'
import { useNearViewport } from '@/hooks/use-near-viewport'
import {
  getGenerationModel3DVisualUrl,
  getGenerationThumbnailUrl,
  getGenerationVideoPosterUrl,
} from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/video-utils'
import type { GenerationRecord } from '@/types'

import styles from './AssetTile.module.css'

/**
 * 一张素材瓦片 —— 媒体表达契约见 `docs/references/pages/assets.md` §6。
 *
 * | 类型 | 表达 |
 * | --- | --- |
 * | 图片 | 真实比例；**hover / 键盘进到这一格才**出左下「模型 · 尺寸」小签与右上 ♥ |
 * | 视频 | poster 帧 + 时长角标 + hover 静音预览 |
 * | 音频 | **恒 1:1 封面卡**（比例在排版层锁死）+ 播放键 + 常显说明条 |
 * | 3D | poster + 立方体角标 |
 *
 * 皮照 LoRA 库那套（排布与详情 A）：`rounded-xl`、没有描边；先铺中性浅灰，真图
 * 解码好后由糊变清；悬停浮起一层投影。
 *
 * ⭐ 「打开」是垫满整格的一颗按钮，♥ 收藏键浮在它上面 —— 两颗按钮，⛔ 按钮套按钮
 *   （读屏与 Tab 序都会乱）；媒体层整块不接指针，点它落到「打开」上。
 * ⭐ 拖动挂在整格外层，拖出来的影子就是这张图。
 * ⛔ 没有真实波形数据就不画伪波形 —— 音频卡的图形只作抽象表达。
 */

interface AssetTileProps {
  generation: GenerationRecord
  width: number
  height: number
  selected: boolean
  /** 左上角勾选圈：选择模式 / picker 多选时才出。 */
  showSelectionMark: boolean
  /** 影响 `aria-pressed` 与 ♥ 的让位。 */
  selectionMode: boolean
  draggable: boolean
  /** 音频封面四级回退链算出的当前候选；用尽为 undefined。 */
  audioCoverUrl?: string
  onAudioCoverError: (url: string) => void
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void
  onDragStart?: (event: React.DragEvent<HTMLElement>) => void
  /** 不给 = 没有 ♥ 收藏键（picker 里），收藏过的只画一颗标记。 */
  onToggleFavorite?: () => void
  /** 收藏请求在飞：♥ 半透明、不再接第二下。 */
  favoritePending?: boolean
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
  onToggleFavorite,
  favoritePending = false,
}: AssetTileProps) {
  const t = useTranslations('AssetsPage')
  const isAudio = generation.outputType === 'AUDIO'
  const isVideo = generation.outputType === 'VIDEO'
  const is3D = generation.outputType === 'MODEL_3D'
  const isLiked = Boolean(generation.isLiked)
  // 视频的悬停预览：媒体层不接指针，所以悬停记在整格上。
  const [isPreviewing, setIsPreviewing] = useState(false)
  const durationLabel =
    typeof generation.duration === 'number' && generation.duration > 0
      ? formatDuration(Math.round(generation.duration))
      : null
  const hasPixelSize = generation.width > 0 && generation.height > 0
  const pixelSize = hasPixelSize
    ? `${generation.width}×${generation.height}`
    : null
  // ⚠ 本地上传的 `model` 是 `user-upload` 哨兵，不是模型名 —— 小签只写尺寸。
  const modelLabel =
    generation.model && generation.model !== USER_UPLOAD_PROVIDER
      ? generation.model
      : null
  const hasTag = modelLabel !== null || pixelSize !== null
  // 音频卡的常显说明条（台账 E）：台词 / 提示词，没有就退到模型名。
  const audioCaption =
    generation.prompt?.trim() ||
    (generation.model === USER_UPLOAD_PROVIDER ? '' : generation.model)

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onMouseEnter={isVideo ? () => setIsPreviewing(true) : undefined}
      onMouseLeave={isVideo ? () => setIsPreviewing(false) : undefined}
      style={{ width, height }}
      data-asset-tile-id={generation.id}
      className={cn(
        'group relative shrink-0 rounded-xl transition-shadow duration-fast ease-linear hover:shadow-float has-focus-visible:shadow-float',
        selected &&
          'ring-2 ring-primary ring-offset-2 ring-offset-surface-workbench',
      )}
    >
      {/* 媒体层：整块不接指针（点它落到下面那颗「打开」上）。 */}
      <span
        className={cn(
          styles.tile,
          'pointer-events-none absolute inset-0 overflow-hidden rounded-xl bg-muted',
        )}
      >
        {isVideo ? (
          <VideoTileMedia generation={generation} previewing={isPreviewing} />
        ) : isAudio ? (
          <AudioTileCover
            coverUrl={audioCoverUrl}
            onCoverError={onAudioCoverError}
          />
        ) : is3D ? (
          <Model3DTileMedia generation={generation} width={width} />
        ) : (
          <TileImage
            src={getGenerationThumbnailUrl(generation)}
            alt={generation.prompt || ''}
            width={width}
          />
        )}

        {/* 播放键：音频常显（它是封面卡的一部分），视频 hover 才浮。 */}
        {(isAudio || isVideo) && (
          <span
            aria-hidden
            className={cn(
              'absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-opacity duration-fast',
              'asset-tile-badge',
              isAudio ? 'opacity-90' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <Play weight="fill" className="size-3.5 translate-x-px" />
          </span>
        )}

        {isAudio ? (
          /*
            音频卡的说明条常显（台账 E，owner 2026-08-29 真机）：音频素材多数
            没有自己的封面，同一张默认占位图下只有台词分得开。时长收进这条右侧。
          */
          audioCaption || durationLabel ? (
            <span
              className="asset-tile-veil absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2 pb-1.5 pt-6 text-left"
              aria-hidden
            >
              <span className="min-w-0 flex-1 truncate text-2xs text-white">
                {audioCaption}
              </span>
              {durationLabel ? (
                <span className="asset-tile-veil-sub flex shrink-0 items-center gap-1 text-3xs tabular-nums">
                  <Mic className="size-2.5" />
                  {durationLabel}
                </span>
              ) : null}
            </span>
          ) : null
        ) : hasTag || durationLabel || is3D ? (
          /* 左下「模型 · 尺寸」小签悬停才出；右下时长 / 3D 角标常显。 */
          <span
            className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2"
            aria-hidden
          >
            {hasTag ? (
              /* 窄图上只截模型名，尺寸常留（尺寸才是认图的那一半）。 */
              <span className="asset-tile-badge flex min-w-0 items-center gap-1 rounded-md px-1.75 font-mono text-3xs leading-5 tabular-nums opacity-0 transition-opacity duration-fast ease-linear group-hover:opacity-100 group-has-focus-visible:opacity-100">
                {modelLabel ? (
                  <span className="min-w-0 truncate">{modelLabel}</span>
                ) : null}
                {modelLabel && pixelSize ? (
                  <span className="shrink-0">·</span>
                ) : null}
                {pixelSize ? (
                  <span className="shrink-0">{pixelSize}</span>
                ) : null}
              </span>
            ) : (
              <span />
            )}
            {durationLabel || is3D ? (
              <span className="asset-tile-badge flex h-5 shrink-0 items-center rounded-md px-1.5 text-2xs tabular-nums">
                {is3D ? t('badge3D') : durationLabel}
              </span>
            ) : null}
          </span>
        ) : null}

        {showSelectionMark && (
          <span
            className={cn(
              'absolute left-2 top-2 flex size-5 items-center justify-center rounded-full',
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
      </span>

      {/* 整格就是「打开」（选择模式下是「选中」）。 */}
      <button
        type="button"
        onClick={onClick}
        aria-label={generation.prompt || generation.id}
        aria-pressed={selectionMode ? selected : undefined}
        title={generation.prompt || undefined}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-workbench"
      />

      {selectionMode ? null : onToggleFavorite ? (
        <button
          type="button"
          onClick={() => {
            if (!favoritePending) onToggleFavorite()
          }}
          aria-pressed={isLiked}
          aria-busy={favoritePending || undefined}
          aria-label={isLiked ? t('detailUnfavorite') : t('detailFavorite')}
          title={isLiked ? t('detailUnfavorite') : t('detailFavorite')}
          className={cn(
            'absolute right-2 top-2 z-20 grid size-6.5 place-items-center rounded-full bg-background/95 text-foreground shadow-sm transition-opacity duration-fast ease-linear focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isLiked
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100',
            favoritePending && 'opacity-60',
          )}
        >
          <Heart weight={isLiked ? 'fill' : 'bold'} className="size-3.5" />
        </button>
      ) : isLiked ? (
        <span
          className="pointer-events-none absolute right-2 top-2 z-20 grid size-6.5 place-items-center rounded-full bg-background/95 text-foreground shadow-sm"
          aria-hidden
        >
          <Heart weight="fill" className="size-3.5" />
        </span>
      ) : null}
    </div>
  )
}

/**
 * 真图解码好后 200 由糊变清（与 LoRA 封面同一种）。⚠ 已在缓存里的图（虚拟列表
 * 滚回来重挂）直接出真图，⛔ 每滚一次重播一遍。
 */
function TileImage({
  src,
  alt,
  width,
}: {
  src: string
  alt: string
  width: number
}) {
  const [phase, setPhase] = useState<{
    src: string
    value: 'loading' | 'fading' | 'shown'
  }>({ src, value: 'loading' })
  if (phase.src !== src) setPhase({ src, value: 'loading' })
  const current = phase.src === src ? phase.value : 'loading'
  // 图片元素挂上的那一刻就量（在画之前）：缓存里的图此刻已经解码好，直接出
  // 真图，连一帧浅灰都不闪。
  const imageRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image?.complete || image.naturalWidth === 0) return
      setPhase((previous) =>
        previous.src === src && previous.value === 'loading'
          ? { src, value: 'shown' }
          : previous,
      )
    },
    [src],
  )

  return (
    <NextImage
      ref={imageRef}
      src={src}
      alt={alt}
      fill
      sizes={`${Math.max(Math.round(width), 1)}px`}
      loading="lazy"
      draggable={false}
      onLoad={() =>
        setPhase((previous) =>
          previous.src === src && previous.value === 'loading'
            ? { src, value: 'fading' }
            : previous,
        )
      }
      className={cn(
        'object-cover',
        current === 'loading' && 'scale-118 opacity-0 blur-md',
        current === 'fading' &&
          'transition-[filter,scale,opacity] duration-base ease-standard motion-reduce:transition-none',
      )}
    />
  )
}

/** A 3D tile must never feed its GLB URL into an image element. */
function Model3DTileMedia({
  generation,
  width,
}: {
  generation: GenerationRecord
  width: number
}) {
  const t = useTranslations('AssetsPage')
  const visualUrl = getGenerationModel3DVisualUrl(generation)

  if (visualUrl) {
    return (
      <TileImage src={visualUrl} alt={generation.prompt || ''} width={width} />
    )
  }

  return (
    <span
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground"
      aria-hidden
    >
      <Box className="size-5" />
      <span className="text-3xs font-medium">{t('sidebarModel3D')}</span>
    </span>
  )
}

/**
 * 视频瓦片。封面来自 `getGenerationVideoPosterUrl`：派生列优先，缺了就走
 * Cloudflare Media Transformations 让 CDN 现场抽一帧（`src/lib/video-poster.ts`）。
 * 所以这里**不再自己抠帧** —— 以前是「挂 `<video preload="metadata">` → 等元数据
 * → 跳到 0.12s」，列表里每段视频都要为一张封面拉真实视频字节。
 * ⚠ 上线前置条件：Cloudflare 该 zone 必须打开 Transformations，否则封面 URL 404。
 *
 * 离屏时只画封面 `<img>`，进视口（提前 `ASSET_TILE_VIDEO_MOUNT_ROOT_MARGIN`）才挂
 * `<video>` —— 一张图 vs 一个带解码器的媒体元素状态机。悬停静音预览由整格的悬停
 * 驱动（媒体层不接指针），移开回到开头，不留在半路。
 *
 * ⚠ 台账 I（owner 2026-08-29 真机）：封面拿不到时**不能是一格纯空白** ——
 * 无图、无占位文案、无类型角标，看起来像坏了。所以底下永远垫一层占位：有封面
 * 就被完全盖住，没有至少还认得出这是一段视频。
 */
function VideoTileMedia({
  generation,
  previewing,
}: {
  generation: GenerationRecord
  previewing: boolean
}) {
  const t = useTranslations('AssetsPage')
  const poster = getGenerationVideoPosterUrl(generation) ?? undefined
  const { setNode, isNearViewport } = useNearViewport(
    ASSET_TILE_VIDEO_MOUNT_ROOT_MARGIN,
  )
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const wasPreviewingRef = useRef(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (previewing) {
      wasPreviewingRef.current = true
      const playing = video.play() as Promise<void> | undefined
      if (playing) void playing.catch(() => {})
      return
    }
    // 只在真的预览过之后才停：挂载时什么都不做。
    if (!wasPreviewingRef.current) return
    wasPreviewingRef.current = false
    video.pause()
    video.currentTime = 0
  }, [previewing])

  return (
    <span ref={setNode} className="absolute inset-0">
      {/* 垫在媒体**下面**：有封面时被完全盖住，零视觉代价。 */}
      <span
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground"
        aria-hidden
      >
        <Film className="size-5" />
        <span className="text-3xs font-medium">{t('sidebarVideos')}</span>
      </span>

      {isNearViewport ? (
        <video
          ref={videoRef}
          src={generation.url}
          poster={poster}
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 size-full object-cover"
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element -- CDN 抽帧 URL 不走 next/image 优化器。
        <img
          src={poster}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
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
      <span className="absolute inset-0 grid place-items-center">
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
      draggable={false}
      className="absolute inset-0 size-full object-cover"
      onError={() => onCoverError(coverUrl)}
    />
  )
}
