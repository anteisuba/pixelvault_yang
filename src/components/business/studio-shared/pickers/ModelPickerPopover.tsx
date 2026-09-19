'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, Settings2 } from '@/components/icons'
import { useTranslations } from 'next-intl'

import type { StudioModelOption } from '@/types/model-option'
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
import { DURATION_MS } from '@/constants/motion'
import { getModelById } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useIsMobile } from '@/hooks/use-mobile'
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
import {
  modelPickerGateKey,
  subscribeModelPickerOpen,
} from '@/lib/model-picker-gate'
import { toModelChannelCandidate } from '@/lib/pick-default-model-option'
import { resolveModelChannel } from '@/lib/resolve-model-channel'
import { isTouchPrimary } from '@/lib/touch'
import { cn } from '@/lib/utils'

import { QuickSetupDialog } from '../setup/QuickSetupDialog'

import { ModelChip } from './ModelChip'

/**
 * **统一模型选择器**（D2 ④，画板 `DesignD2Picker.dc.html`；决策见
 * `DesignD2Q1Final.dc.html`）。五处宿主 —— 工作台桌面参数栏与手机 composer、画布
 * 节点 chip、助手写作栏、配音间顶栏 —— 用的是**这一个组件**，只换触发器上的字。
 * ⛔ 不再有第二个模型选择面板（`BaseModelPickerPanel` 已于本切片整删）。
 *
 * 结构（owner 亲手定的三件）：
 *
 * 1. **行只有三件**：模型名 · 型号 · 价格。⛔ 行里不画状态点、不写渠道名、不写能力
 *    标 —— 那些是收口前那八套各自加的东西，加回来这一版就又散了。
 * 2. **渠道面板是独立浮层**，浮在弹层右侧、与当前 hover / 选中行顶部对齐。每行：
 *    状态点（绿 = 已配 key，黄 = 缺 key）· 渠道名 · 该渠道单价。选中渠道用
 *    `bg-muted` 底表示，**没有对勾**。
 * 3. **没有「自动」渠道**（`resolveModelChannel`）。多渠道型号没点过渠道 = 空态：
 *    价格位写「—」，触发器写「先选渠道」。单渠道型号面板只有一行且自动选中。
 *
 * 缺 key 的渠道被点 → 弹层与面板一起关闭，开**现有** `QuickSetupDialog`；验证通过
 * 后把这条渠道设为该型号的选择（点随之变绿）。⛔ 不做任何迷你配置面板。
 */

/** 一条渠道在面板上的样子。 */
interface ChannelView {
  channel: PickerChannel
  /** 已格式化的单价（`$0.213 / s`）；目录里查不到价时为 null。 */
  price: string | null
  /** 用户自己配了这条渠道的 key —— 绿点；否则黄点。 */
  hasKey: boolean
}

/**
 * 分组维度。`series` = 厂商系列（默认）；`kind` = 音频三类（语音 / 配乐 / 音效）。
 * 两种分组共用**同一份行**，换的只是分组标题 —— ⛔ 不为音频另写一份列表。
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
  /** 行上第一格：模型名（厂商系列）。 */
  name: string
  /** 行上第二格：型号；拆不出来时为 null。 */
  variant: string | null
  /** 完整标签（触发器的 title 与搜索用）。 */
  label: string
  seriesKey: string
  seriesLabel: string
  audioKind: AudioKind
  channels: ChannelView[]
  /** 当前选中的渠道；**没点过且不止一条时为 null**（= 未选渠道）。 */
  active: ChannelView | null
  searchText: string
}

/**
 * 行所在的段。「最近」会把常用型号顶上来，**同一个型号因此同时出现在两段里** ——
 * 这是有意的（⛔ 别用「去重」把它抹平）。代价是「哪一行」不能再用裸 `modelKey` 认：
 * 两份 DOM 会抢同一把键，后挂载的（分组那份，位置更靠下）盖掉先挂载的，于是渠道
 * 浮层对齐到了下面那一行（owner 2026-09-19 真机）。
 */
const ROW_SECTION = {
  recent: 'recent',
  group: 'group',
} as const

type RowSection = (typeof ROW_SECTION)[keyof typeof ROW_SECTION]

