'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Key,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import {
  Command,
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
import { getProviderLabel, type AI_ADAPTER_TYPES } from '@/constants/providers'
import { motionTransition } from '@/constants/motion'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useSplitModelOptions } from '@/hooks/use-split-model-options'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

type SavedOptionLabelMode = 'key' | 'model'

function routeKey(option: StudioModelOption): string {
  return `${option.adapterType}::${option.modelId}`
}

/**
 * `mergeModelOptionsWithPreferredSavedRoutes` emits BOTH a `key:<id>` route and
 * a `workspace:<modelId>` route for a model the user has a key row for. Once
 * provider-key coverage makes the workspace twin selectable too, the two render
 * as identical rows. Keep the explicit key route — it pins `apiKeyId` at submit
 * time and carries the key label + health dot — and drop the twin, so the
 * provider row's count matches what the drilled-in list actually shows.
 *
 * `freeTier` twins are NOT redundant: they render under 平台免费额度 and cost
 * the user nothing, so collapsing them into the key route would take away the
 * cheaper choice.
 *
 * Display-only: the full option array is kept for resolving a persisted
 * `optionId`, so an existing selection never loses its trigger label.
 */
function dedupeRedundantWorkspaceRoutes(
  options: StudioModelOption[],
): StudioModelOption[] {
  const keyedRoutes = new Set(
    options.filter((o) => o.sourceType === 'saved').map(routeKey),
  )
  if (keyedRoutes.size === 0) return options
  return options.filter(
    (o) =>
      o.sourceType === 'saved' || o.freeTier || !keyedRoutes.has(routeKey(o)),
  )
}

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
  savedOptionLabelMode?: SavedOptionLabelMode
  /**
   * Optional override for the primary display label of an option.
   * Used when options carry modelIds that are not registered in the
   * Models i18n namespace (e.g. EDIT_MODELS ids like
   * "fal-ai/flux-pro/edit"). Receives the option, returns the
   * label to show in the trigger and list items.
   */
  labelForOption?: (option: StudioModelOption) => string
}

/**
 * Two-step model picker: first pick the provider (厂商), then the concrete
 * model id. Provider rows carry a 国内/海外 region tag and a key/quota status;
 * drilling into a provider lists its models grouped by source. Typing in the
 * search box bypasses the two-step and flat-filters across every provider.
 * Region labels are pure display — they do NOT drive any runtime routing.
 */
