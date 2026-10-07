'use client'

import { useTranslations } from 'next-intl'

import {
  getCapabilityChipValue,
  getRunCapabilityChips,
  isCapabilityChipVisible,
  isCapabilityChipSet,
  type CapabilityChip,
} from '@/lib/model-capability-chips'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { cn } from '@/lib/utils'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import type { AdvancedParams } from '@/types'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { SlidersHorizontal } from '@/components/icons'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolSurfaceMobileClass,
  studioToolSurfaceSizeClass,
  studioToolPopoverBaseClass,
  studioToolPopoverPaddingClass,
  studioToolPopoverWidthClass,
  useStudioChipClasses,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { CapabilitySelectControl } from '@/components/business/studio/CapabilitySelectControl'

/**
 * StudioModelCapabilityChips —— 能力驱动表单（D2 ④）的**专属区**。
 *
 * 通用区（模型触发器 · 规格 chip · 张数 · 提示词 · 参考轨）之下一条虚线，虚线
 * 以下是「专属 · <模型名>」小标 + 一行 chip。chip 名单**只从能力表派生**
 * （`getModelCapabilityChips`），⛔ 组件里没有任何模型名或 adapter 分支。
 *
 * 三态（画板逐格）：默认白底描边 / 选中黑底白字 / 不可用 muted 灰底。
 * ⚠ 没有专属能力的模型**整段不渲染** —— 画板上「专属 · 无」那一格已随批注撤下。
 *
 * 切模型时这一整组跟着换，不兼容的值静默回默认（批注 36，落在
 * `pruneIncompatibleCapabilityValues`，宿主是 `useImageModelOptions`）。
 *
 * 一轮多个模型时列的是**这一轮所有模型**专属能力的并集（`getRunCapabilityChips`），
 * ⛔ 不只看主模型；不是每个模型都认的那一项注明只对谁生效。
 */
interface StudioModelCapabilityChipsProps {
  disabled?: boolean
  /** 手机 composer 那一行放不下时横向滚动，不换行（换行会让 composer 高度跳）。 */
  scroll?: boolean
  /**
   * `section` = 参数栏 / 手机那一段（虚线 + 小标 + 一行 chip，缺省）。
   * `single` = 底部输入框工具行里的**一颗** chip（owner 2026-09-26）：chip 上写
   * 改过的那一项，点开一个弹层逐项调。
   * 手机输入条那一行也用它（owner 2026-10-03：放在规格旁边，⛔ 不收进「＋」）。
   */
  variant?: 'section' | 'single'
  /** `single` 那颗触发器的宿主外观（手机输入框卡里收成无边幽灵丸）。 */
  triggerClassName?: string
}

