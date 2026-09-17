'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Settings2 } from '@/components/icons'
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
  CommandSeparator,
} from '@/components/ui/command'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import {
  AUDIO_KIND,
  DEFAULT_AUDIO_KIND,
  type AudioKind,
} from '@/constants/audio-options'
import { MODEL_PICKER_DEFAULT_SCOPE } from '@/constants/model-picker'
import { getModelById } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import { getProviderLabel } from '@/constants/providers'
import {
  getImageReferenceCapability,
  getReferenceCapabilityMax,
} from '@/constants/reference-image-capabilities'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useModelPickerMemory } from '@/hooks/use-model-picker-memory'
import { isRunnableModelOption } from '@/hooks/use-split-model-options'
import {
  channelHasOption,
  flattenPickerModels,
  groupModelsForPicker,
  type PickerChannel,
  type PickerModel,
} from '@/lib/group-models-for-picker'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { toModelChannelCandidate } from '@/lib/pick-default-model-option'
import {
  resolveModelChannel,
  type ModelChannelCandidate,
} from '@/lib/resolve-model-channel'
import { cn } from '@/lib/utils'

import { QuickSetupDialog } from '../setup/QuickSetupDialog'

import { ModelChip } from './ModelChip'

/**
 * 模型选择器 · 方案 A（`node-canvas-v2.md` §1.6，画板 `ModelPicker.dc.html`）。
 *
 * **列表里只有型号**：系列退成分组标题，渠道收进行尾的「N 渠道」。行的第二行写
 * 的是**自动选中的那条渠道**（规则见 `resolveModelChannel`）+ 单价 + 能力标；
 * 用户点开行尾展开单选换渠道，换过就按型号记住，chip 上才附「· fal」。
 *
 * ⚠ 与 `BaseModelPickerPanel`（三层钻取）的关系：那是**同一份数据的旧呈现**，
 * S11 收尾时删。新入口一律走本组件。
 */

interface ChannelView {
  channel: PickerChannel
  candidate: ModelChannelCandidate
  price: string | null
  /** 这条渠道今天点了能不能跑 —— 不能就**不可选**（无实心点），点了去配置。 */
  runnable: boolean
}

/**
 * 分组维度。`series` = 厂商系列（默认，画板 `ModelPicker.dc.html`）；`kind` =
 * 音频三类（语音 / 配乐 / 音效，画板 `AudioSelected.dc.html`「组就是类型」）。
 *
 * ⚠ 两种分组共用**同一份行**（渠道行、健康点、缺 key 灰显一律不变），换的只是
 * 分组标题 —— ⛔ 不为音频另写一份列表。
 */
export const MODEL_PICKER_GROUP_BY = {
  series: 'series',
  kind: 'kind',
} as const

export type ModelPickerGroupBy =
  (typeof MODEL_PICKER_GROUP_BY)[keyof typeof MODEL_PICKER_GROUP_BY]

/** 画板上三组的顺序（语音 → 配乐 → 音效）。 */
const KIND_ORDER: readonly AudioKind[] = [
  AUDIO_KIND.SPEECH,
  AUDIO_KIND.MUSIC,
  AUDIO_KIND.SFX,
]

interface ModelRow {
  modelKey: string
  label: string
  seriesKey: string
  seriesLabel: string
  /** 这个型号产出哪一类音频（`groupBy='kind'` 时的分组键）。 */
  audioKind: AudioKind
  channels: ChannelView[]
  /** 当前生效的那条渠道（手选优先，否则自动规则）。 */
  active: ChannelView
  activeIsManual: boolean
  /** 这一行今天能不能直接跑 —— 不能就灰显、点了进内联配置（Hard Rule 8）。 */
  runnable: boolean
  searchText: string
}

