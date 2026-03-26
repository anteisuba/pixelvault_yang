'use client'

import {
  CheckSquare,
  Globe2,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  Square,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { ROUTES } from '@/constants/routes'
import {
  batchDeleteGenerationsAPI,
  batchUpdateVisibilityAPI,
  deleteGenerationAPI,
} from '@/lib/api-client'

import { GalleryFilterBar } from '@/components/business/GalleryFilterBar'
import { GalleryGrid } from '@/components/business/GalleryGrid'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useGallery } from '@/hooks/use-gallery'
import type { GenerationRecord } from '@/types'

interface ProfileFeedProps {
  initialGenerations: GenerationRecord[]
  initialPage: number
  initialHasMore: boolean
  total: number
}

export function ProfileFeed({
  initialGenerations,
  initialPage,
  initialHasMore,
  total,
}: ProfileFeedProps) {
  const t = useTranslations('LibraryPage')
  const tToasts = useTranslations('Toasts')
  const router = useRouter()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const {
    generations,
    total: currentTotal,
    isLoading,
    hasMore,
    error,
    filters,
    setFilters,
    loadMore,
    sentinelRef,
    removeGeneration,
  } = useGallery({
    initialGenerations,
    initialPage,
    initialHasMore,
    initialTotal: total,
    mine: true,
  })

  const displayTotal = currentTotal ?? total

  const handleDelete = useCallback(
    async (id: string) => {
      const result = await deleteGenerationAPI(id)
      if (result.success) {
        removeGeneration(id)
        toast.success(tToasts('deleteSuccess'))
      } else {
        toast.error(tToasts('deleteFailed'))
      }
    },
    [removeGeneration, tToasts],
  )

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    setIsBatchProcessing(true)
    const result = await batchDeleteGenerationsAPI(Array.from(selectedIds))
    setIsBatchProcessing(false)
    if (result.success) {
      toast.success(t('batchSuccess'))
      exitSelectMode()
      router.refresh()
    } else {
      toast.error(t('batchFailed'))
    }
  }

  const handleBatchVisibility = async (value: boolean) => {
    if (selectedIds.size === 0) return
    setIsBatchProcessing(true)
    const result = await batchUpdateVisibilityAPI(
      Array.from(selectedIds),
      'isPublic',
      value,
    )
    setIsBatchProcessing(false)
    if (result.success) {
      toast.success(t('batchSuccess'))
      exitSelectMode()
      router.refresh()
    } else {
      toast.error(t('batchFailed'))
    }
  }

  return (
    <div className="space-y-7">
      <GalleryFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        isLoading={isLoading}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="font-serif text-sm leading-7 text-muted-foreground">
            {t('collectionDescription')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="editorial-count-pill">
            {t('collectionCount', {
              shown: generations.length,
              total: displayTotal,
            })}
          </span>
          {!selectMode ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setSelectMode(true)}
              disabled={generations.length === 0}
            >
              <CheckSquare className="size-3.5" />
              {t('selectMode')}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={exitSelectMode}
            >
              {t('cancelSelect')}
            </Button>
          )}
        </div>
      </div>

      {/* Batch action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="mr-2 text-sm font-medium text-foreground">
            {t('selectedCount', { count: selectedIds.size })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={isBatchProcessing}
            onClick={() => void handleBatchVisibility(true)}
          >
            <Globe2 className="size-3.5" />
            {t('batchMakePublic')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={isBatchProcessing}
            onClick={() => void handleBatchVisibility(false)}
          >
            <LockKeyhole className="size-3.5" />
            {t('batchMakePrivate')}
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10"
                disabled={isBatchProcessing}
              >
                <Trash2 className="size-3.5" />
                {t('batchDelete')}
              </Button>
            }
            title={t('batchDeleteConfirmTitle', { count: selectedIds.size })}
            description={t('batchDeleteConfirmDescription')}
            cancelLabel={t('cancelSelect')}
            confirmLabel={t('batchDelete')}
            onConfirm={() => void handleBatchDelete()}
          />
        </div>
      )}

      {selectMode ? (
        // Select mode grid with checkboxes
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {generations.map((gen) => {
            const isSelected = selectedIds.has(gen.id)
            return (
              <button
                key={gen.id}
                type="button"
                onClick={() => toggleSelect(gen.id)}
                className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/84 text-left transition-all hover:border-primary/20"
              >
                {gen.outputType === 'VIDEO' ? (
                  <video
                    src={`${gen.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-auto w-full object-cover"
                    style={{ aspectRatio: `${gen.width}/${gen.height}` }}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={gen.url}
                    alt={gen.prompt}
                    className="h-auto w-full object-cover"
                    style={{ aspectRatio: `${gen.width}/${gen.height}` }}
                  />
                )}
                <div className="absolute left-3 top-3">
                  {isSelected ? (
                    <CheckSquare className="size-6 text-primary drop-shadow-md" />
                  ) : (
                    <Square className="size-6 text-white/70 drop-shadow-md" />
                  )}
                </div>
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/10" />
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <GalleryGrid
          generations={generations}
          emptyTitle={t('emptyTitle')}
          emptyDescription={t('emptyDescription')}
          emptyActionHref={ROUTES.STUDIO}
          emptyActionLabel={t('emptyAction')}
          showVisibility
          showDelete
          onDelete={(id) => void handleDelete(id)}
        />
      )}

      {error ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/6 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {hasMore ? (
        <div className="flex flex-col items-center gap-4">
          <div ref={sentinelRef} className="h-4 w-full" />
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={loadMore}
            disabled={isLoading}
            className="rounded-full border-border/80 bg-card/74 px-6"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('loadingMore')}
              </>
            ) : (
              <>
                <RefreshCcw className="size-4" />
                {t('loadMore')}
              </>
            )}
          </Button>
        </div>
      ) : generations.length > 0 ? (
        <div className="rounded-3xl border border-border/70 bg-secondary/18 px-4 py-3 text-center font-serif text-sm text-muted-foreground">
          {t('endOfArchive')}
        </div>
      ) : null}
    </div>
  )
}
