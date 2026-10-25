'use client'

import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * 开关（ui-spec.md §9「开关」）：只有一种尺寸 32×20。关着 `fill-strong` 轨道，
 * 开着黑色 `primary`；圆钮 16 `knob`（开着换 `on-primary`）+ `seg`，内嵌 2px（border-2）→ 行程 12px。
 * 多数放在一行里（图标 + 名字 + 开关，整行能点），⛔ 旁边写「开启后……」。
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer group/switch inline-flex h-5 w-8 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-fast ease-standard outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-primary data-[state=unchecked]:bg-fill-strong',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-knob shadow-seg ring-0 transition-transform duration-spring-slot ease-spring-slot motion-reduce:transition-none data-[state=checked]:translate-x-3 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
