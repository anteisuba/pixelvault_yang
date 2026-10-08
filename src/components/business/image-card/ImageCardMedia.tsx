'use client'

import NextImage from 'next/image'

import { ImageIcon, Layers, Music, Play } from '@/components/icons'
import {
  getGenerationThumbnailUrl,
  getGenerationVideoPosterUrl,
} from '@/lib/generation-media'
import { buildPromptAltText } from '@/lib/generation-seo'
import { cn } from '@/lib/utils'
import { useMediaReveal } from '@/components/ui/load-reveal'
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
  /** 数据到了由糊变清时错开第几步（`revealStep`，左上往右下）。 */
  revealStep?: number
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
  revealStep,
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
            alt={buildPromptAltText(generation.prompt)}
            width={generation.width}
            height={generation.height}
            priority={priority}
            revealStep={revealStep}
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
 * 卡片里的图（卡片与详情 A · 加载中 2026-10-08）：宽高属性先把位置占好、底下铺浅灰；
 * 真图到了在自己那一格里由糊变清（`useMediaReveal`，按位置错开 `revealStep` 步）。
 * ⚠ 已在缓存里的图（窗口化列表滚回来重挂）直接出真图，⛔ 每滚一次重播一遍。
 */
function BlurUpImage({
  src,
  alt,
  width,
  height,
  priority,
  revealStep,
}: {
  src: string
  alt: string
  width: number
  height: number
  priority?: boolean
  revealStep?: number
}) {
  const {
    imageRef: revealRef,
    onLoad: onRevealLoad,
    onError: onRevealError,
    style: revealStyle,
    className: revealClassName,
  } = useMediaReveal({ src, step: revealStep })

  return (
    <NextImage
      ref={revealRef}
      src={src}
      alt={alt}
      width={Math.max(width, 1)}
      height={Math.max(height, 1)}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      unoptimized
      draggable={false}
      onLoad={onRevealLoad}
      onError={onRevealError}
      style={revealStyle}
      className={cn('h-auto w-full object-cover', revealClassName)}
    />
  )
}
