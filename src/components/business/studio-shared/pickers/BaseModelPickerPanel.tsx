'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Key, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { getProviderLabel } from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useSplitModelOptions } from '@/hooks/use-split-model-options'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

export interface BaseModelPickerPanelProps {
  options: StudioModelOption[]
  value: string | null
  onChange: (option: StudioModelOption) => void
  onRequestSetup?: (option: StudioModelOption) => void
  triggerEmptyLabel?: string
  searchPlaceholder?: string
  emptySearchText?: string
  enableSearch?: boolean
  size?: 'compact' | 'default'
  className?: string
  disabled?: boolean
  /**
   * Optional override for the primary display label of an option.
   * Used when options carry modelIds that are not registered in the
   * Models i18n namespace (e.g. EDIT_MODELS ids like
   * "fal-ai/flux-pro/edit"). Receives the option, returns the
   * label to show in the trigger and list items.
   */
  labelForOption?: (option: StudioModelOption) => string
}

export function BaseModelPickerPanel({
  options,
  value,
  onChange,
  onRequestSetup,
  triggerEmptyLabel = 'Select model',
  searchPlaceholder = 'Search models…',
  emptySearchText = 'No models found',
  enableSearch = true,
  size = 'default',
  className,
  disabled,
  labelForOption,
}: BaseModelPickerPanelProps) {
  const [open, setOpen] = useState(false)
  const tModels = useTranslations('Models')
  const tSetup = useTranslations('QuickSetup')

  const resolveLabel = (option: StudioModelOption): string =>
    labelForOption?.(option) ??
    option.keyLabel ??
    getTranslatedModelLabel(tModels, option.modelId)
  const resolveModelLabel = (option: StudioModelOption): string =>
    labelForOption?.(option) ?? getTranslatedModelLabel(tModels, option.modelId)

  const { healthMap } = useApiKeysContext()
  const { saved, platform, locked } = useSplitModelOptions(options)

  const selectedOption = useMemo(
    () => options.find((o) => o.optionId === value),
    [options, value],
  )

  const selectedLabel = selectedOption
    ? resolveLabel(selectedOption)
    : triggerEmptyLabel

  const handleSelectOption = (option: StudioModelOption) => {
    onChange(option)
    setOpen(false)
  }

  const handleSelectLocked = (option: StudioModelOption) => {
    if (onRequestSetup) {
      onRequestSetup(option)
    }
    setOpen(false)
  }

  const renderAvailableModelOption = (option: StudioModelOption) => {
    const isSelected = option.optionId === value
    const optionLabel = resolveLabel(option)
    const optionModelLabel = resolveModelLabel(option)
    const providerLabel = getProviderLabel(option.providerConfig)
    const optionMeta = option.keyLabel
      ? `${optionModelLabel} · ${providerLabel}`
      : option.freeTier && option.sourceType === 'workspace'
        ? `${providerLabel} · ${tSetup('platformQuota')}`
        : providerLabel
    const searchValue = [
      option.optionId,
      optionLabel,
      optionModelLabel,
      providerLabel,
      option.maskedKey,
    ]
      .filter((v): v is string => Boolean(v))
      .join(' ')

    return (
      <CommandItem
        key={option.optionId}
        value={searchValue}
        onSelect={() => handleSelectOption(option)}
        className="group min-h-12 gap-3 px-3 py-2.5"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/65 text-muted-foreground transition-colors group-hover:bg-background/80 group-hover:text-foreground group-data-[selected=true]:bg-background/80 group-data-[selected=true]:text-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {option.keyId ? (
              <ApiKeyHealthDot status={healthMap[option.keyId]} />
            ) : option.freeTier ? (
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
            ) : null}
            <span className="truncate text-sm font-semibold">
              {optionLabel}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/75">
            {optionMeta}
          </span>
        </span>
        {isSelected ? (
          <Check className="size-4 shrink-0 text-foreground" />
        ) : null}
      </CommandItem>
    )
  }

  const renderLockedOption = (option: StudioModelOption) => {
    const optionModelLabel = resolveModelLabel(option)
    const providerLabel = getProviderLabel(option.providerConfig)
    const searchValue = [option.optionId, optionModelLabel, providerLabel]
      .filter(Boolean)
      .join(' ')

    return (
      <CommandItem
        key={option.optionId}
        value={searchValue}
        onSelect={() => handleSelectLocked(option)}
        className="group min-h-12 gap-3 px-3 py-2.5 text-muted-foreground/65"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/45 text-muted-foreground/75 transition-colors group-hover:bg-background/80 group-hover:text-foreground group-data-[selected=true]:bg-background/80 group-data-[selected=true]:text-foreground">
          <Key className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {optionModelLabel}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/70">
            {providerLabel}
          </span>
        </span>
      </CommandItem>
    )
  }

  const triggerHealthIndicator = selectedOption?.keyId ? (
    <ApiKeyHealthDot status={healthMap[selectedOption.keyId]} />
  ) : selectedOption?.freeTier ? (
    <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
  ) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-label={triggerEmptyLabel}
          className={cn(
            'flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 text-xs text-muted-foreground shadow-sm',
            'transition-[color,background-color,border-color,box-shadow] duration-200',
            'hover:border-primary/20 hover:bg-muted/45 hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20',
            'data-[state=open]:border-primary/30 data-[state=open]:bg-muted/55 data-[state=open]:text-foreground data-[state=open]:shadow-md',
            'disabled:pointer-events-none disabled:opacity-50',
            size === 'compact' && 'h-7 px-2',
            className,
          )}
        >
          {triggerHealthIndicator}
          <span
            className={cn(
              'max-w-[7.5rem] truncate font-medium text-foreground sm:max-w-[10rem]',
              size === 'compact' && 'max-w-[6rem] sm:max-w-[8rem]',
            )}
          >
            {selectedLabel}
          </span>
          <ChevronDown
            className={cn(
              'size-3 shrink-0 transition-transform duration-300 ease-out',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        collisionPadding={12}
        className="origin-bottom w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-border/70 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl data-[side=top]:slide-in-from-bottom-2"
      >
        <Command className="bg-transparent">
          {enableSearch && (
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-10 text-sm"
            />
          )}
          <CommandList className="max-h-80 overscroll-contain">
            <CommandEmpty>{emptySearchText}</CommandEmpty>
            {saved.length > 0 && (
              <CommandGroup heading={tSetup('configuredKeys')}>
                {saved.map(renderAvailableModelOption)}
              </CommandGroup>
            )}
            {platform.length > 0 && (
              <CommandGroup heading={tSetup('platformQuota')}>
                {platform.map(renderAvailableModelOption)}
              </CommandGroup>
            )}
            {locked.length > 0 && (
              <CommandGroup heading={tSetup('needsKey')}>
                {locked.map(renderLockedOption)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
