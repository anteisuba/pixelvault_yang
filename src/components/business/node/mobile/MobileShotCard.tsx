'use client'

/**
 * 手机镜头带上的**一张镜头卡**（画板 `MobileCanvas.dc.html` 方向 A 的 `.shot`）。
 *
 * 封面（点封面播 / 暂停）+ 名字 + 模型名 + 参考条 + 右下时长角标。
 * 点卡面以外的地方 = 打开底部抽屉；生成中卡上走裱框显影（与桌面同一件
 * `NodeFrameProgress`）。
 *
 * ⛔ 这张卡不发生成、不写提示词 —— 那些在抽屉里。
 */

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pause, Play } from 'lucide-react'

import { getGeneratingStageKey } from '@/lib/generation-progress'
import { formatShotDisplayName } from '@/lib/node-display-name'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type { NodeV4, NodeV4VideoData } from '@/types/node-workflow'

import { NodeFrameProgress } from '../nodes/v4/chrome'
import { useVideoRailBinding } from '../nodes/v4/video/use-video-rail-binding'
import { formatVideoSeconds } from '../nodes/v4/video/video-node-model'
import { MobileRefStrip } from './MobileRefStrip'
import { isShotNode } from './mobile-rail-model'

export interface MobileShotCardProps {
  readonly node: NodeV4
  /**
   * 这一档没选模型时那条默认模型的 id（由列表算一次传下来）。
   * ⚠ ⛔ 不在每张卡里各跑一遍 `pickDefaultModelOption`：一屏几十张卡就是几十遍。
   */
  readonly defaultModelId: string | undefined
  readonly selected: boolean
  onOpen(): void
}

export function MobileShotCard({
  node,
  defaultModelId,
  selected,
  onOpen,
}: MobileShotCardProps) {
  const tStage = useTranslations('StudioV3')
  const tModels = useTranslations('Models')
  const tRail = useTranslations('StudioNode.mobileRail')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const data = node.data as NodeV4VideoData
  const displayName = isShotNode(node)
    ? formatShotDisplayName(data.label ?? data.name, data.shotNo)
    : data.name
  const generating = Boolean(data.mediaJobId)
  const rail = useVideoRailBinding({
    id: node.id,
    displayName,
    model: data.model,
    disabled: generating,
  })

  const modelId = data.model?.modelId ?? defaultModelId
  const modelLabel = modelId
    ? getTranslatedModelLabel(tModels, modelId)
    : undefined
  const durationSeconds = data.durationSec ?? Number(data.params?.duration ?? 0)
  const posterUrl = data.videoThumbnailUrl

  const togglePlay = () => {
    const element = videoRef.current
    if (!element) return
    if (element.paused) {
      void element.play()
      setPlaying(true)
      return
    }
    element.pause()
    setPlaying(false)
  }

  return (
    <article
      data-mobile-shot-card={node.id}
      data-generating={generating ? 'true' : 'false'}
      className={cn(
        'overflow-hidden rounded-node bg-card corner-squircle shadow-node-chrome',
        selected && 'ring-1.5 ring-foreground',
      )}
    >
      {/* 封面：有片就点着播，没片就是一块虚位（点它进抽屉写词）。 */}
      <div className="relative aspect-video w-full bg-surface-sunken">
        {data.url ? (
          <>
            <video
              ref={videoRef}
              src={data.url}
              poster={posterUrl}
              muted
              playsInline
              preload="metadata"
              aria-label={displayName}
              className="size-full object-cover"
              onEnded={() => setPlaying(false)}
            />
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? tRail('pause') : tRail('play')}
              data-mobile-shot-play
              className="absolute inset-0 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span
                className={cn(
                  'flex size-11 items-center justify-center rounded-full surface-glass transition-opacity duration-fast',
                  playing && 'opacity-0',
                )}
              >
                {playing ? (
                  <Pause aria-hidden className="size-5" />
                ) : (
                  <Play aria-hidden className="size-5" />
                )}
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            data-mobile-shot-empty
            className="flex size-full items-center justify-center px-4 text-center text-xs text-muted-foreground"
          >
            {tRail('emptyShot')}
          </button>
        )}
        {durationSeconds > 0 && !playing ? (
          <span
            data-mobile-shot-duration
            className="absolute bottom-2 right-2 rounded-full px-1.75 py-0.5 text-3xs tabular-nums surface-glass"
          >
            {formatVideoSeconds(durationSeconds)}
          </span>
        ) : null}
        {generating ? (
          <NodeFrameProgress
            elapsedSeconds={0}
            stageLabel={tStage(
              `generatingOverlayStages.${getGeneratingStageKey(0)}` as const,
            )}
          />
        ) : null}
      </div>

      {/* 名字 + 模型：整行就是「进抽屉」的命中区（≥ 44px）。 */}
      <button
        type="button"
        onClick={onOpen}
        data-mobile-shot-open
        className="flex min-h-11 w-full items-center gap-2 px-3 pt-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="min-w-0 flex-1 truncate text-2sm font-semibold">
          {displayName}
        </span>
        {modelLabel ? (
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {modelLabel}
          </span>
        ) : null}
      </button>

      <MobileRefStrip
        items={rail.items}
        onRemove={rail.railProps.onRemove}
        candidatesOf={rail.candidatesOf}
        onPickFromCanvas={rail.railProps.onPickFromCanvas}
        onUpload={rail.railProps.onUpload}
        onLibrary={rail.railProps.onLibrary}
        disabled={generating}
      />
      {rail.overlays}
    </article>
  )
}
