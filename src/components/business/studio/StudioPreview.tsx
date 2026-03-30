'use client'

import { useTranslations } from 'next-intl'

import { ImageCard } from '@/components/business/ImageCard'
import { useStudioGen } from '@/contexts/studio-context'

export function StudioPreview() {
  const { isGenerating, lastGeneration } = useStudioGen()
  const t = useTranslations('StudioV2')

  if (!isGenerating && !lastGeneration) return null

  if (isGenerating && !lastGeneration) {
    return (
      <div className="rounded-xl overflow-hidden border border-border/40 bg-muted/20">
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="relative">
            <div className="size-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground font-serif animate-pulse">
            {t('generating')}
          </p>
        </div>
      </div>
    )
  }

  if (lastGeneration) {
    return (
      <div className="rounded-xl overflow-hidden border border-border/40">
        <ImageCard generation={lastGeneration} />
      </div>
    )
  }

  return null
}
