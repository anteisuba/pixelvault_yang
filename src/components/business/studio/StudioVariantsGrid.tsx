'use client'

import { memo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { TransformOutput } from '@/types/transform'

interface StudioVariantsGridProps {
  output: TransformOutput | null
  isTransforming: boolean
  variantCount: 1 | 4
  onRetry: (index: number) => void
  className?: string
}

export const StudioVariantsGrid = memo(function StudioVariantsGrid({
  output,
  isTransforming,
  variantCount,
  onRetry,
  className,
}: StudioVariantsGridProps) {
  const t = useTranslations('Transform')

  // Loading state — show skeletons
  if (isTransforming) {
    return (
      <div
        className={cn(
          'grid gap-2',
          variantCount === 4 ? 'grid-cols-2' : 'grid-cols-1',
          className,
        )}
      >
        {Array.from({ length: variantCount }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    )
  }

  // No output yet
  if (!output) return null

  return (
    <div
      className={cn(
        'grid gap-2',
        variantCount === 4 ? 'grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {output.variants.map((variant, index) => (
        <div
          key={index}
          className="relative overflow-hidden rounded-lg border border-border/40"
        >
          {variant.status === 'success' && variant.result ? (
            <img
              src={variant.result.url}
              alt={`Variant ${index + 1}`}
              className="w-full aspect-square object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 aspect-square bg-muted/30">
              <p className="text-xs text-muted-foreground px-4 text-center">
                {variant.error?.displayMessage ?? t('errors.allFailed')}
              </p>
              {variant.error?.retryable && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => onRetry(index)}
                >
                  <RefreshCw className="size-3" />
                  {t('variants.retry')}
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
})
