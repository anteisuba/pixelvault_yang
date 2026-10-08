'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
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
import { CANVAS_SHELL_SAFE_LEFT_DEFAULT_PX } from '@/constants/canvas-shell'
import { MODEL_PICKER_DEFAULT_SCOPE } from '@/constants/model-picker'
import {
  CHIP_POPOVER,
  DURATION,
  DURATION_MS,
  EASE_IN,
  SPRING,
  staggerDelay,
} from '@/constants/motion'
import { getModelById } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { useModelPickerMemory } from '@/hooks/use-model-picker-memory'
import {
  isMissingKeyModelOption,
  isRunnableModelOption,
} from '@/hooks/use-split-model-options'
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

import {
  useStudioChipDensity,
  useStudioChipPopoverMotion,
} from '../primitives/tool-surface'

import { ModelChip } from './ModelChip'
import { QuickSetupDialog } from '../setup/QuickSetupDialog'

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
 *    状态点（绿 = 已配 key，黄 = 缺 key，灰 = key 名单还没回来）· 渠道名 ·
 *    该渠道单价。选中渠道用 `bg-muted` 底表示，**没有对勾**。
 * 3. **没有「自动」渠道**（`resolveModelChannel`）。多渠道型号没点过渠道 = 空态：
 *    价格位写「—」，触发器写「先选渠道」。单渠道型号面板只有一行且自动选中。
 *
 * 缺 key 的渠道被点 → 弹层与面板一起关闭，跳转 `/settings/keys` 配置 API。
 */

