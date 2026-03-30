'use client'

import { useTranslations } from 'next-intl'

import { ImageCard } from '@/components/business/ImageCard'
import { useStudioGen } from '@/contexts/studio-context'

export function StudioPreview() {
  const { isGenerating, lastGeneration } = useStudioGen()
  const t = useTranslations('StudioV2')

  return (
    <>
      {/* Generation status (aria-live for screen readers) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isGenerating
          ? t('generating')
          : lastGeneration
            ? t('generateSuccess')
            : null}
      </div>

      {/* Loading spinner */}
      {isGenerating && !lastGeneration && (
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
      )}

      {/* Latest generation */}
      {lastGeneration && (
        <div className="rounded-xl overflow-hidden border border-border/40">
          <ImageCard generation={lastGeneration} />
        </div>
      )}
    </>
  )
}
