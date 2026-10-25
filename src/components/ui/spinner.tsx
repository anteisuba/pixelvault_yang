'use client'

import { useTranslations } from 'next-intl'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * 转圈（ui-spec.md §9「转圈」⑲）：只有三个点依次变深 —— 按钮里、整块加载（三个点 +
 * 一句「正在打开 LoRA 库」）、一行里都是它；减少动效时不动。有进度的（出图、上传）
 * 仍走「边即进度」。⛔ 各处自己画转圈。
 * Spec: docs/references/loading.md。
 *
 * 三档尺寸（占的格子和以前的转圈一样大，换上去不挤动排版）：
 *   sm  14px — 一行里、药丸、紧凑按钮
 *   md  16px — 默认：按钮、菜单项、弹窗里的一行
 *   lg  24px — 整块居中，下面配一句字
 *
 * 颜色跟字走（`currentColor`）；整块居中那种由调用方传 `text-muted-foreground`。
 */
const spinnerVariants = cva(
  'inline-flex shrink-0 items-center justify-center',
  {
    variants: {
      size: {
        sm: 'size-3.5 gap-0.5',
        md: 'size-4 gap-0.5',
        lg: 'size-6 gap-0.75',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

const DOT_SIZE = { sm: 'size-0.75', md: 'size-1', lg: 'size-1.5' } as const
const DOT_ANIMATION = [
  'animate-spinner-dot-1',
  'animate-spinner-dot-2',
  'animate-spinner-dot-3',
] as const

export interface SpinnerProps
  extends
    Omit<React.ComponentProps<'span'>, 'children'>,
    VariantProps<typeof spinnerVariants> {
  /** Accessible label. Defaults to the localized "loading" string. */
  label?: string
}

function Spinner({ size, className, label, ...props }: SpinnerProps) {
  const t = useTranslations('Common')
  const accessibleLabel = label ?? t('loading')

  return (
    <span
      role="status"
      aria-label={accessibleLabel}
      data-slot="spinner"
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    >
      {DOT_ANIMATION.map((animation) => (
        <span
          key={animation}
          aria-hidden
          className={cn(
            'rounded-full bg-current opacity-25 motion-reduce:animate-none motion-reduce:opacity-60',
            DOT_SIZE[size ?? 'md'],
            animation,
          )}
        />
      ))}
    </span>
  )
}

export { Spinner, spinnerVariants }
