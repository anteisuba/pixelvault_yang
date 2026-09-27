'use client'

/**
 * 节点卡上的生成进度（加载态 A「边即进度」，owner 2026-09-27 · 设计画布「加载态 A · 全部状态」）。
 *
 * 只是把 studio 那一套 `StudioGeneratingProgress` **包一层**，适配节点卡的圆角
 * （`--radius-node`）与尺寸。⛔ 不重写边线 / 百分比 / 阶段文案 / 完成三段动效 ——
 * 那套算法（估算曲线、闭合 240 → 停 140 → 淡出 200）只该存在一份，两处各写一份必然漂。
 *
 * 矮卡（音频 72 高）例外：一圈画不下，退成波形位置上的一条线 + 百分比 —— 颜色与 A
 * 同一套（浅灰轨道 + 前景色线），百分比按同一条估算走（⚠ 以前只认真进度，没有真进度
 * 时一直停在 0%）。
 */

import { useStore } from '@xyflow/react'
import { useReducedMotion } from 'motion/react'

import { GENERATION_NARROW_BOX_PX } from '@/constants/generation-progress'
import {
  StudioGeneratingProgress,
  type StudioGenerationFailure,
} from '@/components/business/studio-shared/primitives/StudioGeneratingProgress'
import { resolveGenerationProgress } from '@/lib/generation-progress'
import { cn } from '@/lib/utils'

export interface NodeFrameProgressProps {
  readonly elapsedSeconds: number
  /** 0–100 真实进度（视频轮询）。给了就直接驱动百分比。 */
  readonly realProgress?: number
  readonly stageLabel: string
  /** `frame` = 卡边即进度（图 / 视频 / 文本）· `line` = 矮卡的一条进度线（音频）。 */
  readonly variant?: 'frame' | 'line'
  readonly isCompleting?: boolean
  onCompleteAnimationDone?(): void
  /** 线合拢、停一拍之后：宿主把卡边还给卡壳（选中环 / 细灰边在淡出的线底下回来）。 */
  onEdgeRelease?(): void
  /** 失败：线停住变灰，中间一句原因 +「重试」（见 `StudioGeneratingProgress`）。 */
  readonly failure?: StudioGenerationFailure | null
  /** 画布缩小到卡窄于 160px：只写百分比（画布缩放是 transform，容器查询量不到）。 */
  readonly hideStageLabel?: boolean
  /**
   * 画布卡默认 `outside`：线画在卡壳不裁切的那一层（`edgeOverlay`），压在边外、与选中环
   * 重合。宿主整块裁切时传 `inside`（手机镜头卡）。
   */
  readonly edgePlacement?: 'outside' | 'inside'
  readonly className?: string
}

export function NodeFrameProgress({
  elapsedSeconds,
  realProgress,
  stageLabel,
  variant = 'frame',
  isCompleting = false,
  onCompleteAnimationDone,
  onEdgeRelease,
  failure = null,
  hideStageLabel = false,
  edgePlacement = 'outside',
  className,
}: NodeFrameProgressProps) {
  const reducedMotion = Boolean(useReducedMotion())

  if (variant === 'line') {
    // 矮卡：没有大字的余量，读数压成一行小字放在线右边。
    const percent = Math.round(
      resolveGenerationProgress({
        elapsedSeconds,
        realProgress,
        isComplete: isCompleting,
        reducedMotion,
      }).percent,
    )
    return (
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={stageLabel}
        data-node-chrome="frame-progress"
        data-variant="line"
        className={cn(
          'pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 items-center gap-3',
          className,
        )}
      >
        <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface-fill-track">
          <span
            className="block h-full rounded-full bg-foreground transition-[width] duration-slow ease-linear motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {percent}%
        </span>
      </div>
    )
  }

  return (
    <StudioGeneratingProgress
      elapsedSeconds={elapsedSeconds}
      {...(realProgress === undefined ? {} : { realProgress })}
      stageLabel={stageLabel}
      variant="compact"
      isCompleting={isCompleting}
      {...(onCompleteAnimationDone ? { onCompleteAnimationDone } : {})}
      {...(onEdgeRelease ? { onEdgeRelease } : {})}
      failure={failure}
      hideStageLabel={hideStageLabel}
      edgePlacement={edgePlacement}
      cornerRadiusVar="--radius-node"
      className={className}
    />
  )
}

/**
 * 画布缩小后，这张卡在屏幕上窄于 160px：只写百分比（owner 2026-09-27「窄了只留
 * 百分比」）。画布缩放是 transform，容器查询量不到，只能按缩放后的宽度算。
 * ⚠ 只能在 ReactFlow 里用（手机镜头卡不在画布上，不调它）。
 */
export function useNodeProgressNarrow(width: number): boolean {
  return useStore(
    (state) => width * state.transform[2] < GENERATION_NARROW_BOX_PX,
  )
}
