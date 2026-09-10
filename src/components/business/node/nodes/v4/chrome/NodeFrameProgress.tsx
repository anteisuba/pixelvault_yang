'use client'

/**
 * 节点卡上的**裱框显影**（spec §1.9，画板 `ImageToolbar.dc.html` 的三阶段）。
 *
 * 只是把 studio 那一套 `StudioGeneratingProgress` **包一层**，适配节点卡的圆角
 * （`--radius-node`）与尺寸。⛔ 不重写描边环 / 百分比 / 阶段文案 / 呼吸 / 完成三段
 * 动效——那套算法（估算曲线、45s 呼吸、闭合 260 → 停 140 → 淡出）只该存在一份，
 * 两处各写一份必然漂。
 *
 * 矮卡（音频 72 高）例外：环画不下，退成波形位置上的一条进度线 + 百分比
 * （spec §1.9 那句「矮卡例外」）。
 */

import { StudioGeneratingProgress } from '@/components/business/studio-shared/primitives/StudioGeneratingProgress'
import { cn } from '@/lib/utils'

export interface NodeFrameProgressProps {
  readonly elapsedSeconds: number
  /** 0–100 真实进度（视频轮询）。给了就直接驱动百分比。 */
  readonly realProgress?: number
  readonly stageLabel: string
  /** `frame` = 描边环（图 / 视频 / 文本）· `line` = 矮卡的一条进度线（音频）。 */
  readonly variant?: 'frame' | 'line'
  readonly isCompleting?: boolean
  onCompleteAnimationDone?(): void
  readonly className?: string
}

export function NodeFrameProgress({
  elapsedSeconds,
  realProgress,
  stageLabel,
  variant = 'frame',
  isCompleting = false,
  onCompleteAnimationDone,
  className,
}: NodeFrameProgressProps) {
  if (variant === 'line') {
    // 矮卡：没有百分比大字的余量，读数压成一行小字放在线右边。
    const percent = Math.round(realProgress ?? 0)
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
            className="block h-full rounded-full bg-primary transition-[width] duration-slow ease-standard"
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
      cornerRadiusVar="--radius-node"
      className={className}
    />
  )
}
