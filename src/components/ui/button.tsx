import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * 按钮（ui-spec.md §9「按钮」，照 Fish Audio）：一律药丸。
 *
 * · `default` 黑色实心、字加粗 —— 每块板只有这一颗主钮（生成、交给助手、弹窗里的确认）。
 * · `secondary` 白药丸：`raise` 底 + `soft` 影，其余按钮都是它；`size="icon-sm"`
 *   就是 32 的白圆图标键。
 * · `ghost` 不带底，只在悬停时叠一层灰。
 * · `destructive` 红色实心，只用在弹窗里的删除键。
 *
 * 高度档对着规范的控件高度：`xs` 24 · `sm` 32（默认控件）· `default` 36 ·
 * `lg` 40。悬停一律叠 `hover-overlay`（`tint-hover`），按下缩到 0.98，焦点是
 * `focus` 环（ui-spec.md §8）。
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-2sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow,scale] duration-fast ease-standard outline-none focus-visible:shadow-focus active:scale-98 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-45 aria-invalid:ring-2 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary font-semibold text-primary-foreground hover:tint-hover',
        destructive:
          'bg-destructive font-semibold text-on-danger hover:tint-hover',
        secondary: 'bg-raise text-foreground shadow-soft hover:tint-hover',
        ghost: 'text-ink-2 hover:text-foreground hover:tint-hover',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 has-[>svg]:px-3.5',
        xs: "h-6 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 px-3.5 has-[>svg]:px-3',
        lg: 'h-10 px-5 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
