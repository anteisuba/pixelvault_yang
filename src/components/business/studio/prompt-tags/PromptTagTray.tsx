'use client'

import { useState, type ReactNode } from 'react'
import { Minus, Plus, Tag, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { PromptPolarity, PromptTagSelection } from '@/types/prompt-tags'

export function PromptTagTray() {
  const t = useTranslations('PromptTags')
  const { positive, negative } = usePromptTagStack()
  const hasAnyTags = positive.length > 0 || negative.length > 0

  if (!hasAnyTags) {
    return null
  }

  return (
    <div className="mb-1 space-y-1.5 px-1 text-black">
      <TagTrack
        polarity="positive"
        selections={positive}
        trackLabel={t('tray.positiveTrack')}
        emptyLabel={t('tray.addPositive')}
      />

      {negative.length > 0 ? (
        <TagTrack
          polarity="negative"
          selections={negative}
          trackLabel={t('tray.negativeTrack')}
          emptyLabel={t('tray.addNegative')}
        />
      ) : null}
    </div>
  )
}

interface TrackLabelProps {
  icon: ReactNode
  label: string
}

function TrackLabel({ icon, label }: TrackLabelProps) {
  return (
    <span className="inline-flex w-12 shrink-0 items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-neutral-500">
      {icon}
      {label}
    </span>
  )
}

interface TagTrackProps {
  polarity: PromptPolarity
  selections: PromptTagSelection[]
  trackLabel: string
  emptyLabel: string
}

function TagTrack({
  polarity,
  selections,
  trackLabel,
  emptyLabel,
}: TagTrackProps) {
  const t = useTranslations('PromptTags')
  const [expanded, setExpanded] = useState(false)
  const visibleSelections = expanded ? selections : selections.slice(0, 6)
  const hiddenCount = Math.max(0, selections.length - visibleSelections.length)

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TrackLabel
        icon={
          polarity === 'negative' ? (
            <Minus className="size-3.5" />
          ) : (
            <Tag className="size-3.5" />
          )
        }
        label={trackLabel}
      />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {selections.length === 0 ? (
          <span className="rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs text-neutral-500">
            {emptyLabel}
          </span>
        ) : (
          visibleSelections.map((selection) => (
            <PromptTagChip key={selection.id} selection={selection} />
          ))
        )}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
          >
            +{hiddenCount}
          </button>
        ) : expanded && selections.length > 6 ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded-full border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
          >
            {t('tray.collapse')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function PromptTagChip({ selection }: { selection: PromptTagSelection }) {
  const t = useTranslations('PromptTags')
  const { removeTag, setWeight } = usePromptTagStack()
  const tone =
    selection.polarity === 'negative'
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : 'border-neutral-300 bg-neutral-100 text-neutral-800'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 max-w-40 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium',
            tone,
          )}
        >
          {selection.polarity === 'negative' ? (
            <Minus className="size-3" aria-hidden />
          ) : (
            <Plus className="size-3" aria-hidden />
          )}
          <span className="truncate">{selection.label}</span>
          {selection.weight ? (
            <span className="font-mono text-2xs">x{selection.weight}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 space-y-3 rounded-xl p-3 text-sm"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{selection.label}</p>
          <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
            {selection.promptText}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[0.8, 1, 1.2, 1.4].map((weight) => (
            <Button
              key={weight}
              type="button"
              variant={selection.weight === weight ? 'default' : 'outline'}
              size="xs"
              onClick={() =>
                setWeight(selection.id, weight === 1 ? undefined : weight)
              }
            >
              {weight.toFixed(1)}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => removeTag(selection.tagId)}
        >
          <X className="size-4" aria-hidden />
          {t('chip.remove')}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