export function BaseModelPickerPanel({
  options,
  value,
  onChange,
  onRequestSetup,
  triggerEmptyLabel,
  searchPlaceholder,
  emptySearchText,
  enableSearch = true,
  size = 'default',
  className,
  disabled,
  savedOptionLabelMode = 'model',
  labelForOption,
}: BaseModelPickerPanelProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'providers' | 'models'>('providers')
  const [activeAdapter, setActiveAdapter] = useState<AI_ADAPTER_TYPES | null>(
    null,
  )
  const [search, setSearch] = useState('')
  const reducedMotion = useReducedMotion()

  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const tSetup = useTranslations('QuickSetup')
  const resolvedTriggerEmptyLabel = triggerEmptyLabel ?? tCommon('selectModel')
  const resolvedSearchPlaceholder = searchPlaceholder ?? tCommon('searchModels')
  const resolvedEmptySearchText = emptySearchText ?? tCommon('noModelsFound')

  const { healthMap } = useApiKeysContext()

  const resolveModelLabel = (option: StudioModelOption): string =>
    labelForOption?.(option) ??
    option.displayLabel ??
    getTranslatedModelLabel(tModels, option.modelId)
  const resolveLabel = (option: StudioModelOption): string => {
    const modelLabel = resolveModelLabel(option)
    if (
      option.sourceType === 'saved' &&
      savedOptionLabelMode === 'key' &&
      option.keyLabel
    ) {
      return option.keyLabel
    }
    return modelLabel
  }

  // Everything the list renders — and therefore everything the provider row
  // counts — comes off this deduped view, never off `options` directly.
  const displayOptions = useMemo(
    () => dedupeRedundantWorkspaceRoutes(options),
    [options],
  )

  // Group options by their provider (adapter). Insertion order follows the
  // incoming option order, which is already preference-ranked.
  const providerGroups = useMemo(() => {
    const map = new Map<AI_ADAPTER_TYPES, StudioModelOption[]>()
    for (const opt of displayOptions) {
      const list = map.get(opt.adapterType) ?? []
      list.push(opt)
      map.set(opt.adapterType, list)
    }
    return Array.from(map, ([adapterType, opts]) => ({ adapterType, opts }))
  }, [displayOptions])

  // With a single provider the first step is pointless — jump straight to its
  // model list (and hide the back affordance).
  const singleProvider = providerGroups.length <= 1

  // Reset the two-step view ONLY on the closed→open transition. Guarding with
  // a ref (instead of plain `open` deps) is essential: callers often pass a
  // freshly-built `options` array on every render, which would otherwise make
  // this effect re-run mid-interaction and snap the view back to step 1 — the
  // bug where clicking a provider "exits" instead of drilling in.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setSearch('')
    if (singleProvider) {
      setView('models')
      setActiveAdapter(providerGroups[0]?.adapterType ?? null)
    } else {
      setView('providers')
      setActiveAdapter(null)
    }
  }, [open, singleProvider, providerGroups])

  // Resolved against the FULL list so a persisted optionId that dedupe folded
  // away still names the trigger.
  const selectedOption = useMemo(
    () => options.find((o) => o.optionId === value),
    [options, value],
  )
  const selectedLabel = selectedOption
    ? resolveLabel(selectedOption)
    : resolvedTriggerEmptyLabel

  // ...but the check mark has to land on the row that survived dedupe, else a
  // selection stored as `workspace:<id>` shows nothing ticked.
  const checkedOptionId = useMemo(() => {
    if (!selectedOption) return value
    if (displayOptions.some((o) => o.optionId === value)) return value
    return (
      displayOptions.find((o) => routeKey(o) === routeKey(selectedOption))
        ?.optionId ?? value
    )
  }, [displayOptions, selectedOption, value])

  const searching = search.trim().length > 0
  const searchLower = search.trim().toLowerCase()

  const visibleOptions = useMemo(() => {
    if (searching) {
      return displayOptions.filter((opt) => {
        const hay = [
          opt.optionId,
          labelForOption?.(opt) ??
            opt.displayLabel ??
            getTranslatedModelLabel(tModels, opt.modelId),
          opt.keyLabel,
          getProviderLabel(opt.providerConfig),
          opt.maskedKey,
          opt.modelId,
        ]
          .filter((v): v is string => Boolean(v))
          .join(' ')
          .toLowerCase()
        return hay.includes(searchLower)
      })
    }
    if (view === 'models' && activeAdapter) {
      return displayOptions.filter((opt) => opt.adapterType === activeAdapter)
    }
    return []
    // labelForOption/tModels are stable enough for this membership filter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOptions, searching, searchLower, view, activeAdapter])

  const { saved, platform, locked } = useSplitModelOptions(visibleOptions)

  const showingProviders = !searching && view === 'providers'
  const isEmpty = showingProviders
    ? providerGroups.length === 0
    : visibleOptions.length === 0

  // Step 2 used to hide the needs-key models of a provider that already had a
  // usable route ("configuring happens at the provider step"). That silently
  // decoupled the list from the provider row's count — the row advertised N and
  // the drill-in rendered fewer, with no way to reach the rest. It also went
  // further than Hard Rule #8, which says a missing key must route through
  // QuickSetupDialog rather than take the option away. Every model the count
  // includes is now rendered; locked ones just carry the key affordance.

  const activeProviderLabel = useMemo(() => {
    const group = providerGroups.find((g) => g.adapterType === activeAdapter)
    return group ? getProviderLabel(group.opts[0].providerConfig) : ''
  }, [providerGroups, activeAdapter])

  const handleSelectOption = (option: StudioModelOption) => {
    onChange(option)
    setOpen(false)
  }
  const handleSelectLocked = (option: StudioModelOption) => {
    if (onRequestSetup) onRequestSetup(option)
    setOpen(false)
  }
  const handleSelectProvider = (adapterType: AI_ADAPTER_TYPES) => {
    setActiveAdapter(adapterType)
    setView('models')
  }

  const renderProviderRow = ({
    adapterType,
    opts,
  }: {
    adapterType: AI_ADAPTER_TYPES
    opts: StudioModelOption[]
  }) => {
    const label = getProviderLabel(opts[0].providerConfig)
    // An explicit key row is the best evidence; provider-level coverage counts
    // too — the adapter has a key, it just isn't bound to any model listed here.
    const savedOpt =
      opts.find((o) => o.sourceType === 'saved') ??
      opts.find((o) => o.providerKeyId)
    const platformOpt = opts.find((o) => o.sourceType !== 'saved' && o.freeTier)

    // Every provider drills into step 2 — even unconfigured ones, which list
    // their models as "needs key" and route to setup on model click. Keeping
    // the row enterable matches the 厂商 → 模型 two-step mental model.
    return (
      <CommandItem
        key={adapterType}
        value={`provider ${adapterType} ${label}`}
        onSelect={() => handleSelectProvider(adapterType)}
        className="group min-h-12 gap-3 px-3 py-2.5"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/65 text-xs font-semibold text-muted-foreground transition-colors group-hover:bg-background/80 group-hover:text-foreground group-data-[selected=true]:bg-background/80 group-data-[selected=true]:text-foreground">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{label}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/75">
            {tCommon('modelCount', { count: opts.length })}
          </span>
        </span>
        {/* 台账 D7 发现 #8（2026-08-02）：编码强度原先是**反的** —— 五个用
            不了的厂商各占一整行「需要 API key」，而唯一能直接跑的免费额度项
            只有一颗 1.5px 裸绿点。扫这一列时，最该被看见的反而最轻。
            对调后：可跑（自带 key / 平台额度）给点 + 文案，缺 key 只留一枚
            静音钥匙图标 —— 「需要 API key」这句话已经由第二步的分组标题承担，
            逐行重复一遍是噪音不是信息。
            ⚠ 缺 key 侧只做「减法」不再调淡：muted-foreground/75 在浅色面上
            本就贴线（memory: muted-foreground 浅面不合格）。 */}
        <span className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground/75">
          {savedOpt ? (
            <>
              <ApiKeyHealthDot
                status={
                  healthMap[savedOpt.keyId ?? savedOpt.providerKeyId ?? '']
                }
              />
              <span className="hidden sm:inline">{tCommon('savedKey')}</span>
            </>
          ) : platformOpt ? (
            <>
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">
                {tSetup('platformQuota')}
              </span>
            </>
          ) : (
            <Key className="size-3" aria-label={tSetup('needsKey')} />
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/55" />
      </CommandItem>
    )
  }

  const renderAvailableModelOption = (option: StudioModelOption) => {
    const isSelected = option.optionId === checkedOptionId
    const indicatorKeyId = option.keyId ?? option.providerKeyId
    const optionLabel = resolveLabel(option)
    const optionModelLabel = resolveModelLabel(option)
    const providerLabel = getProviderLabel(option.providerConfig)
    const optionMeta = option.keyLabel
      ? savedOptionLabelMode === 'model'
        ? `${option.keyLabel} · ${providerLabel}`
        : `${optionModelLabel} · ${providerLabel}`
      : option.freeTier && option.sourceType === 'workspace'
        ? `${providerLabel} · ${tSetup('platformQuota')}`
        : providerLabel
    const searchValue = [
      option.optionId,
      optionLabel,
      optionModelLabel,
      option.keyLabel,
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
            {indicatorKeyId ? (
              <ApiKeyHealthDot status={healthMap[indicatorKeyId]} />
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

  // Shared between the flat search results and the drilled-in models view —
  // both render the same saved/platform/locked groups, only the underlying
  // visibleOptions differ.
  const modelGroups = (
    <>
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
    </>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-label={resolvedTriggerEmptyLabel}
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
        // 台账 D7 发现 #9（2026-08-02）：面板自然高最多 384px，上方空间不够时
        // Radix 默认（avoidCollisions）会把它整个翻到触发器**下方** —— 在画布
        // 生成框里，那正好盖住同一行右端的发送键与张数丸，用户看不到自己刚点
        // 的东西去哪了。关掉翻转后 size() 中间件仍在跑：上面那条 max-h 公式
        // （--radix-popover-content-available-height）会把面板钳进上方剩余空
        // 间、内部滚动，恒定向上、永不遮挡操作行。
        avoidCollisions={false}
        // Drilling provider → models unmounts the clicked row, dropping focus to
        // <body>. Without a focus trap (the studio dock has none) Radix would
        // read that as a focus-outside dismissal and snap the popover shut. Keep
        // it open on focus-out; real outside clicks still close via
        // onPointerDownOutside.
        onFocusOutside={(event) => event.preventDefault()}
        className="studio-scrollbar origin-bottom max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-0.5rem))] w-96 max-w-[calc(100vw-2rem)] touch-pan-y overflow-y-auto overscroll-y-contain rounded-2xl border-border/70 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch] data-[side=top]:slide-in-from-bottom-2"
      >
        <Command
          shouldFilter={false}
          className="h-auto min-h-0 overflow-visible bg-transparent"
        >
          {enableSearch && (
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={resolvedSearchPlaceholder}
              className="h-10 text-sm"
            />
          )}
          {!searching && view === 'models' && !singleProvider && (
            <button
              type="button"
              onClick={() => {
                setView('providers')
                setActiveAdapter(null)
              }}
              className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
            >
              <ArrowLeft className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{activeProviderLabel}</span>
            </button>
          )}
          <CommandList className="min-h-0 max-h-none overflow-x-clip overflow-y-visible">
            {isEmpty ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {resolvedEmptySearchText}
              </div>
            ) : searching ? (
              // Flat cross-provider search is a hard swap: there's no coherent
              // drill direction between a flat list and the hierarchical
              // two-step, so search stays outside the slide animation.
              modelGroups
            ) : (
              // Two-step drill: providers ⇄ models cross-fade in place while the
              // container's height settles via a layout (FLIP) transition. The
              // incoming view fades in at full size — it never grows from 0 — so
              // there's no "rising from the bottom" feel; the wrapper just glides
              // to the new height. popLayout pops the exiting (absolute) view out
              // of flow so only the incoming view drives that height.
              <motion.div
                layout
                className="relative overflow-hidden"
                transition={motionTransition('base', reducedMotion)}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={
                      showingProviders
                        ? 'providers'
                        : `models-${activeAdapter ?? 'none'}`
                    }
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      // The exiting view is position:absolute (popLayout) and
                      // overlays the incoming one — drop its pointer events so it
                      // can't swallow a click on the new view.
                      pointerEvents: 'none',
                    }}
                    transition={motionTransition('base', reducedMotion)}
                  >
                    {showingProviders ? (
                      <CommandGroup>
                        {providerGroups.map(renderProviderRow)}
                      </CommandGroup>
                    ) : (
                      modelGroups
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
