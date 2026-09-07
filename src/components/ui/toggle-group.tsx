'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'

import { springTransition } from '@/constants/motion'
import { cn } from '@/lib/utils'

type ToggleGroupVariant = 'default' | 'segmented'

interface ToggleGroupContextValue {
  readonly variant: ToggleGroupVariant
  /** 分段档判断「哪一格是当前」用的受控值（thumb 要知道自己该挂在谁身上）。 */
  readonly value?: string
  /** 同一组共享的 layoutId —— thumb 靠它在格与格之间滑动。 */
  readonly indicatorId: string
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  variant: 'default',
  indicatorId: '',
})

/**
 * `variant="segmented"` = HIG 分段控件（ui-defaults.md §3.1 画布节点卡例外）：
 * 一条胶囊底 + 一块滑动的 `--primary` thumb，互斥参数用它，⛔ 不再拿一排 chip
 * 冒充单选。
 *
 * ⚠ 分段档必须**受控**（`type="single"` + `value`）——thumb 是按 `value` 与每格
 * 的 `value` 对比挂上去的，非受控时没有当前格，thumb 不会出现。
 */
function ToggleGroup({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & {
  variant?: ToggleGroupVariant
}) {
  const indicatorId = React.useId()
  const segmented = variant === 'segmented'
  const value = typeof props.value === 'string' ? props.value : undefined

  return (
    <ToggleGroupContext.Provider value={{ variant, value, indicatorId }}>
      <ToggleGroupPrimitive.Root
        data-slot="toggle-group"
        data-variant={variant}
        className={cn(
          segmented
            ? 'relative isolate inline-flex items-center rounded-full bg-surface-fill-hover p-0.5'
            : 'inline-flex flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-background/70 p-1',
          className,
        )}
        {...props}
      />
    </ToggleGroupContext.Provider>
  )
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const { variant, value, indicatorId } = React.useContext(ToggleGroupContext)
  const reducedMotion = useReducedMotion()

  if (variant !== 'segmented') {
    return (
      <ToggleGroupPrimitive.Item
        data-slot="toggle-group-item"
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors',
          'hover:bg-muted/40 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          'data-[state=on]:bg-foreground data-[state=on]:text-background',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Item>
    )
  }

  const selected = value !== undefined && value === props.value

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant="segmented"
      className={cn(
        // 命中区：fine 30px / coarse 36px（ui-defaults §5 与移动端配方）。
        'relative z-0 flex min-h-7 flex-1 items-center justify-center rounded-full px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors duration-(--duration-base) ease-standard coarse:min-h-9',
        'hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        'data-[state=on]:text-primary-foreground data-[state=on]:hover:text-primary-foreground',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {selected ? (
        <motion.span
          layoutId={indicatorId}
          data-slot="toggle-group-thumb"
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-primary shadow-sm"
          transition={springTransition('slot', reducedMotion)}
        />
      ) : null}
      <span className="relative">{children}</span>
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
