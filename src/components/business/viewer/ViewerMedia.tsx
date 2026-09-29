'use client'

import { useTranslations } from 'next-intl'

import { Box } from '@/components/icons'
import type { GenerationRecord } from '@/types'
import { ModelViewer } from '@/components/business/ModelViewer'
import {
  getGenerationModel3DVisualUrl,
  getGenerationPreviewUrl,
  getGenerationVideoPosterUrl,
} from '@/lib/generation-media'
import { cn } from '@/lib/utils'

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
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 大图用派生预览直链，比例已由外框锁住。
    <img
      src={getGenerationPreviewUrl(generation)}
      alt={generation.prompt || generation.id}
      draggable={false}
      className={cn('size-full object-cover', fadeIn)}
    />
  )
}
