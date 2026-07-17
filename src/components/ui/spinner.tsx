'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Unified loading spinner — collapses 60+ ad-hoc `<Loader2 className="animate-spin
 * size-N" />` call sites onto one component/size ledger.
 * Spec: docs/plans/loading-language-2026-07.md §1 (visual) +
 *       docs/plans/spinner-unify-2026-07.md (engineering skeleton).
 *
 * Sizing is the token surface here — three fixed steps, no arbitrary values:
 *   sm  14px — dense inline (chips, tree rows, card badges, compact buttons)
 *   md  16px — default: buttons, menu items, dialog rows
 *   lg  24px — block/page-level centered, paired with a text line below it
 *
 * Color is deliberately NOT baked in beyond the default (`currentColor`) —
 * callers needing the "standalone centered" treatment pass
 * `className="text-muted-foreground"` themselves; anything colorful
 * (`text-primary` etc.) is off-limits per the loading-language spec.
 */
const spinnerVariants = cva(
  'animate-spin motion-reduce:animate-none motion-reduce:opacity-70',
  {
    variants: {
      size: {
        sm: 'size-3.5',
        md: 'size-4',
        lg: 'size-6',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

export interface SpinnerProps
  extends
    Omit<React.ComponentProps<typeof Loader2>, 'size'>,
    VariantProps<typeof spinnerVariants> {
  /** Accessible label. Defaults to the localized "loading" string. */
  label?: string
}

function Spinner({ size, className, label, ...props }: SpinnerProps) {
  const t = useTranslations('Common')
  const accessibleLabel = label ?? t('loading')

  return (
    <Loader2
      role="status"
      aria-label={accessibleLabel}
      strokeWidth={2}
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  )
}

export { Spinner, spinnerVariants }