/**
 * **行身份** = 段 + 型号。ref 注册表、当前指到哪行、面板对齐、键盘焦点都按它走。
 * ⚠ 凡是喂给记忆与提交的（`rememberRecent` / `rememberChannel` / `manualChannelOf` /
 * `setPendingModel` / `commit` / `resolveModelChannel`）**仍然用裸 `modelKey`** ——
 * 记忆认的是型号，不是它出现在列表的哪一段；传复合键会让同一型号按段各记一份。
 */
function rowIdOf(section: RowSection, modelKey: string): string {
  return `${section}:${modelKey}`
}

export interface ModelPickerPopoverProps {
  options: StudioModelOption[]
  /** 当前选中的 `optionId`；多选时传 null（选中状态由 `selectedOptionIds` 说）。 */
  value: string | null
  onChange: (option: StudioModelOption) => void
  /** 缺 key 的渠道点了走这里（宿主自己开 `QuickSetupDialog`）；不给则本组件开。 */
  onRequestSetup?: (option: StudioModelOption) => void
  /**
   * 记忆作用域 —— 手选渠道、未选渠道与「最近」按它分开存。传模态名
   * （`image` / `video` …），同一模态的多个入口共用一份记忆。
   */
  memoryScope?: string
  /** 型号名的来源覆写（目录外的 id 用）；默认走 Models i18n。 */
  labelForOption?: (option: StudioModelOption) => string
  /** 空态时触发器上写什么。 */
  triggerEmptyLabel?: string
  searchPlaceholder?: string
  emptySearchText?: string
  disabled?: boolean
  className?: string
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  /**
   * 只渲染面板本体，**不渲染触发器、也不自己开浮层**。宿主自带对话框 / 抽屉时用它。
   */
  inline?: boolean
  /** 多选（两个要一起给才生效）：行变可勾选、选完不关。 */
  selectedOptionIds?: ReadonlySet<string>
  onToggleOption?: (option: StudioModelOption) => void
  /** 底部「配置渠道与 key…」；不给则不渲染那一行。 */
  onManageChannels?: () => void
  /** 分组维度，默认按厂商系列；音频栏传 `kind`（语音 / 配乐 / 音效）。 */
  groupBy?: ModelPickerGroupBy
  /**
   * 「未选渠道」闸门的宿主标识。同一 scope 下同时挂着多个选择器时必须传（画布上每
   * 张卡都是 `image`，各有各的生成键）——不传就退化成按 scope 共用一份，那会让一张
   * 卡没选渠道挡住整块画布。生成侧用同一对 `(scope, gateId)` 调 `useModelChannelGate`。
   */
  gateId?: string
}

/**
 * 行上的「模型名 · 型号」两格。族名是分组标题上那个词，型号是标签削掉族名之后剩下
 * 的那截（`Seedance 2.5` → `Seedance` + `2.5`）。⚠ 削不掉就整条写进第一格，⛔ 不硬
 * 按空格切 —— `FLUX LoRA` 那种名字切完两格都没意义。
 */
