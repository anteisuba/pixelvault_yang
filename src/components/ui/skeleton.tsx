import { cn } from '@/lib/utils'

/**
 * 灰块占位（owner 2026-10-08 加载中：**静止不闪**）。⛔ `animate-pulse` / 呼吸 ——
 * 一明一暗读起来像「在闪」，灰块只说「这里会有东西」，形状 = 真内容的形状。
 * 数据到了由糊变清换成真内容：`components/ui/load-reveal.tsx`。
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('rounded-md bg-accent', className)}
      {...props}
    />
  )
}

export { Skeleton }
