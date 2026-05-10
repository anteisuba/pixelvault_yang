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
}

/**
 * AssetSelectorDialog — full-screen modal that wraps KreaAssetBrowser so the
 * Studio Image chip's "Select asset" view matches Krea's full-bleed asset
 * picker (sidebar + grid) instead of being squeezed into a small popover.
 *
 * Caller controls open state and gets the picked generation via onSelect.
 * KreaAssetBrowser handles its own fetching, so this dialog stays a thin
 * presentational wrapper around the existing browser component.
 */
export function AssetSelectorDialog({
  open,
  onOpenChange,
  onSelect,
  title,
  description,
}: AssetSelectorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Override the default centred sm:max-w-lg dialog for a proper
        // full-bleed Krea-style asset picker
        className="left-0 top-0 grid h-screen w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 p-0 sm:rounded-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <div className="flex h-screen flex-col">
          <KreaAssetBrowser
            onSelect={(gen) => {
              onSelect(gen)
              onOpenChange(false)
            }}
            className="!h-[100vh]"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