export interface ModelPickerPopoverProps {
  options: StudioModelOption[]
  /** 当前选中的 `optionId`；多选时传 null（选中状态由 `selectedOptionIds` 说）。 */
  value: string | null
  onChange: (option: StudioModelOption) => void
  /** 缺 key 的行点了走这里（宿主开 `QuickSetupDialog`）。 */
  onRequestSetup?: (option: StudioModelOption) => void
  /**
   * 记忆作用域 —— 手选渠道与「最近」按它分开存。传模态名（`image` / `video` …），
   * 同一模态的多个入口共用一份记忆。
   */
  memoryScope?: string
  /** 型号名的来源覆写（目录外的 id 用）；默认走 Models i18n。 */
  labelForOption?: (option: StudioModelOption) => string
  /** 空态时 chip 上写什么。 */
  triggerEmptyLabel?: string
  searchPlaceholder?: string
  emptySearchText?: string
  disabled?: boolean
  className?: string
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  /**
   * 只渲染面板本体，**不渲染 chip、也不自己开浮层**。移动端「chip → 抽屉」的
   * 宿主用它：抽屉的开合归宿主，面板只是内容。
   */
  inline?: boolean
  /** 多选（两个要一起给才生效）：行变可勾选、选完不关。 */
  selectedOptionIds?: ReadonlySet<string>
  onToggleOption?: (option: StudioModelOption) => void
  /** 底部「配置渠道与 key…」；不给则不渲染那一行。 */
  onManageChannels?: () => void
  /** 分组维度，默认按厂商系列；音频栏传 `kind`（语音 / 配乐 / 音效）。 */
  groupBy?: ModelPickerGroupBy
}

/** 能力标 —— 只写目录里查得到的两件事，不猜。 */
function useCapabilityTags(): (option: StudioModelOption) => string[] {
  const t = useTranslations('ModelPicker')
  return (option: StudioModelOption) => {
    const tags: string[] = []
    const max = getReferenceCapabilityMax(
      getImageReferenceCapability(option.adapterType, option.modelId),
    )
    if (max > 1) tags.push(t('capability.multiReference'))
    else if (max === 1) tags.push(t('capability.reference'))
    if (getModelById(option.modelId)?.supportsLora) {
      tags.push(t('capability.lora'))
    }
    return tags
  }
}

