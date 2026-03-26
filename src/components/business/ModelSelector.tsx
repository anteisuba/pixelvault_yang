'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Check, Gift, KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { API_USAGE } from '@/constants/config'
import {
  getModelMessageKey,
  getProviderGroup,
  isBuiltInModel,
  PROVIDER_GROUP_ORDER,
  type ProviderGroup,
} from '@/constants/models'
import {
  getProviderLabel,
  type AI_ADAPTER_TYPES,
  type ProviderConfig,
} from '@/constants/providers'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface StudioModelOption {
  optionId: string
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  requestCount: number
  isBuiltIn: boolean
  freeTier?: boolean
  sourceType: 'workspace' | 'saved'
  keyId?: string
  keyLabel?: string
  maskedKey?: string
}

interface ModelSelectorProps {
  value: string
  onChange: (value: string) => void
  options: StudioModelOption[]
}

function getOptionMessageId(modelId: string): string {
  return isBuiltInModel(modelId) ? getModelMessageKey(modelId) : modelId
}

function getModelLabel(
  option: StudioModelOption,
  tModels: (key: string) => string,
): string {
  return isBuiltInModel(option.modelId)
    ? tModels(`${getOptionMessageId(option.modelId)}.label`)
    : option.modelId
}

/** Group options by provider, preserving order within each group */
function groupOptionsByProvider(
  options: StudioModelOption[],
): { group: ProviderGroup; options: StudioModelOption[] }[] {
  const grouped = new Map<ProviderGroup, StudioModelOption[]>()
  for (const option of options) {
    const group = getProviderGroup(option.adapterType)
    const list = grouped.get(group) ?? []
    list.push(option)
    grouped.set(group, list)
  }
  return PROVIDER_GROUP_ORDER.filter((group) => grouped.has(group)).map(
    (group) => ({ group, options: grouped.get(group)! }),
  )
}

/** Max visible items before scrolling kicks in */
const MAX_VISIBLE_ITEMS = 9

export function ModelSelector({
  value,
  onChange,
  options,
}: ModelSelectorProps) {
  const t = useTranslations('StudioForm.modelSelector')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const listRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Scroll selected item into view when list overflows
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      const list = listRef.current
      const item = selectedRef.current
      const listRect = list.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [value])

  const needsScroll = options.length > MAX_VISIBLE_ITEMS
  const groups = useMemo(() => groupOptionsByProvider(options), [options])
  const hasMultipleGroups = groups.length > 1

  return (
    <div className="space-y-3" data-onboarding="model">
      <div className="flex items-baseline justify-between gap-2">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-foreground">
            {t('label')}
          </label>
          <p className="font-serif text-sm leading-6 text-muted-foreground">
            {t('hint')}
          </p>
        </div>
        {needsScroll ? (
          <span className="shrink-0 text-xs text-muted-foreground/60">
            {options.length} {t('modelCount')}
          </span>
        ) : null}
      </div>

      <div
        ref={listRef}
        className={cn('grid gap-2', needsScroll && 'max-h-96 overflow-y-auto')}
      >
        {groups.map(({ group, options: groupOptions }) => (
          <div key={group} className="grid gap-2">
            {hasMultipleGroups ? (
              <div className="mt-1 flex items-center gap-2 px-1 first:mt-0">
                <span className="text-2xs font-semibold uppercase tracking-widest text-primary/70">
                  {tCommon(`providerGroups.${group}`)}
                </span>
                <div className="h-px flex-1 bg-border/40" />
              </div>
            ) : null}

            {groupOptions.map((option) => {
              const isSelected = option.optionId === value
              const isFree =
                option.freeTier && option.sourceType === 'workspace'
              const isSaved = option.sourceType === 'saved'

              return (
                <button
                  key={option.optionId}
                  ref={isSelected ? selectedRef : undefined}
                  type="button"
                  onClick={() => onChange(option.optionId)}
                  className={cn(
                    'group relative flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                    isSelected
                      ? 'border-primary/40 bg-primary/5 shadow-sm shadow-primary/8'
                      : 'border-border/50 bg-background/50 hover:border-primary/20 hover:bg-primary/3',
                  )}
                >
                  {/* Selection indicator */}
                  <div
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 bg-background/80 group-hover:border-primary/30',
                    )}
                  >
                    {isSelected ? <Check className="size-3" /> : null}
                  </div>

                  {/* Model info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {getModelLabel(option, tModels)}
                      </span>
                      {isFree ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded-full border-chart-3/40 px-2 py-0 text-2xs text-chart-3"
                        >
                          <Gift className="size-3" />
                          {t('freeBadge')}
                        </Badge>
                      ) : null}
                      {isSaved ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 rounded-full px-2 py-0 text-2xs"
                        >
                          <KeyRound className="size-3" />
                          {t('savedRouteBadge')}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="mt-0.5 block truncate font-serif text-xs text-muted-foreground">
                      {getProviderLabel(option.providerConfig)}
                      {isSaved && option.maskedKey
                        ? ` · ${option.maskedKey}`
                        : null}
                    </span>
                  </div>

                  {/* Cost */}
                  <div className="shrink-0 text-right">
                    {isFree ? (
                      <span className="text-xs font-medium text-chart-3">
                        {t('freeBadge')}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        {tCommon('creditCount', {
                          count:
                            option.requestCount ??
                            API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
                        })}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
