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
  onSelect: (generation: GenerationRecord) => void
  /** Visually-hidden title required by Radix Dialog for screen readers. */
  title: string
  /** Visually-hidden description for screen readers. */
  description: string
  /**
   * Restrict the picker to a single media type. Forwarded to KreaAssetBrowser
   * which hides the Tools sidebar group and locks the type filter so callers
   * (e.g. the Image reference chip) can never receive a video/audio asset.
   */
  mediaType?: 'image' | 'video' | 'audio'
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
  title,
  description,
  mediaType,
}: AssetSelectorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[min(80vh,720px)] w-[calc(100%-2rem)] !max-w-6xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-6xl"
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
          <KreaAssetBrowser
            onSelect={(gen) => {
              onSelect(gen)
              onOpenChange(false)
            }}
            mediaType={mediaType}
            className="!h-full !bg-transparent"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
