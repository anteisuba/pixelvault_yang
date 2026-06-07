'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  Diamond,
  Minus,
  Plus,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  LORA_STACK_MAX,
  useActiveLoraStack,
} from '@/hooks/use-active-lora-stack'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { promptIncludesTrigger } from '@/lib/prompt-text'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import type { PromptPolarity, PromptTagSelection } from '@/types/prompt-tags'

function getTriggerSource(asset: unknown): 'official' | 'inferred' | undefined {
  if (!asset || typeof asset !== 'object' || !('triggerSource' in asset)) {
    return undefined
  }
  const source = asset.triggerSource
  return source === 'official' || source === 'inferred' ? source : undefined
}

interface PromptTagTrayProps {
  prompt: string
  onPromptChange: (value: string) => void
  disabled?: boolean
}

export function PromptTagTray({
  prompt,
  onPromptChange,
  disabled,
}: PromptTagTrayProps) {
  const t = useTranslations('PromptTags')
  const { positive, negative } = usePromptTagStack()
  const loraStack = useActiveLoraStack()
  const hasAnyTags =
    positive.length > 0 || negative.length > 0 || loraStack.items.length > 0

  if (!hasAnyTags) {
    return null
  }

  return (
    <div className="mb-1 space-y-1.5 px-1 text-black">
      {loraStack.items.length > 0 ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <TrackLabel
            icon={<Diamond className="size-3.5" />}
            label={t('tray.loraTrack')}
          />
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {loraStack.items.map((entry) => {
              const triggerSource = getTriggerSource(entry.asset)
              return (
                <LoraTagChip
                  key={entry.asset.id}
                  assetId={entry.asset.id}
                  name={entry.asset.name}
                  triggerWord={entry.asset.triggerWord}
                  scale={entry.scale ?? entry.asset.defaultScale}
                  defaultScale={entry.asset.defaultScale}
                  baseModelFamily={entry.asset.baseModelFamily}
                  triggerSource={triggerSource}
                  prompt={prompt}
                  disabled={disabled}
                  onPromptChange={onPromptChange}
                  onRemove={loraStack.remove}
                  onSetScale={loraStack.setScale}
                />
              )
            })}
          </div>
          <span className="shrink-0 text-2xs text-neutral-500">
            {loraStack.items.length}/{LORA_STACK_MAX}
          </span>
        </div>
      ) : null}

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

interface LoraTagChipProps {
  assetId: string
  name: string
  triggerWord: string
  scale: number
  defaultScale: number
  baseModelFamily: string
  triggerSource?: 'official' | 'inferred'
  prompt: string
  disabled?: boolean
  onPromptChange: (value: string) => void
  onRemove: (assetId: string) => void
  onSetScale: (assetId: string, scale: number) => void
}

function LoraTagChip({
  assetId,
  name,
  triggerWord,
  scale,
  baseModelFamily,
  triggerSource,
  prompt,
  disabled,
  onPromptChange,
  onRemove,
  onSetScale,
}: LoraTagChipProps) {
  const t = useTranslations('PromptTags')
  const triggerInPrompt = useMemo(
    () => promptIncludesTrigger(prompt, triggerWord),
    [prompt, triggerWord],
  )

  const handleInsertTrigger = useCallback(() => {
    const trimmed = triggerWord.trim()
    if (!trimmed || triggerInPrompt) return
    const next = prompt.trim() ? `${trimmed}, ${prompt.trim()}` : trimmed
    onPromptChange(next)
  }, [onPromptChange, prompt, triggerInPrompt, triggerWord])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 max-w-52 shrink-0 items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-2 text-xs font-semibold text-violet-800"
        >
          <Diamond className="size-3.5 fill-current" aria-hidden />
          <span className="truncate">{name}</span>
          <span className="shrink-0 rounded-full bg-white/80 px-1 font-mono text-2xs">
            x{scale.toFixed(2)}
          </span>
          {triggerSource === 'inferred' ? (
            <AlertTriangle className="size-3 text-amber-600" aria-hidden />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-72 space-y-3 rounded-xl p-3 text-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {baseModelFamily}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => onRemove(assetId)}
            aria-label={t('chip.remove')}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>

        <button
          type="button"
          disabled={disabled || triggerInPrompt}
          onClick={handleInsertTrigger}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
            triggerInPrompt
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-border hover:bg-muted',
          )}
        >
          <span className="truncate font-mono">{triggerWord}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-semibold">
            {triggerInPrompt ? (
              <>
                <Check className="size-3" aria-hidden />
                {t('lora.inPrompt')}
              </>
            ) : (
              t('lora.insertTrigger')
            )}
          </span>
        </button>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <SlidersHorizontal className="size-3.5" aria-hidden />
              {t('lora.scale')}
            </span>
            <span className="font-mono">x{scale.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1.5}
            step={0.05}
            value={[scale]}
            onValueChange={(value) => {
              const next = value[0]
              if (typeof next === 'number') onSetScale(assetId, next)
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
