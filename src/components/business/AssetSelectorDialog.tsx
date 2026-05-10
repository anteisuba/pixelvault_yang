'use client'

import {
  Dialog,
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
 * AssetSelectorDialog — full-screen Krea Overlay modal that wraps
 * KreaAssetBrowser. Uses the `dark` className on the inner wrapper to
 * flip --sidebar / --background / --foreground tokens to their dark
 * variants (see docs/reference/design-system.md → "Krea Overlay
 * Surface"); the surrounding editorial canvas underneath stays warm
 * off-white so the user's eye locks onto the asset grid in the modal.
 *
 * The DialogContent classes use `!` (important) to override shadcn's
 * default centred sm:max-w-lg layout — Radix's CSS-variable-driven
 * default has higher specificity than a plain Tailwind class would.
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
      <DialogContent className="!fixed !left-0 !top-0 !grid !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 !gap-0 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none sm:!rounded-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <div className="dark flex size-full flex-col bg-sidebar text-sidebar-foreground">
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