function splitModelLabel(
  label: string,
  seriesLabel: string,
): { name: string; variant: string | null } {
  if (
    label.length > seriesLabel.length &&
    label.startsWith(`${seriesLabel} `)
  ) {
    return { name: seriesLabel, variant: label.slice(seriesLabel.length + 1) }
  }
  return { name: label, variant: null }
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
  gateId,
}: ModelPickerPopoverProps) {
  const multi = Boolean(selectedOptionIds && onToggleOption)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  /** 桌面：渠道面板跟着走的那一行；手机：原地展开的那一行（按**行身份**）。 */
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  /** 渠道面板相对弹层顶部的偏移（px）——「与当前行顶部对齐」。 */
  const [panelTop, setPanelTop] = useState(0)

  const t = useTranslations('ModelPicker')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const [quickSetup, setQuickSetup] = useState<{
    modelKey: string
    option: StudioModelOption
    channelLabel: string
    /** 命名框的预填：「型号 · 渠道」（画板 ④ 那格）。 */
    labelDefault: string
  } | null>(null)

  const { healthMap } = useApiKeysContext()
  const memory = useModelPickerMemory(memoryScope, gateId)
  // 触屏紧凑视口走底部 Sheet 分支（`ResponsivePopover` 内部同一条判据）：没有
  // hover，也没有右侧摆面板的地方，渠道列表只能在行里原地展开。
  const sheet = useIsMobile() && isTouchPrimary()

  /**
   * 生成键在「先选渠道」态被点 → 把这个选择器打开。定位那一行不用另做：`panelRow`
   * 在没有 hover 时就是选中 / 待选那一行，下面的对齐 effect 打开即量。
   * ⛔ inline 宿主不订阅：它没有自己的浮层，开合归宿主。
   */
  useEffect(() => {
    if (inline) return
    return subscribeModelPickerOpen(
      modelPickerGateKey(memoryScope, gateId),
      () => setOpen(true),
    )
  }, [inline, memoryScope, gateId])

  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const panelRef = useRef<HTMLDivElement | null>(null)
  /** 指针离开「行 ∪ 过渡区 ∪ 面板」之后才收的那支定时器。 */
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 键盘打开面板时，等面板渲染出来再把焦点送进第一条渠道。 */
  const [focusPanelPending, setFocusPanelPending] = useState(false)

  /**
   * ⚠ 渠道面板**不能在指针离开行的那一刻就收**：它浮在列表右侧，指针从行斜着挪
   * 过去必然要路过两者之间那段过渡区，立刻收 = 渠道根本点不到（owner 2026-09-18
   * 真机）。收口是「离开整块之后延时再收」+ 面板贴住行右缘（间距用 padding 撑，
   * 过渡区因此也算在面板的命中区里），两条一起上。时长走既有刻度 `base`（200ms），
   * ⛔ 不自创数值。
   */
  const cancelPanelClose = useCallback(() => {
    if (closeTimerRef.current === null) return
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const schedulePanelClose = useCallback(() => {
    cancelPanelClose()
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setActiveRowId(null)
    }, DURATION_MS.base)
  }, [cancelPanelClose])

  useEffect(() => cancelPanelClose, [cancelPanelClose])

  const labelOf = useCallback(
    (option: StudioModelOption): string =>
      labelForOption?.(option) ??
      option.displayLabel ??
      getTranslatedModelLabel(tModels, option.modelId),
    // tModels 随语言变，标签本身只跟着覆写走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labelForOption],
  )

  const rows = useMemo<ModelRow[]>(() => {
    const toView = (channel: PickerChannel): ChannelView => {
      const { option } = channel
      const unitPrice = getModelUnitPriceByStringId(option.modelId)
      return {
        channel,
        price: unitPrice
          ? tCommon(`unitPrice.${unitPrice.unit}`, { amount: unitPrice.amount })
          : null,
        hasKey: isRunnableModelOption(option),
      }
    }

    const buildRow = (
      model: PickerModel,
      seriesKey: string,
      seriesLabel: string,
    ): ModelRow | null => {
      if (model.channels.length === 0) return null
      const channels = model.channels.map(toView)
      // ⚠ **宿主手上那个 `optionId` 本身就说明了渠道**：它指的就是某一条具体的路。
      // 所以选中行的渠道先认它，记忆只负责「他还没选到这一行」时的默认。⛔ 别只看
      // 记忆 —— 那会让一个已经选好的型号在换机器后显示成「先选渠道」。
      const byValue = value
        ? (channels.find((c) => channelHasOption(c.channel, value)) ?? null)
        : null
      // ⚠ 映射与「新卡挑默认模型」共用同一份（`toModelChannelCandidate`）。
      const resolved = resolveModelChannel(
        channels.map((c) =>
          toModelChannelCandidate(c.channel.option, healthMap, c.channel.label),
        ),
        memory.manualChannelOf(model.modelKey),
      )
      const active =
        byValue ??
        (resolved
          ? (channels.find(
              (c) => c.channel.channelId === resolved.channel.channelId,
            ) ?? null)
          : null)
      const catalogModel = getModelById(
        (active ?? channels[0])?.channel.option.modelId ?? '',
      )
      return {
        modelKey: model.modelKey,
        ...splitModelLabel(model.label, seriesLabel),
        label: model.label,
        seriesKey,
        seriesLabel,
        audioKind: catalogModel
          ? resolveAudioKind(catalogModel)
          : DEFAULT_AUDIO_KIND,
        channels,
        active,
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
    // tCommon 随语言变，分组本身只跟着清单、key 健康与记忆走。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, healthMap, memory, labelOf, value])

  const query = search.trim().toLowerCase()
  const visibleRows = query
    ? rows.filter((row) => row.searchText.includes(query))
    : rows

  const recentRows = query
    ? []
    : memory.recentModelKeys
        .map((key) => rows.find((row) => row.modelKey === key))
        .filter((row): row is ModelRow => row !== undefined)

  const groups = useMemo(() => {
    const order: { key: string; label: string; rows: ModelRow[] }[] = []
    if (groupBy === MODEL_PICKER_GROUP_BY.kind) {
      for (const kind of KIND_ORDER) {
        const rowsOfKind = visibleRows.filter((row) => row.audioKind === kind)
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

  /**
   * 触发器上写的那一行。⚠ 按**折起来的全部变体**认：存量卡上存的可能正是被折掉的
   * 那个参考变体的 `optionId`，只比代表那条会让触发器当场退回「选模型」。
   */
  const selectedRow = useMemo(() => {
    if (multi) return null
    const byValue = value
      ? rows.find((row) =>
          row.channels.some((c) => channelHasOption(c.channel, value)),
        )
      : undefined
    if (byValue) return byValue
    // 选了型号还没点渠道：宿主那边还没有 optionId，行由记忆认回来。
    return memory.pendingModelKey
      ? (rows.find((row) => row.modelKey === memory.pendingModelKey) ?? null)
      : null
  }, [multi, rows, value, memory.pendingModelKey])

  const isRowSelected = (row: ModelRow): boolean =>
    multi
      ? row.channels.some((c) =>
          c.channel.variants.some((option) =>
            selectedOptionIds?.has(option.optionId),
          ),
        )
      : selectedRow?.modelKey === row.modelKey

  /**
   * 这一轮**真正画出来的行**：行身份 → 行。同一型号在「最近」与它自己的分组里各占
   * 一条，两条身份不同 —— 面板要对齐的是被指到的那一条，不是同型号的另一条。
   */
  const renderedRows = new Map<string, ModelRow>()
  for (const row of recentRows)
    renderedRows.set(rowIdOf(ROW_SECTION.recent, row.modelKey), row)
  for (const group of groups)
    for (const row of group.rows)
      renderedRows.set(rowIdOf(ROW_SECTION.group, row.modelKey), row)

  /** 选中行在列表里的**第一条**身份（「最近」在前，所以优先对到上面那条）。 */
  const selectedRowId = selectedRow
    ? (Array.from(renderedRows.entries()).find(
        ([, row]) => row.modelKey === selectedRow.modelKey,
      )?.[0] ?? null)
    : null

  /** 这一行当前该摆哪份渠道面板：hover / 键盘走到的那行，否则选中行。 */
  const activeRow = activeRowId ? (renderedRows.get(activeRowId) ?? null) : null
  const panelRow = activeRow ?? selectedRow ?? null
  const panelRowId = activeRow ? activeRowId : selectedRowId

  /**
   * 弹层一打开就把面板对到**当前选中 / 待选渠道**的那一行 —— 触发器写着「先选渠道」
   * 时点它，要的正是「打开并定位到这一行」（owner D2 Q1 代价那条）。⛔ 不能只在
   * hover 时量：没有 hover 之前面板会贴在弹层顶上，指的是另一行。
   */
  useEffect(() => {
    if (!panelRowId) return
    const row = rowRefs.current.get(panelRowId)
    const surface = surfaceRef.current
    if (!row || !surface) return
    setPanelTop(
      row.getBoundingClientRect().top - surface.getBoundingClientRect().top,
    )
  }, [panelRowId, open, inline])

  const measureRow = (rowId: string) => {
    const row = rowRefs.current.get(rowId)
    const surface = surfaceRef.current
    if (!row || !surface) return
    setPanelTop(
      row.getBoundingClientRect().top - surface.getBoundingClientRect().top,
    )
  }

  const focusRow = (rowId: string) => {
    cancelPanelClose()
    setActiveRowId(rowId)
    measureRow(rowId)
  }

  /** 键盘开面板那条路：面板渲染出来之后，把焦点送进第一条渠道。 */
  useEffect(() => {
    if (!focusPanelPending) return
    setFocusPanelPending(false)
    const first =
      panelRef.current?.querySelector<HTMLElement>('[role="option"]')
    first?.focus()
  }, [focusPanelPending, panelRowId])

  const commit = (option: StudioModelOption, modelKey: string) => {
    memory.setPendingModel(null)
    memory.rememberRecent(modelKey)
    if (multi) {
      onToggleOption?.(option)
      return
    }
    onChange(option)
    setOpen(false)
  }

  /** 点行 = 选这个型号。渠道已定（单渠道 / 记住过）就一步到位，否则停在未选渠道。 */
  const handleSelectRow = (row: ModelRow, rowId: string) => {
    if (row.active) {
      commit(row.active.channel.option, row.modelKey)
      return
    }
    // 多渠道且没点过：**不替他选**（D2 Q1 删掉了「自动」）。记下型号，把渠道面板
    // 摆到这一行上等他点；关掉弹层则触发器写「先选渠道」。
    memory.setPendingModel(row.modelKey)
    focusRow(rowId)
    setFocusPanelPending(true)
  }

  const handleSelectChannel = (row: ModelRow, view: ChannelView) => {
    if (!view.hasKey) {
      // 黄点渠道：弹层与面板一起关，开现有 QuickSetupDialog（⛔ 不做迷你面板）。
      setOpen(false)
      if (onRequestSetup) {
        onRequestSetup(view.channel.option)
        return
      }
      setQuickSetup({
        modelKey: row.modelKey,
        option: view.channel.option,
        // 标题读「设置 {渠道}」，命名框预填「型号 · 渠道」——画板 ④ 那两格写的
        // 不是同一件事，⛔ 别拿一个字符串糊两处。
        channelLabel: view.channel.label,
        labelDefault: `${row.label} · ${view.channel.label}`,
      })
      return
    }
    // 点过就是记住 —— 下次这个型号默认走这条（跨会话，按型号存）。
    memory.rememberChannel(row.modelKey, view.channel.channelId)
    commit(view.channel.option, row.modelKey)
  }

  /** 渠道面板的一行：状态点 · 渠道名 · 单价。⛔ 没有对勾，选中只用底色。 */
  const renderChannel = (
    row: ModelRow,
    view: ChannelView,
    variant: 'panel' | 'sheet',
  ) => {
    const picked = row.active?.channel.channelId === view.channel.channelId
    return (
      <button
        key={view.channel.channelId}
        type="button"
        role="option"
        aria-selected={picked}
        data-channel-id={view.channel.channelId}
        data-channel-has-key={view.hasKey}
        data-channel-picked={picked || undefined}
        onClick={() => handleSelectChannel(row, view)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md text-left',
          'transition-colors duration-fast ease-standard motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          variant === 'sheet'
            ? 'min-h-11 px-2.5 text-sm'
            : 'px-2 py-1.5 text-2sm hover:bg-accent',
          picked && 'bg-muted',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full',
            view.hasKey ? 'bg-status-applied' : 'bg-status-warning',
          )}
        />
        <span className="min-w-0 flex-1 truncate">{view.channel.label}</span>
        {view.price ? (
          <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
            {view.price}
          </span>
        ) : null}
      </button>
    )
  }

  /**
   * 行上的价格位 —— 三种写法，⚠ 别混：
   * - 已选渠道 → 那条渠道的单价（查不到价就空着）；
   * - 多渠道未选 → 「—」；
   * - 缺 key → **什么都不写**（状态只在渠道面板里用点表示，owner D2 Q1）。
   */
  const renderRowPrice = (row: ModelRow) => {
    if (!row.active) {
      return (
        <span
          aria-hidden
          className="shrink-0 font-mono text-2xs text-muted-foreground/50"
        >
          {t('channelUnset')}
        </span>
      )
    }
    if (!row.active.hasKey || !row.active.price) return null
    return (
      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
        {row.active.price}
      </span>
    )
  }

  const renderRow = (row: ModelRow, section: RowSection) => {
    const selected = isRowSelected(row)
    const rowId = rowIdOf(section, row.modelKey)
    const expanded = sheet && activeRowId === rowId
    return (
      <div
        key={rowId}
        className={cn(
          sheet && expanded && 'rounded-lg bg-muted',
          selected && !expanded && 'rounded-lg bg-muted',
        )}
      >
        <button
          type="button"
          role="option"
          aria-selected={selected}
          data-model-key={row.modelKey}
          data-row-id={rowId}
          // 「指针 / 键盘现在指着哪一行」—— 同一型号的两行**只有一行**会带上它。
          data-row-active={activeRowId === rowId || undefined}
          ref={(el) => {
            if (el) rowRefs.current.set(rowId, el)
            else rowRefs.current.delete(rowId)
          }}
          onMouseEnter={sheet ? undefined : () => focusRow(rowId)}
          onFocus={sheet ? undefined : () => focusRow(rowId)}
          onKeyDown={
            sheet
              ? undefined
              : (event) => {
                  // → 把焦点送进渠道面板（Enter 那条在 `handleSelectRow` 里：
                  // 渠道已定就直接选定，未定才停在面板上等他点）。
                  if (event.key !== 'ArrowRight') return
                  event.preventDefault()
                  focusRow(rowId)
                  setFocusPanelPending(true)
                }
          }
          onClick={() => {
            if (sheet && row.channels.length > 1) {
              // 手机没有 hover 也没有侧面板：点行 = 选中并把这一行原地展开成渠道
              // 列表，再点渠道才收起（D2 ④「手机 · 底部 Sheet」）。
              memory.setPendingModel(row.active ? null : row.modelKey)
              setActiveRowId(expanded ? null : rowId)
              return
            }
            handleSelectRow(row, rowId)
          }}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg text-left',
            'transition-colors duration-fast ease-standard motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            sheet ? 'min-h-11 px-3 text-md' : 'px-2.5 py-2 text-2sm',
            // hover 行**只 1px 描边，不换底**（owner D2 Q1 亲手定）——换底会与
            // 选中行的 `bg-muted` 撞成同一个样子。
            !sheet && 'hover:outline hover:outline-1 hover:outline-border',
          )}
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {row.name}
          </span>
          {row.variant ? (
            <span
              className={cn(
                'min-w-0 shrink truncate text-muted-foreground',
                sheet ? 'text-md' : 'text-2sm',
              )}
            >
              {row.variant}
            </span>
          ) : null}
          {renderRowPrice(row)}
          {selected ? (
            <Check className="size-4 shrink-0 text-foreground" aria-hidden />
          ) : null}
        </button>

        {expanded ? (
          <div
            role="listbox"
            aria-label={t('channelPanelLabel', { model: row.label })}
            className="flex flex-col gap-0.5 px-3 pb-2.5"
          >
            {row.channels.map((view) => renderChannel(row, view, 'sheet'))}
          </div>
        ) : null}
      </div>
    )
  }

  const empty = visibleRows.length === 0 && recentRows.length === 0

  const body = (
    <div
      ref={surfaceRef}
      className="relative"
      onMouseLeave={sheet ? undefined : schedulePanelClose}
      onMouseEnter={sheet ? undefined : cancelPanelClose}
    >
      <div className="p-1.5">
        <label className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-2sm text-muted-foreground">
          <Search className="size-4 shrink-0" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder ?? t('searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div
          role="listbox"
          aria-label={triggerEmptyLabel ?? tCommon('selectModel')}
          className="mt-1 max-h-80 overflow-y-auto"
        >
          {empty ? (
            <p className="px-2.5 py-6 text-center text-2sm text-muted-foreground">
              {emptySearchText ?? tCommon('noModelsFound')}
            </p>
          ) : null}
          {recentRows.length > 0 ? (
            <>
              <p className="px-2.5 pb-1 pt-2 font-mono text-3xs uppercase tracking-nav text-muted-foreground">
                {t('recent')}
              </p>
              {recentRows.map((row) => renderRow(row, ROW_SECTION.recent))}
            </>
          ) : null}
          {groups.map((group) => (
            <div key={group.key}>
              <p className="px-2.5 pb-1 pt-2 font-mono text-3xs uppercase tracking-nav text-muted-foreground">
                {group.label}
              </p>
              {group.rows.map((row) => renderRow(row, ROW_SECTION.group))}
            </div>
          ))}
        </div>

        {onManageChannels ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onManageChannels()
            }}
            className="mt-1 flex w-full items-center gap-2 border-t border-border px-2.5 pb-1 pt-2 text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <Settings2 className="size-4" aria-hidden />
            {t('manageChannels')}
          </button>
        ) : null}
      </div>

      {/* 渠道面板 —— **独立浮层**，浮在弹层右侧、与当前行顶部对齐（owner D2 Q1
          亲手定）。⛔ 不画在列表里：画进去就又是收口前那个「行尾展开」。
          单渠道型号也摆（只有一行且已选中），⛔ 不因为「只有一条」就省掉 —— 面板
          在不在是「这一行有没有被指到」的回执。 */}
      {!sheet && panelRow ? (
        // ⚠ 外层**贴住列表右缘**（`left-full`），视觉间距用 `pl-2` 撑 —— 行与面板
        // 之间那段过渡区因此落在这一层的命中区里，指针斜着挪过去不会掉出去。
        // ⛔ 别改回 `left-[calc(100%+…)]` 那种真空隙：那正是渠道点不到的根因。
        <div
          style={{ top: panelTop }}
          onMouseEnter={cancelPanelClose}
          onMouseLeave={schedulePanelClose}
          className="absolute left-full z-50 pl-2"
        >
          <div
            ref={panelRef}
            role="listbox"
            aria-label={t('channelPanelLabel', { model: panelRow.label })}
            data-channel-panel
            onKeyDown={(event) => {
              // Esc 回到行 —— ⛔ 不让它冒到 Radix 那层把整个弹层也关了。
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              if (panelRowId) rowRefs.current.get(panelRowId)?.focus()
            }}
            className="w-model-channel-panel rounded-lg border border-border bg-popover p-1.5 shadow-md"
          >
            <div className="flex flex-col gap-0.5">
              {panelRow.channels.map((view) =>
                renderChannel(panelRow, view, 'panel'),
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  const setupDialog = quickSetup ? (
    <QuickSetupDialog
      open
      onOpenChange={(next) => {
        if (!next) setQuickSetup(null)
      }}
      modelId={quickSetup.option.modelId}
      // 标题读「设置 {渠道}」——这一步配的是**渠道的 key**，不是型号。
      modelLabel={quickSetup.channelLabel}
      labelDefault={quickSetup.labelDefault}
      adapterType={quickSetup.option.adapterType}
      optionId={quickSetup.option.optionId}
      onVerified={() => {
        // 验证通过 → 这条渠道就是该型号的选择（面板上那颗点随 healthMap 变绿）。
        memory.rememberChannel(quickSetup.modelKey, quickSetup.option.optionId)
        commit(quickSetup.option, quickSetup.modelKey)
        setQuickSetup(null)
      }}
    />
  ) : null

  if (inline)
    return (
      <>
        <div className={className}>{body}</div>
        {setupDialog}
      </>
    )

  const triggerStatus = ((): {
    label: string | null
    tone: 'default' | 'warning'
  } => {
    if (!selectedRow) return { label: null, tone: 'default' }
    if (!selectedRow.active) return { label: t('pickChannel'), tone: 'warning' }
    if (!selectedRow.active.hasKey)
      return { label: t('missingKey'), tone: 'warning' }
    return { label: selectedRow.active.price, tone: 'default' }
  })()

  return (
    <>
      <ResponsivePopover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setActiveRowId(null)
        }}
      >
        <ResponsivePopoverTrigger asChild>
          <ModelChip
            modelLabel={
              selectedRow?.name ?? triggerEmptyLabel ?? tCommon('selectModel')
            }
            variantLabel={selectedRow?.variant ?? null}
            statusLabel={triggerStatus.label}
            statusTone={triggerStatus.tone}
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
