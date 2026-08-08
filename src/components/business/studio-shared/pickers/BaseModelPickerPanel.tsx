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
import { getModelFamily, getModelVariant } from '@/constants/models'
import { getProviderLabel } from '@/constants/providers'
import { motionTransition } from '@/constants/motion'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  isRunnableModelOption,
  splitModelOptions,
  useSplitModelOptions,
} from '@/hooks/use-split-model-options'
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

/** 三层钻取：系列 → 型号 → 渠道。 */
type PickerView = 'families' | 'variants' | 'channels'

interface VariantGroup {
  variantKey: string
  label: string
  opts: StudioModelOption[]
}

interface FamilyGroup {
  familyKey: string
  label: string
  opts: StudioModelOption[]
  variants: VariantGroup[]
}

/**
 * 第一层「系列」的分组键。
 *
 * 目录里的模型全都有 `MODEL_FAMILIES`（2026-08-08 实测 57/57 覆盖）。**没有** family
 * 的是不在目录里的 id —— LLM 路由（`routeToStudioOption` 拿 `route.modelId`）、
 * EDIT_MODELS 那类 `fal-ai/flux-pro/edit`。它们退回 `adapterType`，而那正是本组件
 * 改造前的第一层，所以这些调用方的分层行为原样不变。
 */
function familyKeyOf(option: StudioModelOption): string {
  const family = getModelFamily(option.modelId)
  return family ? `family:${family}` : `provider:${option.adapterType}`
}

function familyLabelOf(option: StudioModelOption): string {
  return (
    getModelFamily(option.modelId) ?? getProviderLabel(option.providerConfig)
  )
}

/**
 * 第二层「型号」的分组键。
 *
 * `MODEL_VARIANTS` 目前只登记了视频。**没登记的每个模型自成一型号** → 该系列下
 * 型号数 = 模型数、每个型号只有一条渠道 → 第三层被跳过 → 图片/音频/3D/LLM 自动
 * 退化成两层，与改造前一致。
 *
 * ⚠ 别为「视频三层、其余两层」写分支：**层数是数据推出来的，不是模态判出来的**。
 * 哪天给图片补了 `MODEL_VARIANTS`，它自己就变三层。
 */
function variantKeyOf(option: StudioModelOption): string {
  return getModelVariant(option.modelId) ?? option.modelId
}

/** 结尾的括注（半角/全角都算），如 `Seedance 2.5（火山方舟）` 的那一段。 */
const TRAILING_QUALIFIER = /[（(][^（()）]*[)）]\s*$/

/**
 * 一族里每个型号行显示什么名字 —— **必须整族一起算**，单个型号自己决定不了。
 *
 * 型号底下的多个条目差别只有**渠道**和**端点**（`Seedance 2.0` /
 * `Seedance 2.0（参考端点）` / `Seedance 2.0（火山方舟）`），这两样分别是第三层和
 * 节点模式的职责，不该在第二层露出（cleanup §8.2：「用户只需要看见 Seedance 2.0」）。
 * 所以取**最短的那条标签**再削掉结尾括注。
 *
 * ⚠ **削与不削的判据是「削完在本族里还唯一吗」，不是「这个型号有几个条目」。**
 * 早先按条目数判，两头都错：
 *
 * - 图片的 `Seedream 5.0 Pro（火山方舟）` 是单条目，削完与 fal 那条同名 → 一族里
 *   两行一模一样的字。**不能削。**
 * - 视频节点按模式过滤之后，`Seedance 2.5（参考，火山方舟）` 也变成单条目（该模式
 *   下 2.5 只剩参考端点这一条），按条目数判就**不削**，于是「参考」这个词漏到了
 *   用户面前 —— 正是这套设计要消掉的那个概念。削完是 `Seedance 2.5`，本族唯一。
 *
 * 唯一性判据同时覆盖这两种，且不需要知道括注里装的是渠道还是端点。
 *
 * 不做成一张写死的标签表，是因为标签得跟着语言走 —— `klingV3Pro` 在 zh 下是
 * 「快手可灵 3.0 Pro」，写死英文就把中文用户的标签降级了。
 */
