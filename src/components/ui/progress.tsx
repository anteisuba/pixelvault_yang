'use client'

import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/** 与 Radix 内部的 DEFAULT_MAX 对齐：`max` 缺省/非法时的刻度上限。 */
const PROGRESS_DEFAULT_MAX = 100

function Progress({
  className,
  value,
  max,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // `value` / `max` 必须原样传给 Root：aria-valuenow / aria-valuemax / data-state
  // 全由 Radix 从它们自己推导，解构掉不传就等于整站的进度条只剩一个没有完成度的
  // role="progressbar"，辅助技术读不到百分比。
  //
  // 指示器位移只是同一组数的视觉投影，所以刻度和「无效值 → 不确定态」的判定都跟
  // Radix 保持一致（见 @radix-ui/react-progress 的 isValidMaxNumber /
  // isValidValueNumber），免得屏幕阅读器和肉眼各读到一个百分比。
  const resolvedMax =
    typeof max === 'number' && max > 0 ? max : PROGRESS_DEFAULT_MAX
  const percent =
    typeof value === 'number' && value >= 0 && value <= resolvedMax
      ? (value / resolvedMax) * 100
      : 0

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-primary/20',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
