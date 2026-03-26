import { Upload } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ImageDropZoneProps {
  isDragging: boolean
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onClick: () => void
  uploadLabel: string
  formatsLabel: string
}

/**
 * Drag-and-drop zone for image upload with click-to-browse.
 * Used in GenerateForm, VideoGenerateForm, and ArenaForm.
 */
export function ImageDropZone({
  isDragging,
  onDrop,
  onDragOver,
  onDragLeave,
  onClick,
  uploadLabel,
  formatsLabel,
}: ImageDropZoneProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick()
        }
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
        isDragging
          ? 'border-primary/50 bg-primary/5'
          : 'border-border/60 bg-background/60 hover:border-primary/30 hover:bg-primary/3',
      )}
    >
      <Upload className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{uploadLabel}</p>
      <p className="font-serif text-xs text-muted-foreground">{formatsLabel}</p>
    </div>
  )
}
