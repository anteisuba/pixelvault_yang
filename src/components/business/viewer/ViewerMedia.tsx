'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Box } from '@/components/icons'
import type { GenerationRecord } from '@/types'
import { ModelViewer } from '@/components/business/ModelViewer'
import {
  getGenerationModel3DVisualUrl,
  getGenerationPreviewUrl,
  getGenerationThumbnailUrl,
  getGenerationVideoPosterUrl,
} from '@/lib/generation-media'
import { cn } from '@/lib/utils'
import { useMediaReveal } from '@/components/ui/load-reveal'
import { useSlowLoadingNotice } from '@/hooks/use-slow-loading-notice'

/** 舞台外框的宽高比：音频与 3D 是方的，其余按作品本身。 */
export function viewerRatioOf(generation: GenerationRecord): number {
  if (generation.outputType === 'AUDIO' || generation.outputType === 'MODEL_3D')
    return 1
  return generation.width > 0 && generation.height > 0
    ? generation.width / generation.height
    : 1
}

/** 舞台上的那一件：图片 · 视频 · 音频（封面 + 播放器）· 3D。换一张 200 淡入。 */
export function ViewerMedia({
  generation,
  audioCoverUrl,
}: {
  generation: GenerationRecord
  audioCoverUrl?: string
}) {
  const tModel = useTranslations('Model3DGenerate')
  const fadeIn =
    'animate-in fade-in-0 duration-base ease-linear motion-reduce:animate-none'

  if (generation.outputType === 'VIDEO') {
    return (
      <video
        src={generation.url}
        poster={getGenerationVideoPosterUrl(generation) ?? undefined}
        controls
        playsInline
        className={cn('size-full object-contain', fadeIn)}
      />
    )
  }
  if (generation.outputType === 'AUDIO') {
    return (
      <div className={cn('absolute inset-0', fadeIn)}>
        {audioCoverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 音频封面可以是 provider / 模型配置的直链。
          <img
            src={audioCoverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <div className="absolute inset-x-3 bottom-3">
          <audio src={generation.url} controls className="w-full" />
        </div>
      </div>
    )
  }
  if (generation.outputType === 'MODEL_3D') {
    if (!generation.modelUrl) {
      return (
        <span className="absolute inset-0 grid place-items-center text-muted-foreground">
          <Box className="size-6" aria-hidden />
        </span>
      )
    }
    return (
      <ModelViewer
        src={generation.modelUrl}
        poster={getGenerationModel3DVisualUrl(generation) ?? undefined}
        alt={generation.prompt || '3D model'}
        loadingLabel={tModel('viewerLoading')}
        className={cn('size-full', fadeIn)}
      />
    )
  }
  return <ViewerImage generation={generation} />
}

/**
 * 大图（owner 2026-10-08 加载中 · 看大图）：先摆列表里那张小图（多半已经在缓存里），糊着；
 * 原图到了在上面由糊变清（`useMediaReveal`）。⛔ 转圈。
 * 原图没拿到：小图变清留着，底下一颗黑丸「先给你看小图 · 重试」。
 * `prefers-reduced-motion`：小图不糊，原图到了直接换上。
 */
function ViewerImage({ generation }: { generation: GenerationRecord }) {
  const t = useTranslations('Feedback')
  const previewSrc = getGenerationPreviewUrl(generation)
  const thumbSrc = getGenerationThumbnailUrl(generation)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const alt = generation.prompt || generation.id
  // 等原图等过 6 秒：底部黑条「网有点慢，还在加载」，到了自己收掉。
  useSlowLoadingNotice(!loaded && !failed)

  return (
    <div className="absolute inset-0">
      {thumbSrc !== previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- 列表里那张小图，比例已由外框锁住。
        <img
          src={thumbSrc}
          alt=""
          aria-hidden
          draggable={false}
          className={cn(
            'absolute inset-0 size-full object-cover',
            !failed &&
              'scale-105 blur-reveal motion-reduce:scale-100 motion-reduce:blur-none',
          )}
        />
      ) : null}
      {failed ? null : (
        <ViewerOriginal
          key={attempt}
          src={previewSrc}
          alt={alt}
          onLoaded={() => setLoaded(true)}
          onFailed={() => setFailed(true)}
        />
      )}
      {failed ? (
        <p
          role="status"
          className="absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-3.5 text-xs whitespace-nowrap text-background"
        >
          {t('previewFallback')}
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setAttempt((value) => value + 1)
            }}
            className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-background focus-visible:outline-none"
          >
            {t('retry')}
          </button>
        </p>
      ) : null}
    </div>
  )
}

function ViewerOriginal({
  src,
  alt,
  onLoaded,
  onFailed,
}: {
  src: string
  alt: string
  onLoaded: () => void
  onFailed: () => void
}) {
  const {
    phase: revealPhase,
    imageRef: revealRef,
    onLoad: onRevealLoad,
    onError: onRevealError,
    style: revealStyle,
    className: revealClassName,
  } = useMediaReveal({ src })
  const loaded = revealPhase === 'revealing' || revealPhase === 'shown'
  const failed = revealPhase === 'failed'
  useEffect(() => {
    if (loaded) onLoaded()
  }, [loaded, onLoaded])
  useEffect(() => {
    if (failed) onFailed()
  }, [failed, onFailed])
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 大图用派生预览直链，比例已由外框锁住。
    <img
      ref={revealRef}
      src={src}
      alt={alt}
      draggable={false}
      onLoad={onRevealLoad}
      onError={onRevealError}
      style={revealStyle}
      className={cn('absolute inset-0 size-full object-cover', revealClassName)}
    />
  )
}
