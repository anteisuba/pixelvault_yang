'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Gift,
  ImageIcon,
  KeyRound,
  Mic2,
  Video,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  NODE_MEDIA_KIND_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import { getProviderLabel } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

type WorkflowModelPickerKind = Exclude<
  NodeWorkflowMediaKind,
  typeof NODE_MEDIA_KIND_IDS.text
>

interface WorkflowModelPickerProps {
  value: NodeWorkflowModelSelection | undefined
  options: NodeWorkflowModelOption[]
  onChange(value: NodeWorkflowModelSelection): void
  kind?: NodeWorkflowMediaKind
  className?: string
}

function normalizePickerKind(
  kind: NodeWorkflowMediaKind | undefined,
): WorkflowModelPickerKind {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
    case NODE_MEDIA_KIND_IDS.audio:
      return kind
    default:
      return NODE_MEDIA_KIND_IDS.image
  }
}

function renderPickerIcon(kind: WorkflowModelPickerKind, className: string) {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
      return <Video className={className} />
    case NODE_MEDIA_KIND_IDS.audio:
      return <Mic2 className={className} />
    default:
      return <ImageIcon className={className} />
  }
}

function getPickerIconClassName(kind: WorkflowModelPickerKind): string {
  switch (kind) {
    case NODE_MEDIA_KIND_IDS.video:
      return 'text-teal-200'
    case NODE_MEDIA_KIND_IDS.audio:
      return 'text-fuchsia-200'
    default:
      return 'text-node-amber'
  }
}

function toModelSelection(
  option: NodeWorkflowModelOption,
): NodeWorkflowModelSelection {
  return {
    optionId: option.optionId,
    modelId: option.modelId,
    adapterType: option.adapterType,
    providerConfig: option.providerConfig,
    apiKeyId: option.apiKeyId,
  }
}

function getOptionMeta(option: NodeWorkflowModelOption): string {
  if (option.sourceType === 'saved') {
    return option.maskedKey
      ? `${option.keyLabel ?? getProviderLabel(option.providerConfig)} · ${option.maskedKey}`
      : (option.keyLabel ?? getProviderLabel(option.providerConfig))
  }

  return getProviderLabel(option.providerConfig)
}

export function WorkflowModelPicker({
  value,
  options,
  onChange,
  kind,
  className,
}: WorkflowModelPickerProps) {
  const t = useTranslations('StudioNode.workflowModelPicker')
  const tModels = useTranslations('Models')
  const [open, setOpen] = useState(false)
  const pickerKind = normalizePickerKind(kind)
  const iconClassName = getPickerIconClassName(pickerKind)
  const label = t(`labels.${pickerKind}`)
  const selectedOption = useMemo(
    () =>
      value
        ? (options.find((option) => option.optionId === value.optionId) ??
          value)
        : undefined,
    [options, value],
  )
  const selectedLabel = selectedOption
    ? getTranslatedModelLabel(tModels, selectedOption.modelId)
    : t('placeholder')

  const handleSelect = useCallback(
    (option: NodeWorkflowModelOption) => {
      onChange(toModelSelection(option))
      setOpen(false)
    },
    [onChange],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          className={cn(
            'nodrag nopan nowheel flex h-9 min-w-0 items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-2.5 text-left text-node-muted transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-amber/35',
            selectedOption && 'border-node-amber/55 text-node-foreground',
            className,
          )}
        >
          {renderPickerIcon(pickerKind, cn('size-3.5 shrink-0', iconClassName))}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">
            {selectedLabel}
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-72 overflow-hidden rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
      >
        <div className="border-b border-node-panel-inner px-4 py-3">
          <p className="text-sm font-semibold text-node-foreground">{label}</p>
          <p className="mt-1 text-xs leading-5 text-node-muted">
            {t(`hints.${pickerKind}`)}
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto overscroll-contain p-2">
          {options.length === 0 ? (
            <div className="rounded-xl px-3 py-3 text-xs leading-5 text-node-muted">
              {t(`noOptions.${pickerKind}`)}
            </div>
          ) : null}
          {options.map((option) => {
            const isSelected = option.optionId === value?.optionId
            const isSaved = option.sourceType === 'saved'
            const isFree = option.freeTier && option.sourceType === 'workspace'

            return (
              <button
                key={option.optionId}
                type="button"
                onClick={() => handleSelect(option)}
                className={cn(
                  'group/model relative flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors',
                  isSelected
                    ? 'border-node-amber/25 bg-node-panel-soft'
                    : 'border-transparent bg-node-panel hover:border-node-panel-inner hover:bg-node-panel-inner',
                )}
              >
                {isSelected ? (
                  <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-node-amber" />
                ) : null}
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-node-muted transition-colors group-hover/model:text-node-foreground',
                    isSelected
                      ? 'bg-amber-500/15 text-node-amber'
                      : 'bg-node-panel-inner',
                  )}
                >
                  {renderPickerIcon(pickerKind, 'size-4')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-node-foreground">
                    {getTranslatedModelLabel(tModels, option.modelId)}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-node-muted">
                    {isSaved ? <KeyRound className="size-3 shrink-0" /> : null}
                    {isFree ? <Gift className="size-3 shrink-0" /> : null}
                    <span className="min-w-0 truncate">
                      {getOptionMeta(option)}
                    </span>
                  </span>
                </span>
                {isSelected ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-lime-500/15 text-lime-300">
                    <Check className="size-3.5" />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
