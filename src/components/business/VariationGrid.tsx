'use client'
/* eslint-disable @next/next/no-img-element */

import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'

import type { GenerationRecord } from '@/types'

interface VariationGridProps {
  sourceImageUrl: string
  variations: GenerationRecord[]
  failedModels: string[]
}

export function VariationGrid({
  sourceImageUrl,
  variations,
  failedModels,
}: VariationGridProps) {
  const t = useTranslations('ReverseEngineer')

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">
        {t('variationsTitle', { count: variations.length })}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Source image */}
        <div className="space-y-1.5">
          <div className="overflow-hidden rounded-2xl border-2 border-primary/30">
            <img
              src={sourceImageUrl}
              alt="Original"
              className="aspect-square w-full object-cover"
              loading="lazy"
            />
          </div>
          <p className="text-center text-xs font-medium text-primary">
            {t('originalImage')}
          </p>
        </div>

        {/* Variations */}
        {variations.map((variation) => (
          <div key={variation.id} className="space-y-1.5">
            <div className="overflow-hidden rounded-2xl border border-border/75">
              <img
                src={variation.url}
                alt={variation.model}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
            </div>
            <p className="truncate text-center text-xs text-muted-foreground">
              {variation.model}
            </p>
          </div>
        ))}
      </div>

      {/* Failed models */}
      {failedModels.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">
            {t('failedModels', { models: failedModels.join(', ') })}
          </p>
        </div>
      )}
    </div>
  )
}