/** 一条渠道在面板上的样子。 */
interface ChannelView {
  channel: PickerChannel
  /** 已格式化的单价（`$0.213 / s`）；目录里查不到价时为 null。 */
  price: string | null
  /** 用户自己配了这条渠道的 key —— 绿点。 */
  hasKey: boolean
  /**
   * **确定**缺 key —— 黄点、「缺 key」、点了去配 key。⚠ key 名单还没回来时
   * `hasKey` 也是 false，但那是「不知道」不是「缺」：两格都不成立 = 灰点、
   * 不写警示、点了照常选（名单回来后真缺的那条再显示「缺 key」）。
   */
  missingKey: boolean
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

function preferredCanvasChannel(
  channels: readonly ChannelView[],
): ChannelView | null {
  if (channels.length === 0) return null
  const runnable = channels.filter((view) => view.hasKey)
  if (runnable.length === 0) return channels[0] ?? null
  const ownKey = runnable.filter(
    (view) =>
      view.channel.option.sourceType === 'saved' ||
      Boolean(view.channel.option.providerKeyId),
  )
  const pool = ownKey.length > 0 ? ownKey : runnable
  return pool.reduce((best, view) => {
    const candidatePrice = getModelUnitPriceByStringId(
      view.channel.option.modelId,
    )
    const bestPrice = getModelUnitPriceByStringId(best.channel.option.modelId)
    if (!candidatePrice) return best
    if (!bestPrice) return view
    return candidatePrice.unit === bestPrice.unit &&
      candidatePrice.amount < bestPrice.amount
      ? view
      : best
  })
}

export interface ModelPickerPopoverProps {
  options: StudioModelOption[]
  /** 当前选中的 `optionId`；多选时传 null（选中状态由 `selectedOptionIds` 说）。 */
  value: string | null
  onChange: (option: StudioModelOption) => void
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
  /**
   * 触发器只写型号（「Diffusion V5 Full」），不写系列名 —— 窄地方（手机标签台那一行）
   * 两段都截成「No… Diffusio…」不如只留能区分的那一段；弹层里照旧按系列分组。
   */
  triggerVariantOnly?: boolean
  contentClassName?: string
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
  /**
   * 搜索框里有字时，列表底下多出来的那一行 —— **本名单之外的去处**
   * （D10 ④ 两台跳转：在自然语言台搜到标签模型时给一行「带你过去」）。
   *
   * 宿主自己判「这句话有没有命中别处」并给内容，⛔ 组件不认识任何业务口径。
   * 返回 null = 没有可去的地方，这一行不渲染。点了之后由宿主负责收弹层 ——
   * 所以回调里带上 `close`。
   */
  renderSearchFallback?: (query: string, close: () => void) => ReactNode
  /** 分组维度，默认按厂商系列；音频栏传 `kind`（语音 / 配乐 / 音效）。 */
  groupBy?: ModelPickerGroupBy
  /**
   * 「未选渠道」闸门的宿主标识。同一 scope 下同时挂着多个选择器时必须传（画布上每
   * 张卡都是 `image`，各有各的生成键）——不传就退化成按 scope 共用一份，那会让一张
   * 卡没选渠道挡住整块画布。生成侧用同一对 `(scope, gateId)` 调 `useModelChannelGate`。
   */
  gateId?: string
  /** 画布节点专用：在屏幕安全区内避开当前卡和提示词栏。 */
  canvasNodeId?: string
  /** 画布安全区左界（`canvasShellSafeLeftPx`）。 */
  canvasSafeLeftPx?: number
}

type CanvasRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type CanvasSafeArea = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export function placeCanvasModelPopover({
  trigger,
  bar,
  card,
  safe,
  width,
  height,
}: {
  readonly trigger: CanvasRect
  readonly bar: CanvasRect
  readonly card: CanvasRect
  readonly safe: CanvasSafeArea
  readonly width: number
  readonly height: number
}): { x: number; y: number; transformOrigin: string } {
  const cardBottom = card.y + card.height
  const candidates = [
    {
      x: trigger.x,
      y: bar.y + bar.height + 8,
      origin: `${trigger.width / 2}px 0`,
    },
    { x: bar.x + bar.width + 8, y: bar.y, origin: `0 ${trigger.y - bar.y}px` },
    {
      x: bar.x - 8 - width,
      y: bar.y,
      origin: `${width}px ${trigger.y - bar.y}px`,
    },
    {
      x: bar.x + bar.width + 8,
      y: Math.max(bar.y, cardBottom + 8),
      origin: '0 0',
    },
    {
      x: bar.x - 8 - width,
      y: Math.max(bar.y, cardBottom + 8),
      origin: `${width}px 0`,
    },
    {
      x: trigger.x,
      y: trigger.y - 8 - height,
      origin: `${trigger.width / 2}px ${height}px`,
    },
  ]
  const clamp = (candidate: (typeof candidates)[number]) => ({
    ...candidate,
    x: Math.min(
      Math.max(candidate.x, safe.left),
      Math.max(safe.left, safe.right - width),
    ),
    y: Math.min(
      Math.max(candidate.y, safe.top),
      Math.max(safe.top, safe.bottom - height),
    ),
  })
  const overlaps = (point: { x: number; y: number }, rect: CanvasRect) =>
    point.x < rect.x + rect.width &&
    point.x + width > rect.x &&
    point.y < rect.y + rect.height &&
    point.y + height > rect.y
  const placed = candidates.map(clamp)
  const chosen =
    placed.find((point) => !overlaps(point, card) && !overlaps(point, bar)) ??
    placed[0]!
  return { x: chosen.x, y: chosen.y, transformOrigin: chosen.origin }
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
  const marker = `${seriesLabel} `
  const prefix = label.indexOf(marker)
  if (prefix >= 0 && label.length > prefix + marker.length) {
    return {
      name: seriesLabel,
      variant: label.slice(prefix + marker.length),
    }
  }
  return { name: label, variant: null }
}

export function ModelPickerPopover({
  options,
  value,
  onChange,
  memoryScope = MODEL_PICKER_DEFAULT_SCOPE,
  labelForOption,
  triggerEmptyLabel,
  searchPlaceholder,
  emptySearchText,
  disabled,
  className,
  triggerVariantOnly = false,
  contentClassName,
  side = 'top',
  align = 'end',
  inline = false,
  selectedOptionIds,
  onToggleOption,
  onManageChannels,
  renderSearchFallback,
  groupBy = MODEL_PICKER_GROUP_BY.series,
  gateId,
  canvasNodeId,
  canvasSafeLeftPx = CANVAS_SHELL_SAFE_LEFT_DEFAULT_PX,
}: ModelPickerPopoverProps) {
  const multi = Boolean(selectedOptionIds && onToggleOption)
  const [open, setOpen] = useState(false)
  // 底部输入框那一行（描边外观）里弹层从 chip 放大出来；其余宿主不在那层外观里，照旧。
  // `sideOffset` 4 = 弹层原语的缺省（这颗没另传）。
  const popoverMotion = useStudioChipPopoverMotion({
    side,
    align,
    sideOffset: 4,
  })
  const [search, setSearch] = useState('')
  /** 桌面：渠道面板跟着走的那一行；手机：原地展开的那一行（按**行身份**）。 */
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  /** 渠道面板相对弹层顶部的偏移（px）——「与当前行顶部对齐」。 */
  const [panelTop, setPanelTop] = useState(0)

  const t = useTranslations('ModelPicker')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  /**
   * 缺 key 的那一条：**就地**开通用配置弹窗（`QuickSetupDialog`），配好就是选中它
   * （owner 2026-10-07：缺 key 只在选模型时出现，一律就地弹窗，⛔ 跳 /settings/keys）。
   * ⚠ 开着才挂 —— 同 `StudioOperatorModelChip`。
   */
  const [keySetup, setKeySetup] = useState<{
    option: StudioModelOption
    modelKey: string
    title: string
    labelDefault: string
    /** 从渠道面板点进来的：配好后记住这条渠道。 */
    channelId?: string
  } | null>(null)

  const { healthMap, hasLoaded: keysLoaded } = useApiKeysContext()
  const memory = useModelPickerMemory(memoryScope, gateId)
  // 触屏紧凑视口走底部 Sheet 分支（`ResponsivePopover` 内部同一条判据）：没有
  // hover，也没有右侧摆面板的地方，渠道列表只能在行里原地展开。
  const sheet = useIsMobile() && isTouchPrimary()
  /**
   * 画布那一档（`StudioChipDensityProvider`）：弹层 280、行矮一截、字小一号，渠道面板
   * 同样小一号 —— 画布卡下那条栏比工作台输入框小得多（owner 2026-09-29）。⚠ 渠道仍是
   * 右侧独立浮层（D2 Q1 定的），⛔ 不因为「小」就塞回行尾展开。
   */
  const compact = useStudioChipDensity() === 'compact' && !sheet
  const canvasCompact = compact && Boolean(canvasNodeId) && !inline
  const reduceMotion = useReducedMotion()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null)
  const [canvasPosition, setCanvasPosition] = useState<{
    x: number
    y: number
    transformOrigin: string
  } | null>(null)

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
  const selectionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
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
  useEffect(
    () => () => {
      if (selectionCloseTimerRef.current !== null)
        clearTimeout(selectionCloseTimerRef.current)
    },
    [],
  )

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
        missingKey: isMissingKeyModelOption(option, keysLoaded),
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
          : canvasCompact
            ? preferredCanvasChannel(channels)
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
  }, [options, healthMap, keysLoaded, memory, labelOf, value, canvasCompact])

  const query = search.trim().toLowerCase()
  const visibleRows = query
    ? rows.filter((row) => row.searchText.includes(query))
    : rows

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
  const recentRows =
    canvasCompact && !query
      ? memory.recentModelKeys
          .slice(0, 3)
          .map((key) => rows.find((row) => row.modelKey === key))
          .filter((row): row is ModelRow => Boolean(row))
      : []

  useLayoutEffect(() => {
    if (!canvasCompact || !open) return
    const trigger = triggerRef.current
    const popup = canvasSurfaceRef.current
    const bar = trigger?.closest<HTMLElement>('[data-node-chrome="prompt-bar"]')
    if (!trigger || !popup || !bar) return
    const measure = () => {
      const stage = trigger.closest<HTMLElement>('.react-flow')
      const stageRect = stage?.getBoundingClientRect()
      const node = Array.from(
        document.querySelectorAll<HTMLElement>('.react-flow__node'),
      ).find((element) => element.dataset.id === canvasNodeId)
      const triggerRect = trigger.getBoundingClientRect()
      const barRect = bar.getBoundingClientRect()
      const cardRect = node?.getBoundingClientRect()
      const rect = (value: DOMRect): CanvasRect => ({
        x: value.left,
        y: value.top,
        width: value.width,
        height: value.height,
      })
      setCanvasPosition(
        placeCanvasModelPopover({
          trigger: rect(triggerRect),
          bar: rect(barRect),
          card: cardRect ? rect(cardRect) : { x: 0, y: 0, width: 0, height: 0 },
          safe: {
            left: (stageRect?.left ?? 0) + canvasSafeLeftPx,
            top: (stageRect?.top ?? 0) + 64,
            right: (stageRect?.right ?? window.innerWidth) - 16,
            bottom: (stageRect?.bottom ?? window.innerHeight) - 76,
          },
          width: popup.offsetWidth || 300,
          height: popup.offsetHeight || 392,
        }),
      )
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [
    canvasCompact,
    open,
    canvasNodeId,
    canvasSafeLeftPx,
    search,
    visibleRows.length,
    recentRows.length,
  ])

  useEffect(() => {
    if (!canvasCompact || !open) return
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (triggerRef.current?.contains(event.target)) return
      if (canvasSurfaceRef.current?.contains(event.target)) return
      setOpen(false)
      setActiveRowId(null)
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setActiveRowId(null)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [canvasCompact, open])

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

  const renderedRows = new Map<string, ModelRow>()
  for (const group of groups)
    for (const row of group.rows) renderedRows.set(`group:${row.modelKey}`, row)
  for (const row of recentRows) renderedRows.set(`recent:${row.modelKey}`, row)

  const selectedRowId = selectedRow
    ? (Array.from(renderedRows.entries()).find(
        ([, row]) => row.modelKey === selectedRow.modelKey,
      )?.[0] ?? null)
    : null

  /** 这一行当前该摆哪份渠道面板：hover / 键盘走到的那行，否则选中行。 */
  const activeRow = activeRowId ? (renderedRows.get(activeRowId) ?? null) : null
  const panelRow = canvasCompact
    ? activeRow
    : (activeRow ?? selectedRow ?? null)
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
    // 名单没回来时不知道缺不缺 —— 照常选，⛔ 别把有 key 的人送去配置页。
    if (isMissingKeyModelOption(option, keysLoaded)) {
      setOpen(false)
      setActiveRowId(null)
      setKeySetup({
        option,
        modelKey,
        title: labelOf(option),
        labelDefault: labelOf(option),
      })
      return
    }
    select(option, modelKey)
  }

  /** 真正选中（含配完 key 回来的那一下）。 */
  const select = (option: StudioModelOption, modelKey: string) => {
    memory.setPendingModel(null)
    memory.rememberRecent(modelKey)
    if (multi) {
      onToggleOption?.(option)
      return
    }
    onChange(option)

    if (canvasCompact) {
      if (selectionCloseTimerRef.current !== null)
        clearTimeout(selectionCloseTimerRef.current)
      selectionCloseTimerRef.current = setTimeout(() => {
        selectionCloseTimerRef.current = null
        setOpen(false)
        setActiveRowId(null)
      }, 160)
    } else {
      setOpen(false)
    }
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
    if (view.missingKey) {
      setOpen(false)
      setActiveRowId(null)
      // 标题写渠道（这一步配的是这条渠道的 key），命名框预填「型号 · 渠道」。
      setKeySetup({
        option: view.channel.option,
        modelKey: row.modelKey,
        title: view.channel.label,
        labelDefault: `${row.label} · ${view.channel.label}`,
        channelId: view.channel.channelId,
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
            : compact
              ? 'px-2 py-1 text-xs hover:bg-accent'
              : 'px-2 py-1.5 text-2sm hover:bg-accent',
          picked && 'bg-muted',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full',
            view.hasKey
              ? 'bg-status-applied'
              : view.missingKey
                ? 'bg-status-warning'
                : 'bg-muted-foreground/40',
          )}
        />
        <span className="min-w-0 flex-1 truncate">{view.channel.label}</span>
        {view.price || canvasCompact ? (
          <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
            {view.price ?? t('usageBilled')}
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
          className="shrink-0 text-2xs text-muted-foreground/50"
        >
          {t('channelUnset')}
        </span>
      )
    }
    if (row.active.missingKey) {
      // 缺 key 写成行尾一颗小标签（owner 2026-10-07 选择器定稿：一眼看出点了会弹配置）。
      return (
        <span
          data-picker-missing-key
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 text-2xs text-muted-foreground"
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full border border-muted-foreground"
          />
          {t('missingKey')}
        </span>
      )
    }
    if (!row.active.price) return null
    return (
      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
        {row.active.price}
      </span>
    )
  }

  /**
   * 一行。
   *
   * ⚠ `underSeriesHeading` = **这一行头顶那个分组头写的就是它的厂商**
   * （owner 2026-09-20 真机第 2 条：「有一个 NovelAI 的表示了，下面应该是版本号，
   * 不需要再重复」）。判据从数据推导（`group.key === row.seriesKey`），
   * ⛔ 不按字符串前缀裁 —— 前缀只说明标签长什么样，说明不了这一行摆在谁下面。
   */
  /** 这一次渲染里第几行（打开时的错开出场用；每次渲染从 0 数）。 */
  const rowOrder = { n: 0 }
  const renderRow = (
    row: ModelRow,
    underSeriesHeading = false,
    recent = false,
  ) => {
    const selected = isRowSelected(row)
    /**
     * ⚠ 拆不出型号（`variant === null`，厂商只有一个模型）时**照旧写厂商名** ——
     * 省掉它这一行就一个字都没有了。
     */
    const omitSeries = underSeriesHeading && row.variant !== null
    const primary = omitSeries ? row.variant : row.name
    const secondary = omitSeries ? null : row.variant
    const rowId = `${recent ? 'recent' : 'group'}:${row.modelKey}`
    const expanded = sheet && activeRowId === rowId
    if (canvasCompact) {
      const line = row.active
        ? row.active.missingKey
          ? t('missingKeyConfigure')
          : [
              row.active.channel.label,
              row.active.price ?? t('usageBilled'),
            ].join(' · ')
        : t('pickChannel')
      return (
        <div
          key={rowId}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 py-1.25 hover:bg-surface-fill"
        >
          <button
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={row.label}
            data-model-key={row.modelKey}
            data-picker-canvas-row
            data-row-id={rowId}
            data-row-active={activeRowId === rowId || undefined}
            data-missing-key={row.active?.missingKey ? 'true' : undefined}
            ref={(element) => {
              if (element) rowRefs.current.set(rowId, element)
              else rowRefs.current.delete(rowId)
            }}
            onFocus={() => focusRow(rowId)}
            onClick={() => {
              if (row.active?.missingKey) {
                handleSelectChannel(row, row.active)
                return
              }
              handleSelectRow(row, rowId)
            }}
            className="min-w-0 flex-1 text-left focus-visible:outline-none"
          >
            <span className="block min-w-0">
              <span
                className={cn(
                  'block truncate text-2sm leading-4.5',
                  row.active?.missingKey
                    ? 'text-muted-foreground/75'
                    : 'text-foreground',
                )}
              >
                {recent ? row.label : (primary ?? row.label)}
              </span>
              <span className="block truncate text-2xs leading-3.75 text-muted-foreground">
                {line}
              </span>
            </span>
          </button>
          {row.channels.length > 1 ? (
            <button
              type="button"
              data-picker-channel-trigger
              aria-label={t('channelPanelLabel', { model: row.label })}
              onClick={() => focusRow(rowId)}
              className="shrink-0 text-2xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {selected ? (
                <Check aria-hidden className="size-4 text-foreground" />
              ) : (
                <>{t('channelsCount', { count: row.channels.length })} ›</>
              )}
            </button>
          ) : selected ? (
            <Check aria-hidden className="size-4 shrink-0 text-foreground" />
          ) : null}
        </div>
      )
    }
    // 弹层打开时一行行由糊变清地进来（选择器原型「打开选择器」），先后错开。
    const order = rowOrder.n++
    return (
      <div
        key={rowId}
        style={{
          animationDelay: `${Math.round(staggerDelay(order) * 1000 * 0.6)}ms`,
        }}
        className={cn(
          'picker-row-in rounded-lg transition-colors duration-base ease-standard motion-reduce:transition-none',
          sheet && expanded && 'bg-muted',
          selected && !expanded && 'bg-muted',
        )}
      >
        <button
          type="button"
          role="option"
          aria-selected={selected}
          data-model-key={row.modelKey}
          data-row-id={rowId}
          /* 视觉上省了厂商名，读屏仍要听得到「这是哪一家的哪一版」——
             分组头是一个 `<p>`，它与这颗按钮没有任何关联。 */
          {...(omitSeries ? { 'aria-label': row.label } : {})}
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
            sheet
              ? 'min-h-11 px-3 text-md'
              : compact
                ? 'px-2 py-1.5 text-xs'
                : 'px-2.5 py-2 text-2sm',
            // hover 行**只 1px 描边，不换底**（owner D2 Q1 亲手定）——换底会与
            // 选中行的 `bg-muted` 撞成同一个样子。
            !sheet && 'hover:outline hover:outline-1 hover:outline-border',
          )}
        >
          <span className="min-w-0 flex-1 truncate font-medium">{primary}</span>
          {secondary ? (
            <span
              className={cn(
                'min-w-0 shrink truncate text-muted-foreground',
                sheet ? 'text-md' : compact ? 'text-xs' : 'text-2sm',
              )}
            >
              {secondary}
            </span>
          ) : null}
          {renderRowPrice(row)}
          {/* 勾常驻、只换状态：勾上时从小顶出来，换系列时旧勾糊掉（选择器原型 1A）。 */}
          <Check
            aria-hidden
            data-picker-check={selected ? 'on' : 'off'}
            className={cn(
              'size-4 shrink-0 text-foreground transition-[opacity,scale,filter] duration-base ease-standard motion-reduce:transition-none',
              selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0 blur-xs',
            )}
          />
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

  const empty = visibleRows.length === 0

  const body = (
    <div
      ref={surfaceRef}
      className={cn(
        'relative',
        canvasCompact && 'flex min-h-0 flex-1 flex-col',
      )}
      onMouseLeave={sheet ? undefined : schedulePanelClose}
      onMouseEnter={sheet ? undefined : cancelPanelClose}
    >
      <div
        className={cn(canvasCompact ? 'flex min-h-0 flex-1 flex-col' : 'p-1.5')}
      >
        <label
          className={cn(
            'flex items-center gap-2 rounded-lg text-muted-foreground',
            canvasCompact
              ? 'mx-2 mt-2 mb-1 h-8.5 shrink-0 bg-surface-fill px-2.5 text-2sm'
              : compact
                ? 'bg-muted px-2 py-1 text-xs'
                : 'bg-muted px-2.5 py-1.5 text-2sm',
          )}
        >
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
          className={cn(
            canvasCompact
              ? 'min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5'
              : 'mt-1 max-h-80 overflow-y-auto',
          )}
        >
          {empty ? (
            <p className="px-2.5 py-6 text-center text-2sm text-muted-foreground">
              {emptySearchText ?? tCommon('noModelsFound')}
            </p>
          ) : null}
          {/* ── 搜索结果**平铺**（owner 2026-09-20 真机第 2 条）─────────────
              搜出来的几行常常横跨好几家，分组头在这一档只是把三五条结果切成
              三五段。没有分组头，行就得自己说清是哪一家 —— 所以这一支传
              `underSeriesHeading = false`，厂商名照写。 */}
          {recentRows.length > 0 ? (
            <div data-picker-recent>
              <p className="px-2.5 pt-2.5 pb-1 text-2xs tracking-wide text-muted-foreground">
                {t('recent')}
              </p>
              {recentRows.map((row) => renderRow(row, false, true))}
            </div>
          ) : null}
          {query
            ? visibleRows.map((row) => renderRow(row))
            : groups.map((group) => (
                <div key={group.key}>
                  <p
                    data-picker-group={group.key}
                    className={cn(
                      canvasCompact
                        ? 'px-2.5 pt-2.5 pb-1 text-2xs tracking-wide text-muted-foreground'
                        : 'px-2.5 pb-1 pt-2 text-3xs uppercase tracking-nav text-muted-foreground',
                    )}
                  >
                    {group.label}
                  </p>
                  {group.rows.map((row) =>
                    renderRow(
                      row,
                      /* ⚠ 只有按厂商分的那一档头顶写着厂商名；音频那一档
                         （`kind`）的分组头是「语音 / 配乐 / 音效」，⛔ 不省。 */
                      groupBy === MODEL_PICKER_GROUP_BY.series &&
                        group.key === row.seriesKey,
                    ),
                  )}
                </div>
              ))}
          {/* 本名单之外的去处 —— 只在搜索时出现，⛔ 不占常驻名单的位置。 */}
          {query && renderSearchFallback
            ? renderSearchFallback(query, () => setOpen(false))
            : null}
        </div>

        {onManageChannels ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onManageChannels()
            }}
            className={cn(
              'flex w-full items-center gap-2 border-t border-border text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              canvasCompact
                ? 'h-10 shrink-0 px-4'
                : 'mt-1 px-2.5 pb-1 pt-2 transition-colors duration-fast ease-standard motion-reduce:transition-none',
            )}
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
            key={panelRowId ?? undefined}
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
            className={cn(
              // 换到另一行时面板内容糊一下换（选择器原型「渠道面板」）。
              'picker-row-in rounded-lg border border-border bg-popover p-1.5 shadow-md',
              compact ? 'w-48' : 'w-model-channel-panel',
            )}
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

  if (inline) return <div className={className}>{body}</div>

  const triggerStatus = ((): {
    label: string | null
    tone: 'default' | 'warning'
  } => {
    if (!selectedRow) return { label: null, tone: 'default' }
    if (!selectedRow.active) return { label: t('pickChannel'), tone: 'warning' }
    if (selectedRow.active.missingKey)
      return { label: t('missingKey'), tone: 'warning' }
    return { label: selectedRow.active.price, tone: 'default' }
  })()

  const keySetupDialog = keySetup ? (
    <QuickSetupDialog
      open
      onOpenChange={(next) => {
        if (!next) setKeySetup(null)
      }}
      modelId={keySetup.option.modelId}
      modelLabel={keySetup.title}
      labelDefault={keySetup.labelDefault}
      adapterType={keySetup.option.adapterType}
      optionId={keySetup.option.optionId}
      // 选中走宿主自己的 onChange / onToggleOption（同系列多选、画布都对），
      // ⛔ 让弹窗直接改工作台的主模型。
      selectStudioModel={false}
      onVerified={() => {
        if (keySetup.channelId)
          memory.rememberChannel(keySetup.modelKey, keySetup.channelId)
        select(keySetup.option, keySetup.modelKey)
      }}
    />
  ) : null

  if (canvasCompact) {
    const label =
      selectedRow?.name ?? triggerEmptyLabel ?? tCommon('selectModel')
    return (
      <>
        <ModelChip
          ref={triggerRef}
          compact
          modelLabel={label}
          variantLabel={selectedRow?.variant ?? null}
          active={open}
          disabled={disabled}
          className={className}
          aria-label={[label, selectedRow?.variant].filter(Boolean).join(' ')}
          onClick={() => {
            if (!open) setCanvasPosition(null)
            setOpen(!open)
            setActiveRowId(null)
          }}
        />
        {typeof document !== 'undefined'
          ? createPortal(
              <AnimatePresence>
                {open ? (
                  <motion.div
                    ref={canvasSurfaceRef}
                    role="dialog"
                    aria-label={triggerEmptyLabel ?? tCommon('selectModel')}
                    data-canvas-model-popover
                    style={{
                      position: 'fixed',
                      left: canvasPosition?.x ?? -9999,
                      top: canvasPosition?.y ?? -9999,
                      transformOrigin: canvasPosition?.transformOrigin,
                      visibility: canvasPosition ? 'visible' : 'hidden',
                    }}
                    initial={
                      reduceMotion
                        ? false
                        : {
                            scale: CHIP_POPOVER.fromScale,
                            opacity: 0,
                            filter: `blur(${CHIP_POPOVER.blurPx}px)`,
                          }
                    }
                    animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                    exit={
                      reduceMotion
                        ? { opacity: 0, transition: { duration: 0 } }
                        : {
                            scale: CHIP_POPOVER.fromScale,
                            opacity: 0,
                            filter: `blur(${CHIP_POPOVER.blurPx}px)`,
                            transition: {
                              duration: DURATION.base,
                              ease: EASE_IN,
                            },
                          }
                    }
                    transition={reduceMotion ? { duration: 0 } : SPRING.slot}
                    className={cn(
                      'z-50 flex max-h-98 w-75 flex-col rounded-node-bar bg-popover ring-1 ring-border shadow-node-menu',
                      contentClassName,
                    )}
                  >
                    {body}
                  </motion.div>
                ) : null}
              </AnimatePresence>,
              document.body,
            )
          : null}
        {keySetupDialog}
      </>
    )
  }

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
              (triggerVariantOnly ? selectedRow?.variant : null) ??
              selectedRow?.name ??
              triggerEmptyLabel ??
              tCommon('selectModel')
            }
            variantLabel={
              triggerVariantOnly ? null : (selectedRow?.variant ?? null)
            }
            // 只写型号的窄 chip 上不再挤价格 —— 只留「缺 key」这一类警示。
            statusLabel={
              triggerVariantOnly && triggerStatus.tone !== 'warning'
                ? null
                : triggerStatus.label
            }
            statusTone={triggerStatus.tone}
            active={open}
            disabled={disabled}
            className={cn(
              // 画布那一档：28 高 · 12 号字；开着与工作台同一副描边 + 浅环；按下 0.96。
              compact &&
                'h-7 gap-1.5 pr-2 pl-2.5 text-xs transition-all active:scale-96 data-[active=true]:border-foreground data-[active=true]:ring-3 data-[active=true]:ring-muted',
              className,
            )}
          />
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          style={popoverMotion.style}
          side={side}
          align={align}
          label={triggerEmptyLabel ?? tCommon('selectModel')}
          className={cn(
            contentClassName ?? (compact ? 'w-70' : 'w-model-picker'),
            'p-0',
            popoverMotion.className,
          )}
          mobileClassName="px-0"
        >
          {body}
        </ResponsivePopoverContent>
      </ResponsivePopover>
      {keySetupDialog}
    </>
  )
}
