'use client'

/**
 * 画布视频卡提示词栏上的**规格 chip**。
 *
 * ⭐ 2026-09-18（D2 ④ 第 12 项）：它不再自己画一张 300 宽的四段弹层，而是挂共用的
 * `SpecChip` —— 与工作台图片 / 工作台视频 / 画布图片卡是**同一颗组件**。chip 上写
 * 全量摘要「比例 · 清晰度 · 时长」，弹层三段（时长是滚动条），「这次按 ×」与
 * 「已挂 N / 上限」那几行只读读数收进底部「更多」折叠区。
 *
 * ⚠ 生成声音**不在这里**（D2 ④ 定案点 6）：它是提示词栏上一颗独立的图标开关
 * （`VideoAudioToggle`）—— 出不出声是这一枪的开关，不是规格。
 *
 * ⛔ 这里不算任何一个数：档位值域与摘要在 `@/lib/spec-chip-model`，底部读数与估价
 * 仍在 `video-node-model.ts`。
 */

import { useTranslations } from 'next-intl'

import {
  asVideoResolution,
  buildVideoSpecChipModel,
} from '@/lib/spec-chip-model'
import { SpecChip } from '@/components/business/studio-shared/spec'
import type { NodeV4GenerationParams } from '@/types/node-workflow'

import { videoFrameReadout } from './video-node-model'

export interface VideoFrameChipProps {
  readonly params: NodeV4GenerationParams | undefined
  /** 档位值域查的是它的能力表 —— 没选模型时三段都不画。 */
  readonly modelId: string | undefined
  /**
   * 推出来的模式（`videoSendMode` 的译名）。**只读**，⛔ 不给它任何可点的控件
   * （spec §5「不设模式页签」）。
   */
  readonly modeLabel?: string
  readonly modeHint?: string
  /** 底部读数里每组的 `已挂 / 上限`。 */
  readonly readoutGroups?: readonly {
    readonly label: string
    readonly current: number
    readonly limit: number | null
  }[]
  /** 这个模型没有参考变体时的那句说明（⛔ 不静默丢用户挂的参考）。 */
  readonly referenceNote?: string
  onDurationChange(next: string): void
  onAspectRatioChange(next: string): void
  onResolutionChange(next: string): void
  readonly disabled?: boolean
}

export function VideoFrameChip({
  params,
  modelId,
  modeLabel,
  modeHint,
  readoutGroups = [],
  referenceNote,
  onDurationChange,
  onAspectRatioChange,
  onResolutionChange,
  disabled = false,
}: VideoFrameChipProps) {
  const t = useTranslations('StudioNode.v4.video')
  const tSpec = useTranslations('StudioSpecChip')

  const durationSeconds = Number(params?.duration)
  const specModel = buildVideoSpecChipModel({
    modelId,
    aspectRatio: params?.aspectRatio ?? null,
    resolution: params?.resolution ?? null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
  })
  const readout = videoFrameReadout(modelId, params, readoutGroups)

  return (
    <SpecChip
      model={specModel}
      // 没模型时 chip 写「选模型」（画板），⛔ 不写一个空的「画面」。
      ariaLabel={modelId ? t('frame.title') : t('frame.pickModel')}
      resolutionLabel={tSpec('videoResolutionLabel')}
      aspectRatio={params?.aspectRatio ?? null}
      onAspectRatioChange={onAspectRatioChange}
      resolution={params?.resolution ?? null}
      onResolutionChange={(next) => {
        const resolution = asVideoResolution(next)
        if (resolution) onResolutionChange(resolution)
      }}
      onDurationChange={(seconds) => onDurationChange(String(seconds))}
      disabled={disabled}
      moreSummary={tSpec('moreItem.details')}
      data-testid="video-frame-chip"
      triggerClassName="h-6 min-h-6 max-w-50 px-2 text-2xs"
      more={
        <div className="flex flex-col gap-3">
          {/* 「这次按 ×」——只读读数（画板 `VideoRefs` 弹层首行）。 */}
          {modeLabel ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-3xs tracking-node-sec text-muted-foreground">
                  {t('frame.modeLabel')}
                </span>
                <span data-video-frame-mode className="text-2sm font-semibold">
                  {modeLabel}
                </span>
              </div>
              {modeHint ? (
                <p className="text-3xs text-muted-foreground">{modeHint}</p>
              ) : null}
            </div>
          ) : null}
          {referenceNote ? (
            <p
              data-video-reference-note
              className="text-3xs text-muted-foreground"
            >
              {referenceNote}
            </p>
          ) : null}
          {readout ? (
            <p
              data-video-frame-readout
              className="text-xs tabular-nums text-muted-foreground"
            >
              {readout}
            </p>
          ) : null}
        </div>
      }
    />
  )
}