export function ModelPickerPopover({
  options,
  value,
  onChange,
  onRequestSetup,
  memoryScope = MODEL_PICKER_DEFAULT_SCOPE,
  labelForOption,
  triggerEmptyLabel,
  searchPlaceholder,
  emptySearchText,
  disabled,
  className,
  side = 'top',
  align = 'end',
  inline = false,
  selectedOptionIds,
  onToggleOption,
  onManageChannels,
  groupBy = MODEL_PICKER_GROUP_BY.series,
}: ModelPickerPopoverProps) {
  const multi = Boolean(selectedOptionIds && onToggleOption)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedModelKey, setExpandedModelKey] = useState<string | null>(null)

  const t = useTranslations('ModelPicker')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const tSetup = useTranslations('QuickSetup')
  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    modelId: string
    modelLabel: string
    adapterType: StudioModelOption['adapterType']
    optionId: string
  } | null>(null)

  const { healthMap } = useApiKeysContext()
  const memory = useModelPickerMemory(memoryScope)
  const capabilityTags = useCapabilityTags()

  const labelOf = (option: StudioModelOption): string =>
    labelForOption?.(option) ??
    option.displayLabel ??
    getTranslatedModelLabel(tModels, option.modelId)

  const rows = useMemo<ModelRow[]>(() => {
    const toView = (channel: PickerChannel): ChannelView => {
      const { option } = channel
      const unitPrice = getModelUnitPriceByStringId(option.modelId)
      return {
        channel,
        // ⚠ 映射与「新卡挑默认模型」共用同一份（`toModelChannelCandidate`），
        // ⛔ 不各写一份：两份会漂成「默认选了 A、行里却说该走 B」。
        candidate: toModelChannelCandidate(option, healthMap, channel.label),
        price: unitPrice
          ? tCommon(`unitPrice.${unitPrice.unit}`, { amount: unitPrice.amount })
          : null,
        runnable: isRunnableModelOption(option),
      }
    }

    const buildRow = (
      model: PickerModel,
      seriesKey: string,
      seriesLabel: string,
    ): ModelRow | null => {
      const channels = model.channels.map(toView)
      const resolved = resolveModelChannel(
        channels.map((c) => c.candidate),
        memory.manualChannelOf(model.modelKey),
      )
      if (!resolved) return null
      const active =
        channels.find(
          (c) => c.channel.channelId === resolved.channel.channelId,
        ) ?? channels[0]
      const catalogModel = getModelById(active.channel.option.modelId)
      return {
        modelKey: model.modelKey,
        label: model.label,
        seriesKey,
        seriesLabel,
        audioKind: catalogModel
          ? resolveAudioKind(catalogModel)
          : DEFAULT_AUDIO_KIND,
        channels,
        active,
        activeIsManual: resolved.reason === 'manual',
        runnable: isRunnableModelOption(active.channel.option),
        searchText: [
          model.label,
          seriesLabel,
          ...channels.map((c) => c.channel.label),
          ...channels.flatMap((c) =>
            c.channel.variants.map((option) => option.modelId),
          ),
        ]
          .join(' ')
          .toLowerCase(),
      }
    }

    return flattenPickerModels(groupModelsForPicker(options, labelOf))
      .map(({ series, model }) =>
        buildRow(model, series.seriesKey, series.label),
      )
      .filter((row): row is ModelRow => row !== null)
    // labelOf / t* 随语言变，分组本身只跟着 options 与记忆走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, healthMap, memory])

  const query = search.trim().toLowerCase()
  const visibleRows = query
    ? rows.filter((row) => row.searchText.includes(query))
    : rows

  const recentRows = query
    ? []
    : memory.recentModelKeys
        .map((key) => rows.find((row) => row.modelKey === key))
        .filter((row): row is ModelRow => row !== undefined)

  const seriesOrder = useMemo(() => {
    const order: { key: string; label: string; rows: ModelRow[] }[] = []
    if (groupBy === MODEL_PICKER_GROUP_BY.kind) {
      for (const kind of KIND_ORDER) {
        const rowsOfKind = visibleRows.filter((row) => row.audioKind === kind)
        // 空组整组不画（Hard Rule 8 说的是「某一档灰掉」，一整类没有模型是另一回事）。
        if (rowsOfKind.length === 0) continue
        order.push({ key: kind, label: t(`kinds.${kind}`), rows: rowsOfKind })
      }
      return order
    }
    for (const row of visibleRows) {
      const group = order.find((g) => g.key === row.seriesKey)
      if (group) group.rows.push(row)
      else
        order.push({ key: row.seriesKey, label: row.seriesLabel, rows: [row] })
    }
    return order
    // t 随语言变，分组本身只跟着行与维度走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, groupBy])

  const selectedRow = useMemo(() => {
    if (multi || !value) return null
    return (
      rows.find((row) =>
        // ⚠ 按**折起来的全部变体**认：存量卡上存的可能正是被折掉的那个参考变体
        // 的 `optionId`，只比代表那条会让 chip 当场退回「选模型」。
        row.channels.some((c) => channelHasOption(c.channel, value)),
      ) ?? null
    )
  }, [multi, rows, value])

  const isRowSelected = (row: ModelRow): boolean =>
    multi
      ? row.channels.some((c) =>
          c.channel.variants.some((option) =>
            selectedOptionIds?.has(option.optionId),
          ),
        )
      : row.channels.some(
          (c) => value !== null && channelHasOption(c.channel, value),
        )

  const commit = (option: StudioModelOption, modelKey: string) => {
    if (!isRunnableModelOption(option)) {
      // 缺 key 的行**只带去配置**（Hard Rule 8 + owner 2026-09-10 真机反馈第五条）：
      // ⛔ 不选中、⛔ 不写 `set_model`、⛔ 不进「最近」——配好 key 回来这一行自己
      // 就可选了。一律走 `QuickSetupDialog`（owner 2026-09-10：「配置模型的这个
      // 项目有啊，可以直接拿来用」）：宿主给了 `onRequestSetup` 就交给它开，没给的
      // 选择器自己开。`onManageChannels` 只属于底部「配置渠道与 key…」那一行。
      setOpen(false)
      if (onRequestSetup) onRequestSetup(option)
      else
        setQuickSetup({
          open: true,
          modelId: option.modelId,
          modelLabel: getTranslatedModelLabel(tModels, option.modelId),
          adapterType: option.adapterType,
          optionId: option.optionId,
        })
      return
    }
    memory.rememberRecent(modelKey)
    if (multi) {
      onToggleOption?.(option)
      return
    }
    onChange(option)
    setOpen(false)
  }

  const handleSelectRow = (row: ModelRow) => {
    commit(row.active.channel.option, row.modelKey)
  }

  const handleSelectChannel = (row: ModelRow, view: ChannelView) => {
    // 手选就是记住 —— 下次这个型号默认走这条，chip 上也才写「· fal」。
    // ⚠ 只记**能跑的**那条：记住一条缺 key 的渠道，会让这个型号从此显示「需配置」，
    // 而用户只是点进去看了看配置。缺 key 的照旧走 QuickSetup。
    if (isRunnableModelOption(view.channel.option)) {
      memory.rememberChannel(row.modelKey, view.channel.channelId)
    }
    commit(view.channel.option, row.modelKey)
  }

  const renderRow = (row: ModelRow, keyPrefix: string) => {
    const expanded = expandedModelKey === row.modelKey
    const selected = isRowSelected(row)
    const meta = row.runnable
      ? [
          row.active.channel.label,
          row.active.price,
          // 能力标只有**图像**那两件事（参考图 / LoRA）。按类型分组 = 这是音频栏，
          // 那两个标签对 TTS 一律没有意义 —— 真机 2026-09-10 抓到 Fish S2.1 Pro
          // 行上写着「参考图」。
          ...(groupBy === MODEL_PICKER_GROUP_BY.kind
            ? []
            : capabilityTags(row.active.channel.option)),
        ]
          .filter(Boolean)
          .join(' · ')
      : t('needsKeyFor', {
          provider: getProviderLabel(row.active.channel.option.providerConfig),
        })
    const keyId =
      row.active.channel.option.keyId ?? row.active.channel.option.providerKeyId

    return (
      <div key={`${keyPrefix}:${row.modelKey}`}>
        <CommandItem
          value={`${keyPrefix}:${row.modelKey}`}
          onSelect={() => handleSelectRow(row)}
          className={cn(
            'items-start gap-2 px-2.5 py-1.5',
            !row.runnable && 'text-muted-foreground',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm">{row.label}</span>
              {row.runnable && keyId ? (
                <ApiKeyHealthDot status={healthMap[keyId]} showLabel={false} />
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
              {meta}
            </span>
          </span>
          {row.channels.length > 1 ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={t('channelCount', { count: row.channels.length })}
              onClick={(event) => {
                // 行尾这颗只管展开渠道，别把整行的「选中」也一起触发了。
                event.preventDefault()
                event.stopPropagation()
                setExpandedModelKey(expanded ? null : row.modelKey)
              }}
              className="flex shrink-0 items-center gap-0.5 rounded-sm px-1 py-0.5 text-2xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {t('channelCount', { count: row.channels.length })}
              <ChevronDown
                className={cn('size-3', expanded && 'rotate-180')}
                aria-hidden
              />
            </button>
          ) : null}
          {selected ? (
            <Check className="size-3.5 shrink-0 text-foreground" aria-hidden />
          ) : null}
        </CommandItem>

        {/* 渠道单选的 inset 底：`muted/60` 铺在 popover 上，
            `text-muted-foreground` 对它 5.23（浅）/ 6.28（暗）、`text-foreground`
            18.80 / 15.59，均过 4.5 —— contrast-check 2026-09-10 实算。 */}
        {expanded ? (
          <div className="mb-1.5 mt-0.5 rounded-md bg-muted/60 py-1">
            {row.channels.map((view) => {
              // ⚠ 选中态只画在**能跑**的那条上：缺 key 的行不是一个选项，
              // 是一条去配置的路（owner 2026-09-10 真机第二条：截图里
              // 「VolcEngine · 需要 API key」的 radio 是亮的）。
              const picked =
                view.runnable &&
                view.channel.channelId === row.active.channel.channelId
              return (
                <CommandItem
                  key={view.channel.channelId}
                  value={`${keyPrefix}:${row.modelKey}:${view.channel.channelId}`}
                  onSelect={() => handleSelectChannel(row, view)}
                  data-channel-runnable={view.runnable}
                  data-channel-picked={picked}
                  className={cn(
                    'gap-2.5 py-1 pl-6 pr-2.5 text-xs',
                    !view.runnable && 'text-muted-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-3 shrink-0 place-items-center rounded-full border',
                      !view.runnable
                        ? 'border-border/50'
                        : picked
                          ? 'border-foreground'
                          : 'border-border',
                    )}
                  >
                    {picked ? (
                      <span className="size-1.5 rounded-full bg-foreground" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {view.channel.label}
                  </span>
                  {/* ⚠ 右端写的是**这条能不能跑**，⛔ 不是「查不查得到价」：
                      两件事各自成立，混用会把有 key 但没登记价的渠道说成缺 key。 */}
                  {!view.runnable ? (
                    <span className="shrink-0 text-muted-foreground">
                      {tSetup('needsKey')}
                    </span>
                  ) : view.price ? (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {view.price}
                    </span>
                  ) : null}
                </CommandItem>
              )
            })}
            <p className="px-6 pb-0.5 pt-1 text-3xs text-muted-foreground">
              {t('autoRule')}
            </p>
          </div>
        ) : null}
      </div>
    )
  }

  const body = (
    <Command shouldFilter={false} className="bg-transparent">
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder={searchPlaceholder ?? t('searchPlaceholder')}
      />
      <CommandList className="max-h-80">
        <CommandEmpty>
          {emptySearchText ?? tCommon('noModelsFound')}
        </CommandEmpty>
        {recentRows.length > 0 ? (
          <CommandGroup heading={t('recent')}>
            {recentRows.map((row) => renderRow(row, 'recent'))}
          </CommandGroup>
        ) : null}
        {seriesOrder.map((group) => (
          <CommandGroup key={group.key} heading={group.label}>
            {group.rows.map((row) => renderRow(row, 'series'))}
          </CommandGroup>
        ))}
      </CommandList>
      {onManageChannels ? (
        <>
          <CommandSeparator />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onManageChannels()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <Settings2 className="size-3.5" aria-hidden />
            {t('manageChannels')}
          </button>
        </>
      ) : null}
    </Command>
  )

  const setupDialog = quickSetup ? (
    <QuickSetupDialog
      open={quickSetup.open}
      onOpenChange={(next) =>
        setQuickSetup((prev) => (prev ? { ...prev, open: next } : prev))
      }
      modelId={quickSetup.modelId}
      modelLabel={quickSetup.modelLabel}
      adapterType={quickSetup.adapterType}
      optionId={quickSetup.optionId}
    />
  ) : null

  if (inline)
    return (
      <>
        <div className={className}>{body}</div>
        {setupDialog}
      </>
    )

  return (
    <>
      {/* 触屏紧凑态自动换成底部 sheet（ui-defaults §6）——⛔ 别在窄视口裸用
          锚定弹层，320 宽的列表会被裁。 */}
      <ResponsivePopover open={open} onOpenChange={setOpen}>
        <ResponsivePopoverTrigger asChild>
          <ModelChip
            modelLabel={
              selectedRow?.label ?? triggerEmptyLabel ?? tCommon('selectModel')
            }
            // 只有手改过渠道才附渠道名 —— 自动选中的渠道不写，chip 上是型号的地盘。
            channelLabel={
              selectedRow?.activeIsManual
                ? selectedRow.active.channel.label
                : null
            }
            active={open}
            disabled={disabled}
            className={className}
          />
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          side={side}
          align={align}
          label={triggerEmptyLabel ?? tCommon('selectModel')}
          className="w-model-picker p-0"
          mobileClassName="px-0"
        >
          {body}
        </ResponsivePopoverContent>
      </ResponsivePopover>
      {setupDialog}
    </>
  )
}
