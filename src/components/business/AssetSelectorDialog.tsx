'use client'

import { X } from 'lucide-react'

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
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
 * AssetSelectorDialog — responsive Krea Overlay browser that wraps
 * KreaAssetBrowser. Desktop uses a centred Dialog; mobile/tablet uses a
 * bottom Drawer through ResponsiveDialog. The inner wrapper keeps the `dark`
 * className to
 * flip --sidebar / --background / --foreground tokens to their dark
 * variants (see docs/design/direction.md and docs/design/system/components.md);
 * the editorial canvas behind the dimmed overlay stays warm off-white so the
 * user keeps their bearings inside the studio.
 *
 * Sized to leave the studio chrome visible — Krea-style — rather than
 * taking over the viewport. The `!` overrides on DialogContent unset
 * shadcn's default `sm:max-w-lg`/`p-6`/`gap-4`/`bg-background` so the
 * dark inner surface owns the full content area.
 *
 * The default close button is suppressed because its black-on-white styling
 * disappears against the dark interior; a dark-themed X closes through
 * onOpenChange so the same control works for both Dialog and Drawer.
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
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        showCloseButton={false}
        className="h-[min(88svh,760px)] !max-w-none !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl lg:h-[min(65vh,600px)] lg:w-[calc(100%-2rem)] lg:!max-w-3xl"
        mobileBodyClassName="px-0 pt-0"
      >
        <ResponsiveDialogTitle className="sr-only">
          {title}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          {description}
        </ResponsiveDialogDescription>
        <div className="dark relative flex size-full flex-col overflow-hidden rounded-xl bg-sidebar text-sidebar-foreground ring-1 ring-border/40">
          <button
            type="button"
            aria-label={title}
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </button>
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
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
