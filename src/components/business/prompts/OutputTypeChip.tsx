import { AudioLines, Boxes, Film, Image as ImageIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { OutputType } from '@/types'

/** Icon per output modality — mirrors the canvas node icon language. */
export const OUTPUT_TYPE_ICONS: Record<OutputType, LucideIcon> = {
  IMAGE: ImageIcon,
  VIDEO: Film,
  AUDIO: AudioLines,
  MODEL_3D: Boxes,
}

/* Static class maps — Tailwind needs literal class names, no interpolation. */
const ICON_TEXT_CLASSES: Record<OutputType, string> = {
  IMAGE: 'text-modality-image',
  VIDEO: 'text-modality-video',
  AUDIO: 'text-modality-audio',
  MODEL_3D: 'text-muted-foreground',
}

const CHIP_BORDER_CLASSES: Record<OutputType, string> = {
  IMAGE: 'border-modality-image/45',
  VIDEO: 'border-modality-video/45',
  AUDIO: 'border-modality-audio/45',
  MODEL_3D: 'border-border/60',
}

interface OutputTypeChipProps {
  outputType: OutputType
  label: string
  className?: string
}

/**
 * Modality badge for prompt templates: icon + label tinted with the shared
 * modality semantic color (same hue family as canvas port colors) so image /
 * video / audio templates are distinguishable at a glance, incl. on covers.
 */
export function OutputTypeChip({
  outputType,
  label,
  className,
}: OutputTypeChipProps) {
  const Icon = OUTPUT_TYPE_ICONS[outputType]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border bg-background/85 px-2.5 py-1 text-2xs font-medium text-foreground backdrop-blur-sm',
        CHIP_BORDER_CLASSES[outputType],
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn('size-3.5', ICON_TEXT_CLASSES[outputType])}
      />
      {label}
    </span>
  )
}
