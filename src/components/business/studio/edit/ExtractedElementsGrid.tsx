'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ExtractedElementRecord } from '@/types'

interface ExtractedElementsGridProps {
  items: ExtractedElementRecord[]
  isLoading: boolean
  onRemove: (id: string) => Promise<boolean> | void
}

const PROVIDER_LABEL: Record<string, string> = {
  fal: 'Fal',
  gemini: 'Gemini',
  openai: 'GPT',
}

/**
 * Tile grid of the user's saved cutouts. Stateless — the calling hook owns
 * the list + delete mutation. The thumbnail prefers the WebP derivative when
 * present (created by createImagePreviewAssets); falls back to the full PNG
 * so the grid never breaks if the derivative pipeline didn't run.
 */
export function ExtractedElementsGrid({
  items,
  isLoading,
  onRemove,
}: ExtractedElementsGridProps) {
  const t = useTranslations('StudioImageEdit')

  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {t('extract.materialsLoading')}
      </div>
    )
  }

  if (!isLoading && items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
        {t('extract.materialsEmpty')}
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => {
        const previewUrl = item.thumbnailUrl ?? item.extractedUrl
        return (
          <li
            key={item.id}
            className={cn(
              'group relative overflow-hidden rounded-lg border border-border/60 bg-card',
            )}
          >
            <div className="relative aspect-square w-full bg-[conic-gradient(at_50%_50%,#e5e5e5_0deg,#fff_90deg,#e5e5e5_180deg,#fff_270deg)] bg-[length:16px_16px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={item.name}
                loading="lazy"
                className="size-full object-contain"
              />
            </div>
            <div className="space-y-1 p-2">
              <p className="truncate text-xs font-medium" title={item.name}>
                {item.name}
              </p>
              <p className="truncate text-2xs text-muted-foreground">
                {PROVIDER_LABEL[item.provider] ?? item.provider}
                {' · '}
                {item.modelId}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-1.5 top-1.5 size-7 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={t('extract.materialsDelete')}
              onClick={() => void onRemove(item.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