export function deriveVariantLabels(
  variants: { variantKey: string; labels: string[] }[],
): Map<string, string> {
  const base = new Map<string, string>()
  const stripped = new Map<string, string>()
  const strippedUses = new Map<string, number>()

  for (const { variantKey, labels } of variants) {
    const shortest = labels.length
      ? labels.reduce((a, b) => (b.length < a.length ? b : a))
      : ''
    const bare = shortest.replace(TRAILING_QUALIFIER, '').trim() || shortest
    base.set(variantKey, shortest)
    stripped.set(variantKey, bare)
    strippedUses.set(bare, (strippedUses.get(bare) ?? 0) + 1)
  }

  return new Map(
    variants.map(({ variantKey }) => {
      const bare = stripped.get(variantKey) ?? ''
      // 削完撞名就退回原标签 —— 宁可长一点，也不能让一族里出现两行同名。
      const unique = (strippedUses.get(bare) ?? 0) === 1
      return [variantKey, unique ? bare : (base.get(variantKey) ?? bare)]
    }),
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
  popoverSide?: 'top' | 'bottom'
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
  /** Optional secondary metadata shown on provider and model rows. */
  detailForOption?: (option: StudioModelOption) => string | undefined
}

/**
 * 三层钻取的模型选择器：**系列 → 型号 → 渠道**（设计见
 * `docs/plans/canvas-video-domain-cleanup-2026-08-08.md` §8.2 / §9.1）。
 *
 * - 第 1 层 系列：`MODEL_FAMILIES`（Seedance / Kling / FLUX …）
 * - 第 2 层 型号：`MODEL_VARIANTS`（2.5 / 2.0 / 2.0 Fast）
 * - 第 3 层 渠道：`adapterType`（火山 / fal / BytePlus），**职责是比价**
 *
 * 三条贯穿规则：
 *
 * 1. **搜索绕过全部分层** —— 平铺过滤，不做三层的搜索。
 * 2. **跳过要连锁** —— 每层各自判断「只有一个候选就跳过」，可能一路跳到底：
 *    单系列单型号单渠道时，打开就直接落在那一条上。整组塌成一条的行**就是**那个
 *    条目（点它即选中 / 缺 key 则进 QuickSetup），不再往下钻一层空壳。
 * 3. **返回回到「最近一个没被跳过的层」** —— 不是常量，见 `backTarget`。
 *
 * ⚠ 改造前第一层是渠道（`adapterType`），那让同一系列裂在 fal / 火山两个标题下。
 * 目录外的 id（LLM 路由、EDIT_MODELS）没有 family，退回按 `adapterType` 分组 ——
 * 即改造前的行为，见 `familyKeyOf`。
 *
 * ⚠ 端点（`SEEDANCE_20` vs `SEEDANCE_20_REFERENCE`）**不该在任何一层露出**，它由
 * 节点上的模式决定。但模式过滤是切片 4 的事：在那之前，调用方传进来的仍是全部
 * 端点，于是第三层会看到同一渠道的两条。这是过渡态，不是本组件的判断错误 ——
 * 组件按模式挑一条会把另一个端点变成用户永远够不着的模型。
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
  popoverSide = 'top',
  className,
  disabled,
  savedOptionLabelMode = 'model',
  labelForOption,
  detailForOption,
}: BaseModelPickerPanelProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<PickerView>('families')
  const [activeFamily, setActiveFamily] = useState<string | null>(null)
  const [activeVariant, setActiveVariant] = useState<string | null>(null)
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

  // Group options into 系列 → 型号. Insertion order follows the incoming option
  // order, which is already preference-ranked.
  const familyGroups = useMemo<FamilyGroup[]>(() => {
    const byFamily = new Map<string, StudioModelOption[]>()
    for (const opt of displayOptions) {
      const key = familyKeyOf(opt)
      const list = byFamily.get(key) ?? []
      list.push(opt)
      byFamily.set(key, list)
    }
    return Array.from(byFamily, ([familyKey, opts]) => {
      const byVariant = new Map<string, StudioModelOption[]>()
      for (const opt of opts) {
        const key = variantKeyOf(opt)
        const list = byVariant.get(key) ?? []
        list.push(opt)
        byVariant.set(key, list)
      }
      const raw = Array.from(byVariant, ([variantKey, variantOpts]) => ({
        variantKey,
        labels: variantOpts.map(resolveModelLabel),
        opts: variantOpts,
      }))
      // 整族一起算标签：削不削取决于「削完在本族里还唯一吗」，见 deriveVariantLabels。
      const labels = deriveVariantLabels(raw)
      return {
        familyKey,
        label: familyLabelOf(opts[0]),
        opts,
        variants: raw.map(({ variantKey, opts: variantOpts }) => ({
          variantKey,
          label: labels.get(variantKey) ?? variantKey,
          opts: variantOpts,
        })),
      }
    })
    // resolveModelLabel closes over tModels/labelForOption — stable enough for
    // this grouping, same as the visibleOptions filter below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOptions])

  const activeFamilyGroup = useMemo(
    () => familyGroups.find((g) => g.familyKey === activeFamily) ?? null,
    [familyGroups, activeFamily],
  )
  const activeVariantGroup = useMemo(
    () =>
      activeFamilyGroup?.variants.find((v) => v.variantKey === activeVariant) ??
      null,
    [activeFamilyGroup, activeVariant],
  )

  // Which layer an open lands on. "只有一个候选就跳过" has to CHAIN: one family
  // carries you to its 型号 list, one family with one 型号 carries you all the
  // way to its 渠道 list. Zero families falls through to the empty state.
  const entryPath = useMemo(() => {
    if (familyGroups.length !== 1) {
      return { view: 'families' as const, family: null, variant: null }
    }
    const family = familyGroups[0]
    if (family.variants.length !== 1) {
      return {
        view: 'variants' as const,
        family: family.familyKey,
        variant: null,
      }
    }
    return {
      view: 'channels' as const,
      family: family.familyKey,
      variant: family.variants[0].variantKey,
    }
  }, [familyGroups])

  // Reset the drill state ONLY on the closed→open transition. Guarding with
  // a ref (instead of plain `open` deps) is essential: callers often pass a
  // freshly-built `options` array on every render, which would otherwise make
  // this effect re-run mid-interaction and snap the view back to step 1 — the
  // bug where clicking a provider "exits" instead of drilling in. With three
  // layers that bug would bite harder, so the guard stays exactly as-is.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    if (wasOpenRef.current) return
    wasOpenRef.current = true
    setSearch('')
    setView(entryPath.view)
    setActiveFamily(entryPath.family)
    setActiveVariant(entryPath.variant)
  }, [open, entryPath])

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
          detailForOption?.(opt),
        ]
          .filter((v): v is string => Boolean(v))
          .join(' ')
          .toLowerCase()
        return hay.includes(searchLower)
      })
    }
    // Only the deepest layer lists concrete options; 系列/型号 rows come off
    // familyGroups instead.
    if (view === 'channels') return activeVariantGroup?.opts ?? []
    return []
    // labelForOption/detailForOption/tModels are stable enough for this filter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOptions, searching, searchLower, view, activeVariantGroup])

  const { saved, platform, locked } = useSplitModelOptions(visibleOptions)

  const isEmpty = searching
    ? visibleOptions.length === 0
    : view === 'families'
      ? familyGroups.length === 0
      : view === 'variants'
        ? (activeFamilyGroup?.variants.length ?? 0) === 0
        : visibleOptions.length === 0

  // Step 2 used to hide the needs-key models of a provider that already had a
  // usable route ("configuring happens at the provider step"). That silently
  // decoupled the list from the provider row's count — the row advertised N and
  // the drill-in rendered fewer, with no way to reach the rest. It also went
  // further than Hard Rule #8, which says a missing key must route through
  // QuickSetupDialog rather than take the option away. Every model the count
  // includes is now rendered; locked ones just carry the key affordance.

  /**
   * 返回按钮回到「最近一个**没被跳过**的层」—— 常量不行：从渠道层退回时，型号层
   * 可能压根没出现过（单型号系列），那就得一路退到系列层；两层都被跳过时（单系列
   * 单型号）没有可退之处，按钮不渲染。
   *
   * `label` 描述的是**当前所在的上下文**（与改造前一致：models 视图上的返回键写着
   * 当前 provider 的名字），让人知道这一屏在比的是什么。
   */
  const backTarget = useMemo<{ view: PickerView; label: string } | null>(() => {
    const multiFamily = familyGroups.length > 1
    if (view === 'channels') {
      if ((activeFamilyGroup?.variants.length ?? 0) > 1) {
        return { view: 'variants', label: activeVariantGroup?.label ?? '' }
      }
      if (multiFamily) {
        return { view: 'families', label: activeVariantGroup?.label ?? '' }
      }
      return null
    }
    if (view === 'variants' && multiFamily) {
      return { view: 'families', label: activeFamilyGroup?.label ?? '' }
    }
    return null
  }, [view, familyGroups, activeFamilyGroup, activeVariantGroup])

  const handleBack = () => {
    if (!backTarget) return
    if (backTarget.view === 'families') {
      setActiveFamily(null)
      setActiveVariant(null)
    } else {
      setActiveVariant(null)
    }
    setView(backTarget.view)
  }

  const handleSelectOption = (option: StudioModelOption) => {
    onChange(option)
    setOpen(false)
  }
  const handleSelectLocked = (option: StudioModelOption) => {
    if (onRequestSetup) onRequestSetup(option)
    setOpen(false)
  }
  /** 型号：多渠道就钻进第三层，单渠道直接落到那一条（§8.2）。 */
  const handleSelectVariant = (family: FamilyGroup, variant: VariantGroup) => {
    if (variant.opts.length === 1) {
      const only = variant.opts[0]
      if (isRunnableModelOption(only)) handleSelectOption(only)
      else handleSelectLocked(only)
      return
    }
    setActiveFamily(family.familyKey)
    setActiveVariant(variant.variantKey)
    setView('channels')
  }
  /** 系列：跳过要连锁 —— 单型号的系列直接交给 handleSelectVariant 继续跳。 */
  const handleSelectFamily = (family: FamilyGroup) => {
    if (family.variants.length === 1) {
      handleSelectVariant(family, family.variants[0])
      return
    }
    setActiveFamily(family.familyKey)
    setActiveVariant(null)
    setView('variants')
  }

  /**
   * 一行代表一个分组（系列或型号）。行上的计数写的是**这一行钻进去会渲染几行**
   * ——不是数底层条目：把 4 条 Seedance 2.0（两渠道×两端点）报成「4 个模型」，
   * 正是这次改造要消掉的重复。⚠ 因为跳过要连锁，「钻进去渲染几行」不等于「下一层
   * 有几项」：单型号的系列会直接跳到渠道层，那时它该报渠道数（真机实测抓到的：
   * MiniMax 原本写「1 个模型」，点进去是 4 行）。
   */
  const renderDrillRow = ({
    rowKey,
    label,
    countText,
    opts,
    onSelect,
  }: {
    rowKey: string
    label: string
    countText: string
    opts: StudioModelOption[]
    onSelect: () => void
  }) => {
    const detail = detailForOption?.(opts[0])
    // An explicit key row is the best evidence; provider-level coverage counts
    // too — the adapter has a key, it just isn't bound to any model listed here.
    const savedOpt =
      opts.find((o) => o.sourceType === 'saved') ??
      opts.find((o) => o.providerKeyId)
    const platformOpt = opts.find((o) => o.sourceType !== 'saved' && o.freeTier)

    // Every group drills in — even fully unconfigured ones, which list their
    // models as "needs key" and route to setup on click. Keeping the row
    // enterable matches Hard Rule #8 (missing key routes to QuickSetupDialog,
    // it never takes the option away).
    return (
      <CommandItem
        key={rowKey}
        value={`${rowKey} ${label}`}
        onSelect={onSelect}
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
            {countText}
            {detail ? ` · ${detail}` : ''}
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

  /**
   * 叶子行 —— 点了就是选中它。除了第三层，**塌成一条的分组行也走这里**：一个分组
   * 只剩一个条目时，那行就该长得像个可选项（有对勾、有健康点、没有 chevron），
   * 而不是骗人再钻一层。`labelOverride` 让型号行顶着干净的型号名，把渠道留在副行。
   */
  const renderAvailableModelOption = (
    option: StudioModelOption,
    labelOverride?: string,
  ) => {
    const isSelected = option.optionId === checkedOptionId
    const indicatorKeyId = option.keyId ?? option.providerKeyId
    const optionLabel = labelOverride ?? resolveLabel(option)
    const optionModelLabel = resolveModelLabel(option)
    const providerLabel = getProviderLabel(option.providerConfig)
    const capabilityDetail = detailForOption?.(option)
    const routeMeta = option.keyLabel
      ? savedOptionLabelMode === 'model'
        ? `${option.keyLabel} · ${providerLabel}`
        : `${optionModelLabel} · ${providerLabel}`
      : option.freeTier && option.sourceType === 'workspace'
        ? `${providerLabel} · ${tSetup('platformQuota')}`
        : providerLabel
    const optionMeta = capabilityDetail
      ? `${routeMeta} · ${capabilityDetail}`
      : routeMeta
    const searchValue = [
      option.optionId,
      optionLabel,
      optionModelLabel,
      option.keyLabel,
      providerLabel,
      option.maskedKey,
      capabilityDetail,
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

  const renderLockedOption = (
    option: StudioModelOption,
    labelOverride?: string,
  ) => {
    const optionModelLabel = labelOverride ?? resolveModelLabel(option)
    const providerLabel = getProviderLabel(option.providerConfig)
    const capabilityDetail = detailForOption?.(option)
    const searchValue = [
      option.optionId,
      optionModelLabel,
      resolveModelLabel(option),
      providerLabel,
      capabilityDetail,
    ]
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
            {capabilityDetail ? ` · ${capabilityDetail}` : ''}
          </span>
        </span>
      </CommandItem>
    )
  }

  const renderFamilyRow = (family: FamilyGroup) => {
    // 整族只剩一个条目时不留空壳：这行**就是**那个模型。第一层没有上下文可依，
    // 所以显示模型自己的完整名字（「GPT Image 2」而不是系列名「GPT Image」）。
    if (family.opts.length === 1) {
      const only = family.opts[0]
      return isRunnableModelOption(only)
        ? renderAvailableModelOption(only)
        : renderLockedOption(only)
    }
    // 单型号的系列会连锁跳过型号层 → 这一行钻进去看到的是渠道，计数就得报渠道。
    const soleVariant = family.variants.length === 1 ? family.variants[0] : null
    return renderDrillRow({
      rowKey: family.familyKey,
      label: family.label,
      countText: soleVariant
        ? tCommon('channelCount', { count: soleVariant.opts.length })
        : tCommon('modelCount', { count: family.variants.length }),
      opts: family.opts,
      onSelect: () => handleSelectFamily(family),
    })
  }

  const renderVariantRow = (family: FamilyGroup, variant: VariantGroup) => {
    // 单渠道型号同理塌成一条。这里系列已由返回键交代过，所以顶着**型号名**，
    // 渠道退到副行（`Seedance 2.5` / 副行「火山方舟」，而不是名字里再括一次）。
    if (variant.opts.length === 1) {
      const only = variant.opts[0]
      return isRunnableModelOption(only)
        ? renderAvailableModelOption(only, variant.label)
        : renderLockedOption(only, variant.label)
    }
    return renderDrillRow({
      rowKey: `${family.familyKey}::${variant.variantKey}`,
      label: variant.label,
      countText: tCommon('channelCount', { count: variant.opts.length }),
      opts: variant.opts,
      onSelect: () => handleSelectVariant(family, variant),
    })
  }

  const triggerHealthIndicator = selectedOption?.keyId ? (
    <ApiKeyHealthDot status={healthMap[selectedOption.keyId]} />
  ) : selectedOption?.freeTier ? (
    <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
  ) : null

  // Shared between the flat search results and the drilled-in 渠道 view — both
  // render the same saved/platform/locked groups, only the underlying
  // visibleOptions differ.
  const modelGroups = (
    <>
      {saved.length > 0 && (
        <CommandGroup heading={tSetup('configuredKeys')}>
          {saved.map((o) => renderAvailableModelOption(o))}
        </CommandGroup>
      )}
      {platform.length > 0 && (
        <CommandGroup heading={tSetup('platformQuota')}>
          {platform.map((o) => renderAvailableModelOption(o))}
        </CommandGroup>
      )}
      {locked.length > 0 && (
        <CommandGroup heading={tSetup('needsKey')}>
          {locked.map((o) => renderLockedOption(o))}
        </CommandGroup>
      )}
    </>
  )

  // 型号层沿用同一套三桶分法（`splitModelOptions`），只是按**分组**判桶：一个型号
  // 只要有一条渠道能跑，它就不该落进「需要 API key」。改造前单 provider 会直接落到
  // 模型层，这三个标题正是那一屏的分组 —— 退化成两层时它们必须还在。
  const variantRows = (() => {
    const family = activeFamilyGroup
    if (!family) return null
    const buckets: Record<'saved' | 'platform' | 'locked', VariantGroup[]> = {
      saved: [],
      platform: [],
      locked: [],
    }
    for (const variant of family.variants) {
      const split = splitModelOptions(variant.opts)
      buckets[
        split.saved.length
          ? 'saved'
          : split.platform.length
            ? 'platform'
            : 'locked'
      ].push(variant)
    }
    return (
      <>
        {buckets.saved.length > 0 && (
          <CommandGroup heading={tSetup('configuredKeys')}>
            {buckets.saved.map((v) => renderVariantRow(family, v))}
          </CommandGroup>
        )}
        {buckets.platform.length > 0 && (
          <CommandGroup heading={tSetup('platformQuota')}>
            {buckets.platform.map((v) => renderVariantRow(family, v))}
          </CommandGroup>
        )}
        {buckets.locked.length > 0 && (
          <CommandGroup heading={tSetup('needsKey')}>
            {buckets.locked.map((v) => renderVariantRow(family, v))}
          </CommandGroup>
        )}
      </>
    )
  })()

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
        side={popoverSide}
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
        className={cn(
          'studio-scrollbar max-h-[min(24rem,calc(var(--radix-popover-content-available-height)-0.5rem))] w-96 max-w-[calc(100vw-2rem)] touch-pan-y overflow-y-auto overscroll-y-contain rounded-2xl border-border/70 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]',
          popoverSide === 'top'
            ? 'origin-bottom data-[side=top]:slide-in-from-bottom-2'
            : 'origin-top data-[side=bottom]:slide-in-from-top-2',
        )}
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
          {!searching && backTarget && (
            <button
              type="button"
              onClick={handleBack}
              className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
            >
              <ArrowLeft className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{backTarget.label}</span>
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
              // three-step, so search stays outside the slide animation.
              modelGroups
            ) : (
              // Three-step drill: 系列 ⇄ 型号 ⇄ 渠道 cross-fade in place while the
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
                    key={`${view}-${activeFamily ?? 'none'}-${activeVariant ?? 'none'}`}
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
                    {view === 'families' ? (
                      <CommandGroup>
                        {familyGroups.map(renderFamilyRow)}
                      </CommandGroup>
                    ) : view === 'variants' ? (
                      variantRows
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