export function StudioModelCapabilityChips({
  disabled = false,
  scroll = false,
  variant = 'section',
  triggerClassName,
}: StudioModelCapabilityChipsProps) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { runModels } = useStudioRunModels()
  const t = useTranslations('StudioCapabilityChips')
  const tModels = useTranslations('Models')

  const chips = getRunCapabilityChips(runModels)
  if (chips.length === 0) return null

  const onParamsChange = (next: AdvancedParams) =>
    dispatch({ type: 'SET_ADVANCED_PARAMS', payload: next })
  const hasReferenceImage = imageUpload.referenceImages.length > 0
  const visibleChips = chips.filter((chip) =>
    isCapabilityChipVisible(chip, state.advancedParams, hasReferenceImage),
  )
  const modelLabels = (indexes: readonly number[]) =>
    [
      ...new Set(
        indexes.map((index) =>
          getTranslatedModelLabel(tModels, runModels[index].modelId),
        ),
      ),
    ].join(' · ')
  const sectionLabel = t('sectionLabel', {
    model: modelLabels(runModels.map((_, index) => index)),
  })
  /** 不是这一轮每个模型都认的那一项 —— 说清只对谁生效。 */
  const scopeNotes = new Map(
    visibleChips
      .filter((chip) => chip.modelIndexes.length < runModels.length)
      .map((chip) => [
        chip.capability,
        t('onlyFor', { models: modelLabels(chip.modelIndexes) }),
      ]),
  )

  if (variant === 'single') {
    if (visibleChips.length === 0) return null
    return (
      <CapabilitySingleChip
        chips={visibleChips}
        params={state.advancedParams}
        disabled={disabled}
        hasReferenceImage={hasReferenceImage}
        sectionLabel={sectionLabel}
        scopeNotes={scopeNotes}
        triggerClassName={triggerClassName}
        onParamsChange={onParamsChange}
      />
    )
  }

  return (
    <div
      className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3"
      // 助手改到专属那一格时整行闪一次（进度表 21）。
      data-assistant-field="capabilities"
    >
      <span className="text-2xs font-medium text-muted-foreground/70">
        {sectionLabel}
      </span>
      <div
        className={cn(
          'flex items-center gap-1.5',
          scroll
            ? 'studio-mobile-chip-row min-w-0 overflow-x-auto'
            : 'flex-wrap',
        )}
      >
        {visibleChips.map((chip) => (
          <CapabilityChipControl
            key={chip.capability}
            chip={chip}
            params={state.advancedParams}
            disabled={disabled}
            hasReferenceImage={hasReferenceImage}
            scopeNote={scopeNotes.get(chip.capability)}
            onParamsChange={onParamsChange}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 同一颗专属 chip，**不读工作台 context**（owner 2026-10-08：画布图片卡也要有）。
 * 值与写回由宿主给：画布把它存在卡的参数上。
 */
export function ModelCapabilitySingleChip({
  models,
  params,
  onParamsChange,
  hasReferenceImage,
  disabled = false,
  triggerClassName,
}: {
  models: readonly { adapterType: AI_ADAPTER_TYPES; modelId: string }[]
  params: AdvancedParams
  onParamsChange: (next: AdvancedParams) => void
  hasReferenceImage: boolean
  disabled?: boolean
  triggerClassName?: string
}) {
  const t = useTranslations('StudioCapabilityChips')
  const tModels = useTranslations('Models')
  const visibleChips = getRunCapabilityChips(models).filter((chip) =>
    isCapabilityChipVisible(chip, params, hasReferenceImage),
  )
  if (visibleChips.length === 0) return null
  const sectionLabel = t('sectionLabel', {
    model: [
      ...new Set(
        models.map((model) => getTranslatedModelLabel(tModels, model.modelId)),
      ),
    ].join(' · '),
  })
  return (
    <CapabilitySingleChip
      chips={visibleChips}
      params={params}
      disabled={disabled}
      hasReferenceImage={hasReferenceImage}
      sectionLabel={sectionLabel}
      scopeNotes={new Map()}
      triggerClassName={triggerClassName}
      onParamsChange={onParamsChange}
    />
  )
}

const chipBaseClass =
  'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none'
const chipIdleClass = 'border-border bg-background text-foreground'
const chipSetClass = 'border-foreground bg-foreground text-background'
const chipMutedClass = 'border-border bg-muted text-muted-foreground'

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string

/** chip 上「画质 · 高」后半截那个值；开关档没有值可写。 */
function capabilityValueLabel(
  chip: CapabilityChip,
  value: string | number | boolean,
  t: Translate,
  tAdvanced: Translate,
): string | null {
  if (chip.kind === 'select') {
    return tAdvanced(`${chip.capability}Option.${String(value)}`)
  }
  if (chip.kind === 'slider') {
    return chip.capability === 'referenceStrength'
      ? `${Math.round(Number(value) * 100)}%`
      : String(value)
  }
  if (chip.kind === 'text') {
    // 文本档不把整串塞进 chip —— 只报「填了多少字」，正文在弹层里读。
    return t('textFilled', { count: String(value).length })
  }
  return null
}

/**
 * 改过的那几项写成一句：第一项「名 值」，再多写「+N」；一项都没改返回 null。
 */
function capabilitySetSummary(
  setChips: readonly CapabilityChip[],
  params: AdvancedParams,
  t: Translate,
  tAdvanced: Translate,
): string | null {
  const first = setChips[0]
  if (!first) return null
  const label = t(`capability.${first.capability}`)
  const valueLabel = capabilityValueLabel(
    first,
    getCapabilityChipValue(first, params),
    t,
    tAdvanced,
  )
  const firstText = valueLabel ? `${label} ${valueLabel}` : label
  return `${firstText}${setChips.length > 1 ? ` +${setChips.length - 1}` : ''}`
}

/**
 * 一项专属能力的**控件本体**（分段 / 下拉 / 文本 / 滑条）—— 只画控件，名字与说明由
 * 外面那一行画（说明挂在名字的悬停上）。逐颗 chip 的弹层与底部输入框那颗 chip 的
 * 弹层**共用这一份**，⛔ 别各写一套。开关档不走这里（它就是一颗 Switch）。
 */
function CapabilityControlBody({
  chip,
  value,
  label,
  disabled,
  update,
}: {
  chip: CapabilityChip
  value: string | number | boolean
  label: string
  disabled: boolean
  update: (patch: Partial<AdvancedParams>) => void
}) {
  const tAdvanced = useTranslations('AdvancedSettings')
  if (chip.kind === 'select' && chip.options) {
    return (
      <CapabilitySelectControl
        chip={chip}
        value={String(value)}
        label={label}
        disabled={disabled}
        onChange={(next) =>
          update({ [chip.capability]: next } as AdvancedParams)
        }
      />
    )
  }
  if (chip.kind === 'text' && chip.maxLength) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Input
          value={String(value)}
          maxLength={chip.maxLength}
          disabled={disabled}
          aria-label={label}
          placeholder={tAdvanced(`${chip.capability}Placeholder`)}
          className="h-7 text-xs"
          onChange={(event) =>
            update({
              [chip.capability]: event.target.value,
            } as AdvancedParams)
          }
        />
        <span className="text-right font-mono text-2xs text-muted-foreground/70 tabular-nums">
          {String(value).length} / {chip.maxLength}
        </span>
      </div>
    )
  }
  if (chip.kind === 'slider' && chip.range) {
    const shown =
      chip.capability === 'referenceStrength'
        ? `${Math.round(Number(value) * 100)}%`
        : String(value)
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Slider
          min={chip.range.min}
          max={chip.range.max}
          step={chip.range.step}
          value={[Number(value)]}
          onValueChange={([next]) =>
            update({ [chip.capability]: next } as AdvancedParams)
          }
          disabled={disabled}
          aria-label={label}
          className="min-w-0 flex-1"
        />
        <span className="w-9 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {shown}
        </span>
      </div>
    )
  }
  return null
}

/**
 * 专属的**一行**（owner 2026-10-07「专属」A1）：名字在左（说明挂在悬停上），控件在右；
 * 开关档整行就是「名字 + Switch」。⛔ 不再把说明常驻成一段灰字 —— 弹层高度因此
 * 大约是原来的一半。
 */
function CapabilityRow({
  chip,
  params,
  disabled,
  hasReferenceImage,
  scopeNote,
  update,
}: {
  chip: CapabilityChip
  params: AdvancedParams
  disabled: boolean
  hasReferenceImage: boolean
  scopeNote?: string
  update: (patch: Partial<AdvancedParams>) => void
}) {
  const t = useTranslations('StudioCapabilityChips')
  const tAdvanced = useTranslations('AdvancedSettings')
  const label = t(`capability.${chip.capability}`)
  const value = getCapabilityChipValue(chip, params)
  const unavailable = chip.requiresReferenceImage && !hasReferenceImage
  const hint = tAdvanced(`${chip.capability}Hint`)

  return (
    <div
      data-testid="capability-row"
      data-capability={chip.capability}
      className="flex min-w-0 flex-col gap-0.5 py-1"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          title={hint}
          className="w-16 shrink-0 cursor-help text-xs leading-tight text-foreground"
        >
          {label}
        </span>
        <div className="flex min-w-0 flex-1 justify-end">
          {chip.kind === 'toggle' ? (
            <Switch
              checked={value === true}
              disabled={disabled || unavailable}
              aria-label={label}
              onCheckedChange={(checked) =>
                update({ [chip.capability]: checked } as AdvancedParams)
              }
            />
          ) : unavailable ? (
            <span className="min-w-0 flex-1 text-2xs text-muted-foreground">
              {t('needsReference')}
            </span>
          ) : (
            <div className="min-w-0 flex-1">
              <CapabilityControlBody
                chip={chip}
                value={value}
                label={label}
                disabled={disabled}
                update={update}
              />
            </div>
          )}
        </div>
      </div>
      {scopeNote ? (
        <span className="pl-19 text-2xs text-muted-foreground">
          {scopeNote}
        </span>
      ) : null}
    </div>
  )
}

/** 这一轮的专属能力逐项一行（单颗 chip 的弹层身体）。 */
function CapabilityControlList({
  chips,
  params,
  disabled,
  hasReferenceImage,
  sectionLabel,
  scopeNotes,
  onParamsChange,
}: {
  chips: CapabilityChip[]
  params: AdvancedParams
  disabled: boolean
  hasReferenceImage: boolean
  sectionLabel: string
  scopeNotes: ReadonlyMap<string, string>
  onParamsChange: (next: AdvancedParams) => void
}) {
  // ⚠ 整个对象带过去，只换一个键 —— 宿主那一侧是整体替换。
  const update = (patch: Partial<AdvancedParams>) =>
    onParamsChange({ ...params, ...patch })

  return (
    <div className="flex flex-col gap-1">
      <span className="pb-1 text-2xs text-muted-foreground">
        {sectionLabel}
      </span>
      {chips.map((chip) => (
        <CapabilityRow
          key={chip.capability}
          chip={chip}
          params={params}
          disabled={disabled}
          hasReferenceImage={hasReferenceImage}
          scopeNote={scopeNotes.get(chip.capability)}
          update={update}
        />
      ))}
    </div>
  )
}

/**
 * 底部输入框里的**一颗**专属 chip（owner 2026-09-26）。chip 上写第一项改过的值
 * （再多写「+N」），点开一个弹层，每项一行：开关就是开关，其余是控件本体。
 */
function CapabilitySingleChip({
  chips,
  params,
  disabled,
  hasReferenceImage,
  sectionLabel,
  scopeNotes,
  triggerClassName,
  onParamsChange,
}: {
  chips: CapabilityChip[]
  params: AdvancedParams
  disabled: boolean
  hasReferenceImage: boolean
  sectionLabel: string
  scopeNotes: ReadonlyMap<string, string>
  triggerClassName?: string
  onParamsChange: (next: AdvancedParams) => void
}) {
  const t = useTranslations('StudioCapabilityChips')
  const tAdvanced = useTranslations('AdvancedSettings')
  const chipClasses = useStudioChipClasses()
  const popoverMotion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'end',
    sideOffset: 8,
  })

  const setChips = chips.filter((chip) => isCapabilityChipSet(chip, params))
  const setText = capabilitySetSummary(setChips, params, t, tAdvanced)
  const chipText = setText
    ? `${t('singleChipLabel')} · ${setText}`
    : t('singleChipLabel')

  return (
    <StudioToolSurface>
      <StudioToolSurfaceTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={sectionLabel}
          data-assistant-field="capabilities"
          className={cn(
            chipClasses.trigger,
            setChips.length > 0 && chipClasses.set,
            'data-[state=open]:border-foreground data-[state=open]:ring-3 data-[state=open]:ring-muted',
            triggerClassName,
          )}
        >
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
          {chipText}
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        style={popoverMotion.style}
        label={sectionLabel}
        align="end"
        side="top"
        sideOffset={8}
        className={cn(
          studioToolPopoverBaseClass,
          studioToolPopoverWidthClass.action,
          studioToolPopoverPaddingClass.small,
          popoverMotion.className,
        )}
        mobileClassName={studioToolSurfaceMobileClass.action}
      >
        <CapabilityControlList
          chips={chips}
          params={params}
          disabled={disabled}
          hasReferenceImage={hasReferenceImage}
          sectionLabel={sectionLabel}
          scopeNotes={scopeNotes}
          onParamsChange={onParamsChange}
        />
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}

