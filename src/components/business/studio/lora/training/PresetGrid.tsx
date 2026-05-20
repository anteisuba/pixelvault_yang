'use client'

import { memo } from 'react'
import {
  Box,
  Image as ImageIcon,
  Palette,
  Sparkles,
  User,
  Wand2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  LORA_TRAINING_PRESETS,
  type LoraTrainingPreset,
  type LoraTrainingPresetId,
} from '@/constants/lora'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface PresetGridProps {
  selectedId: LoraTrainingPresetId | null
  onSelect: (preset: LoraTrainingPreset) => void
  /**
   * 'wide' (default): 2-col on narrow, 3-col on sm+ — for use as a top
   * banner that owns the full main column width.
   * 'compact': always 2-col, no max-height clamp — for a side rail that
   * is itself ~280px wide and uses its own scroll container.
   */
  layout?: 'wide' | 'compact'
  className?: string
}

/**
 * Grid of training presets. Selecting a card fills the form's loraType /
 * baseModel / suggestedTriggerWord in one click — "I just want a
 * character LoRA, don't make me think about dials" path.
 *
 * Disabled presets (Coming Soon) render with a Tooltip explaining why
 * and don't fire onSelect. Memoized because the preset list is static;
 * only `selectedId` changes.
 */
export const PresetGrid = memo(function PresetGrid({
  selectedId,
  onSelect,
  layout = 'wide',
  className,
}: PresetGridProps) {
  const t = useTranslations('LoraTraining')
  const selectedExplanationKey = selectedId
    ? (LORA_TRAINING_PRESETS.find((p) => p.id === selectedId)?.explanationKey ??
      null)
    : null

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('space-y-3', className)}>
        <div
          className={cn(
            'grid auto-rows-fr gap-2',
            layout === 'wide'
              ? 'max-h-[420px] grid-cols-2 overflow-y-auto pr-1 sm:grid-cols-3'
              : 'grid-cols-2',
          )}
        >
          {LORA_TRAINING_PRESETS.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={preset.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
        {selectedExplanationKey ? (
          <p className="rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-2xs leading-relaxed text-muted-foreground">
            {t(selectedExplanationKey)}
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  )
})

interface PresetCardProps {
  preset: LoraTrainingPreset
  isSelected: boolean
  onSelect: (preset: LoraTrainingPreset) => void
}

function PresetCard({ preset, isSelected, onSelect }: PresetCardProps) {
  const t = useTranslations('LoraTraining')
  const Icon = PRESET_ICONS[preset.icon]
  const disabled = !preset.available

  // Compact card: icon + name only. Description used to render below the
  // name but it pushed every card to ~5 lines of body text — clutter that
  // doesn't help selection. The full description lives in
  // `presetExplanationKey` and surfaces below the grid once a card is
  // picked, so nothing is hidden, just deferred.
  const cardClass = cn(
    'group relative flex h-full items-center gap-2 rounded-xl border bg-card p-2.5 text-left transition-all',
    disabled && 'cursor-not-allowed opacity-60',
    !disabled && 'hover:border-primary/40 hover:shadow-sm active:scale-[0.98]',
    isSelected && !disabled && 'border-primary/60 bg-primary/5 shadow-sm',
    !isSelected && !disabled && 'border-border/60',
  )

  const cardContent = (
    <>
      <Icon
        className={cn(
          'size-4 shrink-0',
          isSelected && !disabled ? 'text-primary' : 'text-muted-foreground',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate font-display text-xs font-semibold leading-tight">
        {t(preset.nameKey)}
      </span>
      {disabled ? (
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {t('presetComingSoonBadge')}
        </span>
      ) : null}
    </>
  )

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="button"
            aria-disabled
            tabIndex={-1}
            className={cardClass}
            data-preset-id={preset.id}
          >
            {cardContent}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {t('presetComingSoonTooltip')}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(preset)}
      className={cardClass}
      data-preset-id={preset.id}
    >
      {cardContent}
    </button>
  )
}

const PRESET_ICONS = {
  sparkles: Sparkles,
  user: User,
  palette: Palette,
  box: Box,
  image: ImageIcon,
  wand: Wand2,
} as const
