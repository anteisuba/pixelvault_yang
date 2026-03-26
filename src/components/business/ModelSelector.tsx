'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Gift, KeyRound, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { API_USAGE } from '@/constants/config'
import {
  getModelById,
  getModelMessageKey,
  getProviderGroup,
  isBuiltInModel,
  PROVIDER_GROUP_ORDER,
  STYLE_GROUP_ORDER,
  type ProviderGroup,
  type StyleTag,
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

function getModelDescription(
  option: StudioModelOption,
  tModels: (key: string) => string,
): string | null {
  if (!isBuiltInModel(option.modelId)) return null
  return tModels(`${getOptionMessageId(option.modelId)}.description`)
}

type GroupMode = 'style' | 'provider'

/** Group options by style tag */
function groupOptionsByStyle(
  options: StudioModelOption[],
): { group: string; options: StudioModelOption[] }[] {
  const grouped = new Map<string, StudioModelOption[]>()
  for (const option of options) {
    const model = isBuiltInModel(option.modelId)
      ? getModelById(option.modelId)
      : undefined
    const tag: StyleTag = model?.styleTag ?? 'general'
    const list = grouped.get(tag) ?? []
    list.push(option)
    grouped.set(tag, list)
  }
  return STYLE_GROUP_ORDER.filter((group) => grouped.has(group)).map(
    (group) => ({ group, options: grouped.get(group)! }),
  )
}

/** Group options by provider */
function groupOptionsByProvider(
  options: StudioModelOption[],
): { group: string; options: StudioModelOption[] }[] {
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
  const [groupMode, setGroupMode] = useState<GroupMode>('style')
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

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

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options
    const q = searchQuery.toLowerCase()
    return options.filter((option) => {
      const label = getModelLabel(option, tModels).toLowerCase()
      const provider = getProviderLabel(option.providerConfig).toLowerCase()
      return label.includes(q) || provider.includes(q)
    })
  }, [options, searchQuery, tModels])

  const needsScroll = filteredOptions.length > MAX_VISIBLE_ITEMS
  const groups = useMemo(
    () =>
      groupMode === 'style'
        ? groupOptionsByStyle(filteredOptions)
        : groupOptionsByProvider(filteredOptions),
    [filteredOptions, groupMode],
  )
  const hasMultipleGroups = groups.length > 1

  const toggleGroupCollapse = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  const getGroupLabel = (group: string): string => {
    return groupMode === 'style'
      ? tCommon(`styleGroups.${group}`)
      : tCommon(`providerGroups.${group}`)
  }

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
        <div className="flex items-center gap-2">
          {needsScroll ? (
            <span className="shrink-0 text-xs text-muted-foreground/60">
              {filteredOptions.length} {t('modelCount')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setGroupMode((prev) => (prev === 'style' ? 'provider' : 'style'))
            }
            className="shrink-0 rounded-full border border-border/60 px-2.5 py-1 text-2xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground"
          >
            {groupMode === 'style' ? t('viewByProvider') : t('viewByStyle')}
          </button>
        </div>
      </div>

      {/* Search */}
      {options.length > 6 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-9 w-full rounded-2xl border border-border/60 bg-background/80 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
      )}

      <div
        ref={listRef}
        role="radiogroup"
        aria-label={t('label')}
        className={cn('grid gap-2', needsScroll && 'max-h-96 overflow-y-auto')}
      >
        {groups.map(({ group, options: groupOptions }) => {
          const isCollapsed = collapsedGroups.has(group)

          return (
            <div key={group} className="grid gap-2">
              {hasMultipleGroups ? (
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse(group)}
                  className="mt-1 flex items-center gap-2 px-1 first:mt-0"
                >
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-primary/50 transition-transform',
                      isCollapsed && '-rotate-90',
                    )}
                  />
                  <span className="text-2xs font-semibold uppercase tracking-widest text-primary/70">
                    {getGroupLabel(group)}
                  </span>
                  <span className="text-2xs text-muted-foreground/50">
                    {groupOptions.length}
                  </span>
                  <div className="h-px flex-1 bg-border/40" />
                </button>
              ) : null}

              {!isCollapsed &&
                groupOptions.map((option) => {
                  const isSelected = option.optionId === value
                  const isFree =
                    option.freeTier && option.sourceType === 'workspace'
                  const isSaved = option.sourceType === 'saved'
                  const description = getModelDescription(option, tModels)

                  return (
                    <button
                      key={option.optionId}
                      ref={isSelected ? selectedRef : undefined}
                      type="button"
                      role="radio"
                      aria-checked={isSelected ? 'true' : 'false'}
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
                        {description && isSelected ? (
                          <span className="mt-1 block font-serif text-xs leading-relaxed text-muted-foreground/70">
                            {description}
                          </span>
                        ) : null}
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
          )
        })}
      </div>
    </div>
  )
}
