'use client'

import { X } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { KreaAssetBrowser } from '@/components/business/KreaAssetBrowser'
import type { GenerationRecord } from '@/types'

interface AssetSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Single-select callback. Required unless `multiSelect` is true (in which
   *  case `onConfirmMany` takes over). Keep both behaviours mutually
   *  exclusive at the call site so the dialog has one resolution path. */
  onSelect?: (generation: GenerationRecord) => void
  initialGenerations?: GenerationRecord[]
  initialTotal?: number
  initialHasMore?: boolean
  initialNextCursor?: string | null
  /** Visually-hidden title required by Radix Dialog for screen readers. */
  title: string
  /** Visually-hidden description for screen readers. */
  description: string
  /**
   * Restrict the picker to a single media type. Forwarded to KreaAssetBrowser
   * which hides the Tools sidebar group and locks the type filter so callers
   * (e.g. the Image reference chip) can never receive a video/audio asset.
   */
  mediaType?: 'image' | 'video' | 'audio' | 'model_3d'
  /** Multi-select mode — tiles toggle a selection set, a confirmation bar
   *  at the bottom commits the batch via `onConfirmMany`. Single-select
   *  `onSelect` is ignored in this mode. Used by LoRA training to pick
   *  many existing assets in one go. */
  multiSelect?: boolean
  /** Fires when the user clicks "Add N" in multi-select mode. The dialog
   *  closes itself afterwards. */
  onConfirmMany?: (generations: GenerationRecord[]) => void
  /** Hard cap for multi-select mode. Picker rejects toggles past this
   *  limit with a toast. */
  maxSelection?: number
}

/**
 * AssetSelectorDialog — centred Krea Overlay modal that wraps
 * KreaAssetBrowser. Uses the `dark` className on the inner wrapper to
 * flip --sidebar / --background / --foreground tokens to their dark
 * variants (see docs/reference/design-system.md → "Krea Overlay
 * Surface"); the editorial canvas behind the dimmed overlay stays warm
 * off-white so the user keeps their bearings inside the studio.
 *
 * Sized to leave the studio chrome visible — Krea-style — rather than
 * taking over the viewport. The `!` overrides on DialogContent unset
 * shadcn's default `sm:max-w-lg`/`p-6`/`gap-4`/`bg-background` so the
 * dark inner surface owns the full content area.
 *
 * Default close button is suppressed because its black-on-white styling
 * disappears against the dark interior; a dark-themed X is rendered
 * inside the wrapper instead.
 */
export function AssetSelectorDialog({
  open,
  onOpenChange,
  onSelect,
  initialGenerations,
  initialTotal,
  initialHasMore,
  initialNextCursor,
  title,
  description,
  mediaType,
  multiSelect = false,
  onConfirmMany,
  maxSelection,
}: AssetSelectorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[min(65vh,600px)] w-[calc(100%-2rem)] !max-w-3xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-3xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <div className="dark relative flex size-full flex-col overflow-hidden rounded-xl bg-sidebar text-sidebar-foreground ring-1 ring-border/40">
          <DialogClose
            aria-label={title}
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
          {multiSelect ? (
            <KreaAssetBrowser
              pickerMultiSelect
              onPickerConfirmMany={(gens) => {
                onConfirmMany?.(gens)
                onOpenChange(false)
              }}
              pickerMaxSelection={maxSelection}
              initialGenerations={initialGenerations}
              initialTotal={initialTotal}
              initialHasMore={initialHasMore}
              initialNextCursor={initialNextCursor}
              mediaType={mediaType}
              className="!h-full !bg-transparent"
            />
          ) : (
            <KreaAssetBrowser
              onSelect={(gen) => {
                onSelect?.(gen)
                onOpenChange(false)
              }}
              initialGenerations={initialGenerations}
              initialTotal={initialTotal}
              initialHasMore={initialHasMore}
              initialNextCursor={initialNextCursor}
              mediaType={mediaType}
              className="!h-full !bg-transparent"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
