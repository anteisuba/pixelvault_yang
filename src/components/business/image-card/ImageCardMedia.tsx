'use client'

import { useCallback, useState } from 'react'
import NextImage from 'next/image'

import { ImageIcon, Layers, Music, Play } from '@/components/icons'
import {
  getGenerationThumbnailUrl,
  getGenerationVideoPosterUrl,
} from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import {
  toMediaTransitionOrigin,
  type MediaTransitionOrigin,
} from '@/components/business/MediaDetailViewer'

interface ImageCardMediaProps {
  generation: GenerationRecord
  isAudio: boolean
  isVideo: boolean
  aspectRatio: string
  onOpenDetail: (origin: MediaTransitionOrigin | null) => void
  openImageLabel: string
  openVideoLabel: string
  referenceImageLabel: string
  /** 「底图 + N 图层」角标文案；没有图层时宿主不传。 */
  layerBadgeLabel?: string
  priority?: boolean
}

export function ImageCardMedia({
  generation,
  isAudio,
  isVideo,
  aspectRatio,
  onOpenDetail,
  openImageLabel,
  openVideoLabel,
  referenceImageLabel,
  layerBadgeLabel,
  priority,
}: ImageCardMediaProps) {
  const imageSrc = getGenerationThumbnailUrl(generation)
  // 派生列优先，缺了走 CDN 现场抽帧 —— 以前这里靠 `preload="metadata"` +
  // `currentTime` 自己抠一帧，等于为一张封面拉真实视频字节。
  const videoPoster = getGenerationVideoPosterUrl(generation) ?? undefined

  return (
    <>
      <button
        type="button"
        className="block w-full cursor-pointer bg-muted"
        onClick={(event) =>
          onOpenDetail(
            toMediaTransitionOrigin(
              event.currentTarget.getBoundingClientRect(),
            ),
          )
        }
        aria-label={isVideo ? openVideoLabel : openImageLabel}
      >
        {isAudio ? (
          <div
            className="flex w-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 py-8"
            style={{ aspectRatio: '1 / 1' }}
          >
            <Music className="size-10 text-muted-foreground/40" />
            <audio
              src={generation.url}
              controls
              preload="metadata"
              className="w-full max-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : isVideo ? (
          <video
            src={generation.url}
            poster={videoPoster}
            muted
            playsInline
            preload="none"
            className="h-auto w-full object-cover"
            style={{ aspectRatio }}
          />
        ) : (
          <BlurUpImage
            src={imageSrc}
            alt={generation.prompt}
            width={generation.width}
            height={generation.height}
            priority={priority}
          />
        )}
      </button>
      {generation.referenceImageUrl && (
        // ⚠ 三档模态色已去色（32 ③，ui-defaults §2.3）：模态色只活在 prompts 域，
        //   这里的角标改走与右上角图层角标同一块中性玻璃 —— 模态本来就写在卡上，
        //   颜色没在回答第二个问题。
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 text-xs text-white shadow-sm backdrop-blur-md">
          <ImageIcon className="size-3" />
          {referenceImageLabel}
        </span>
      )}
      {layerBadgeLabel && (
        // 图层拆分产物（进度表 62）。⚠ 放右上角而不是左上角：参考图角标已经
        // 占着左上，而这两件事经常同时成立（图层拆分本来就必须挂参考图）。
        <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 text-xs text-white shadow-sm backdrop-blur-md">
          <Layers className="size-3" />
          {layerBadgeLabel}
        </span>
      )}
      {isVideo && (
        <>
          {/* 悬停时让位给左下的作者小签。 */}
          <span className="absolute bottom-3 left-3 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-opacity duration-fast ease-linear group-hover:opacity-0 group-focus-within:opacity-0">
            <Play className="ml-0.5 size-3.5" fill="currentColor" />
          </span>
          {generation.duration != null && (
            // 时长是机器串（ui-defaults §1 等宽槽判据）：角标档 `text-3xs` +
            // 等宽 + `tabular-nums`，⛔ 不用 `text-xs` 那一档。
            <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2 py-0.5 font-mono text-3xs tabular-nums text-white backdrop-blur-md">
              0:{String(Math.round(generation.duration)).padStart(2, '0')}
            </span>
          )}
        </>
      )}
    </>
  )
}

/**
 * 卡片里的图（卡片与详情 A）：宽高属性先把位置占好、底下铺浅灰；真图解码好后
 * 200 由糊变清（与 LoRA 封面、素材瓦片同一种）。⚠ 已在缓存里的图（窗口化列表
 * 滚回来重挂）直接出真图，⛔ 每滚一次重播一遍。
 */
function BlurUpImage({
  src,
  alt,
  width,
  height,
  priority,
}: {
  src: string
  alt: string
  width: number
  height: number
  priority?: boolean
}) {
  const [phase, setPhase] = useState<{
    src: string
    value: 'loading' | 'fading' | 'shown'
  }>({ src, value: 'loading' })
  if (phase.src !== src) setPhase({ src, value: 'loading' })
  const current = phase.src === src ? phase.value : 'loading'
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
      width={Math.max(width, 1)}
      height={Math.max(height, 1)}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      unoptimized
      draggable={false}
      onLoad={() =>
        setPhase((previous) =>
          previous.src === src && previous.value === 'loading'
            ? { src, value: 'fading' }
            : previous,
        )
      }
      className={cn(
        'h-auto w-full object-cover',
        current === 'loading' && 'scale-110 opacity-0 blur-md',
        current === 'fading' &&
          'transition-[filter,scale,opacity] duration-base ease-standard motion-reduce:transition-none',
      )}
    />
  )
}