function CapabilityChipControl({
  chip,
  params,
  disabled,
  hasReferenceImage,
  scopeNote,
  onParamsChange,
}: {
  chip: CapabilityChip
  params: AdvancedParams
  disabled: boolean
  hasReferenceImage: boolean
  /** 「只对谁生效」—— 一行 chip 里没地方写字，挂在 title 上。 */
  scopeNote?: string
  onParamsChange: (next: AdvancedParams) => void
}) {
  const t = useTranslations('StudioCapabilityChips')
  const tAdvanced = useTranslations('AdvancedSettings')

  const value = getCapabilityChipValue(chip, params)
  const isSet = isCapabilityChipSet(chip, params)
  const unavailable = chip.requiresReferenceImage && !hasReferenceImage

  // ⚠ 整个对象带过去，只换一个键 —— 宿主那一侧是整体替换。
  const update = (patch: Partial<AdvancedParams>) =>
    onParamsChange({ ...params, ...patch })

  const label = t(`capability.${chip.capability}`)
  const valueLabel = capabilityValueLabel(chip, value, t, tAdvanced)
  const chipText = isSet && valueLabel ? `${label} · ${valueLabel}` : label

  const className = cn(
    chipBaseClass,
    unavailable ? chipMutedClass : isSet ? chipSetClass : chipIdleClass,
  )

  // 开关型不开弹层 —— 一颗 chip 上只有一个二值答案，点一下就是答案本身。
  if (chip.kind === 'toggle') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={value === true}
        disabled={disabled || unavailable}
        onClick={() => update({ [chip.capability]: !value } as AdvancedParams)}
        className={className}
        title={[tAdvanced(`${chip.capability}Hint`), scopeNote]
          .filter(Boolean)
          .join(' · ')}
      >
        {label}
      </button>
    )
  }

  return (
    <StudioToolSurface>
      <StudioToolSurfaceTrigger asChild>
        <button
          type="button"
          disabled={disabled || unavailable}
          aria-label={label}
          title={unavailable ? t('needsReference') : scopeNote}
          className={className}
        >
          {chipText}
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        label={label}
        align="start"
        side="top"
        sideOffset={8}
        className={cn(
          studioToolPopoverBaseClass,
          studioToolSurfaceSizeClass.small,
        )}
        mobileClassName={studioToolSurfaceMobileClass.small}
      >
        <div className="flex flex-col gap-2">
          <span
            title={tAdvanced(`${chip.capability}Hint`)}
            className="cursor-help text-2xs text-muted-foreground"
          >
            {label}
          </span>
          <CapabilityControlBody
            chip={chip}
            value={value}
            label={label}
            disabled={disabled}
            update={update}
          />
        </div>
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}
