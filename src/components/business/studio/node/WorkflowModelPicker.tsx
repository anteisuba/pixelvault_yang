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
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'
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
  /**
   * Called when the user clicks a model that needs an API key (no saved key,
   * not freeTier). Parent should open QuickSetupDialog. Falls back to a no-op
   * if the parent doesn't wire it (locked items will look clickable but
   * silently do nothing — keep this wired in production callers).
   */
  onClickLocked?(option: NodeWorkflowModelOption): void
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
  onClickLocked,
  kind,
  className,
}: WorkflowModelPickerProps) {
  const t = useTranslations('StudioNode.workflowModelPicker')
  const tModels = useTranslations('Models')
  const tSetup = useTranslations('Setup')
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

  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    option: NodeWorkflowModelOption | null
  }>({ open: false, option: null })

  const handleClickLocked = useCallback(
    (option: NodeWorkflowModelOption) => {
      if (onClickLocked) {
        onClickLocked(option)
      } else {
        setQuickSetup({ open: true, option })
      }
      setOpen(false)
    },
    [onClickLocked],
  )

  const closeQuickSetup = useCallback(
    (next: boolean) => setQuickSetup((s) => ({ ...s, open: next })),
    [],
  )

  // Split options the same way StudioPromptArea does — saved (has API key),
  // platform (freeTier workspace), locked (needs key).
  const { savedOptions, platformOptions, lockedOptions } = useMemo(() => {
    const saved: NodeWorkflowModelOption[] = []
    const platform: NodeWorkflowModelOption[] = []
    const locked: NodeWorkflowModelOption[] = []
    for (const opt of options) {
      if (opt.sourceType === 'saved') saved.push(opt)
      else if (opt.freeTier) platform.push(opt)
      else locked.push(opt)
    }
    return {
      savedOptions: saved,
      platformOptions: platform,
      lockedOptions: locked,
    }
  }, [options])

  return (
    <>
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
            {renderPickerIcon(
              pickerKind,
              cn('size-3.5 shrink-0', iconClassName),
            )}
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
            <p className="text-sm font-semibold text-node-foreground">
              {label}
            </p>
            <p className="mt-1 text-xs leading-5 text-node-muted">
              {t(`hints.${pickerKind}`)}
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto overscroll-contain p-2">
            {options.length === 0 ? (
              <div className="rounded-xl px-3 py-3 text-xs leading-5 text-node-muted">
                {t(`noOptions.${pickerKind}`)}
              </div>
            ) : null}

            {savedOptions.length > 0 ? (
              <div className="mb-2">
                <p className="px-3 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-subtle">
                  {tSetup('configuredKeys')}
                </p>
                {savedOptions.map((option) => {
                  const isSelected = option.optionId === value?.optionId
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
                          <KeyRound className="size-3 shrink-0" />
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
            ) : null}

            {platformOptions.length > 0 ? (
              <div className="mb-2">
                <p className="px-3 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-subtle">
                  {tSetup('platformQuota')}
                </p>
                {platformOptions.map((option) => {
                  const isSelected = option.optionId === value?.optionId
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
                          <Gift className="size-3 shrink-0" />
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
            ) : null}

            {lockedOptions.length > 0 ? (
              <div>
                <p className="px-3 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-nav-dense text-node-subtle">
                  {tSetup('needsKey')}
                </p>
                {lockedOptions.map((option) => (
                  <button
                    key={option.optionId}
                    type="button"
                    onClick={() => handleClickLocked(option)}
                    className="group/locked relative flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-xl border border-transparent bg-node-panel px-3 py-2 text-left text-node-muted/80 transition-colors hover:border-node-panel-inner hover:bg-node-panel-inner hover:text-node-foreground"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-muted/70 transition-colors group-hover/locked:text-node-foreground">
                      <KeyRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {getTranslatedModelLabel(tModels, option.modelId)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-node-muted/70">
                        {getProviderLabel(option.providerConfig)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {quickSetup.option ? (
        <QuickSetupDialog
          open={quickSetup.open}
          onOpenChange={closeQuickSetup}
          modelId={quickSetup.option.modelId}
          modelLabel={getTranslatedModelLabel(
            tModels,
            quickSetup.option.modelId,
          )}
          adapterType={quickSetup.option.adapterType}
          optionId={quickSetup.option.optionId}
        />
      ) : null}
    </>
  )
}
