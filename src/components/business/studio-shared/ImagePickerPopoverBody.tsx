'use client'
/* eslint-disable @next/next/no-img-element -- recent-asset thumbnails are remote URLs */

import { useEffect, useState, type ReactNode } from 'react'
import { Library, UploadCloud, X } from '@/components/icons'

import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { STUDIO_ASSISTANT_RECENT_ASSETS } from '@/constants/studio'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { fetchGalleryImages } from '@/lib/api-client'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface ImagePickerPopoverBodyProps {
  dropHint: string
  recentLabel: string
  recentEmptyLabel: string
  openLibraryLabel: string
  onPickFile: () => void
  onDropFile: (file: File) => void
  onPickAsset: (generation: GenerationRecord) => void
  onOpenLibrary: () => void
  /** Disables every add source while keeping existing previews removable. */
  disabledReason?: string
  /** Rendered above the dropzone — e.g. a multi-image preview strip. */
  headerSlot?: ReactNode
  /** Rendered below the "open library" row — e.g. the assistant's video slot. */
  footerSlot?: ReactNode
  className?: string
}

/**
 * ImagePickerPopoverBody — shared image-source popover: drag/paste/click
 * dropzone + recent-assets grid + "open library" fallback. Originally the
 * assistant dock's picker body (2026-07-07 D4); promoted to studio-shared
 * so every image-input chip converges on one UI (docs/references/pages/assistant-shell.md
 * Slice C). All paths only ever call back into the host — this component
 * never triggers generation itself.
 */
export function ImagePickerPopoverBody({
  dropHint,
  recentLabel,
  recentEmptyLabel,
  openLibraryLabel,
  onPickFile,
  onDropFile,
  onPickAsset,
  onOpenLibrary,
  disabledReason,
  headerSlot,
  footerSlot,
  className,
}: ImagePickerPopoverBodyProps) {
  const [assets, setAssets] = useState<GenerationRecord[] | null>(null)
  /** 审核态住操作员 store（切片 Y）—— 这里只读，⛔ 不在选择器里改它。 */
  const { reviewStates } = useStudioOperatorState()
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchGalleryImages(1, STUDIO_ASSISTANT_RECENT_ASSETS, {
      mine: true,
      type: ['image'],
      sort: 'newest',
    }).then((result) => {
      if (cancelled) return
      setAssets(result.success ? (result.data?.generations ?? []) : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabledReason) return
    const file = getImageFileFromDataTransfer(event.clipboardData)
    if (!file) return
    event.preventDefault()
    onDropFile(file)
  }

  return (
    <div
      tabIndex={0}
      aria-disabled={Boolean(disabledReason)}
      onPaste={handlePaste}
      onClick={(event) => event.stopPropagation()}
      className={cn('space-y-3 focus:outline-none', className)}
    >
      {headerSlot}

      {disabledReason ? (
        <p role="status" className="text-xs text-muted-foreground">
          {disabledReason}
        </p>
      ) : null}

      <button
        type="button"
        disabled={Boolean(disabledReason)}
        onClick={onPickFile}
        onDragOver={(event) => {
          if (disabledReason) return
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          if (disabledReason) return
          event.preventDefault()
          setIsDragOver(false)
          const file = getImageFileFromDataTransfer(event.dataTransfer)
          if (file) onDropFile(file)
        }}
        className={cn(
          'flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground',
          isDragOver && 'border-primary/60 bg-primary/10 text-foreground',
        )}
      >
        <UploadCloud className="size-4" />
        {dropHint}
      </button>

      <div className="space-y-1.5">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {recentLabel}
        </p>
        {assets === null ? (
          <div className="flex h-16 items-center justify-center">
            <Spinner size="md" className="text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {recentEmptyLabel}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {assets.map((generation) => {
              /**
               * ⭐ 用户判过「已否」的那几张**看得出来**（切片 Y）：降灰 + 一个叉。
               * ⛔ 不禁用、也不从格子里摘掉 —— 它照旧能当普通参考图，被拒的只有
               * 首帧 / 尾帧两个角色（见 `StudioVideoAssetRail`）。
               */
              const blocked =
                reviewStates[generation.id] ===
                GENERATION_REVIEW_STATE_IDS.blocked
              return (
                <button
                  key={generation.id}
                  type="button"
                  data-blocked={blocked}
                  disabled={Boolean(disabledReason)}
                  onClick={() => onPickAsset(generation)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <img
                    src={generation.url}
                    alt=""
                    loading="lazy"
                    className={cn(
                      'size-full object-cover transition-transform duration-200 group-hover:scale-105',
                      blocked && 'opacity-45 grayscale',
                    )}
                  />
                  {blocked ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 grid place-items-center"
                    >
                      {/* 🔬 contrast-check（2026-09-07）：`status-risk` 对卡背
                       **6.54 / 5.55**（浅 / 深）——信息性图形 3:1，两档都过。 */}
                      <X
                        className="size-5 text-status-risk"
                        strokeWidth={1.5}
                      />
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenLibrary}
        disabled={Boolean(disabledReason)}
        className="h-8 w-full gap-1.5 rounded-lg text-xs"
      >
        <Library className="size-3.5" />
        {openLibraryLabel}
      </Button>

      {footerSlot}
    </div>
  )
}
