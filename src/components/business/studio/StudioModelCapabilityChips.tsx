'use client'

import { useTranslations } from 'next-intl'

import {
  getCapabilityChipValue,
  getRunCapabilityChips,
  isCapabilityChipVisible,
  isCapabilityChipSet,
  type CapabilityChip,
} from '@/lib/model-capability-chips'
import { cn } from '@/lib/utils'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import type { AdvancedParams } from '@/types'
import { Input } from '@/components/ui/input'
import { OptionGroup } from '@/components/ui/option-group'
import { ParamSlider } from '@/components/ui/param-slider'
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
} from '@/components/business/studio-shared/primitives/tool-surface'
import { useLiquidPopover } from '@/components/business/studio-shared/primitives/liquid-popover'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'

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
   */
  variant?: 'section' | 'single'
}

export function StudioModelCapabilityChips({
  disabled = false,
  scroll = false,
  variant = 'section',
}: StudioModelCapabilityChipsProps) {
  const { state } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { runModels } = useStudioRunModels()
  const t = useTranslations('StudioCapabilityChips')
  const tModels = useTranslations('Models')

  const chips = getRunCapabilityChips(runModels)
  if (chips.length === 0) return null

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
          />
        ))}
      </div>
    </div>
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
 * 一项专属能力的控件本体（选择 / 文本 / 滑条）—— 逐颗 chip 的弹层与底部输入框
 * 那颗 chip 的弹层**共用这一份**，⛔ 别各写一套。开关档不走这里（它没有弹层）。
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
      <div className="flex flex-col gap-2">
        <span className="text-2xs text-muted-foreground">
          {tAdvanced(`${chip.capability}Hint`)}
        </span>
        <OptionGroup
          variant="neutral"
          options={chip.options.map((option) => ({
            value: option,
            label: tAdvanced(`${chip.capability}Option.${option}`),
          }))}
          value={String(value)}
          onChange={(next) =>
            update({ [chip.capability]: next } as AdvancedParams)
          }
          disabled={disabled}
        />
      </div>
    )
  }
  if (chip.kind === 'text' && chip.maxLength) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-2xs text-muted-foreground">
          {tAdvanced(`${chip.capability}Hint`)}
        </span>
        <Input
          value={String(value)}
          maxLength={chip.maxLength}
          disabled={disabled}
          aria-label={label}
          placeholder={tAdvanced(`${chip.capability}Placeholder`)}
          onChange={(event) =>
            update({
              [chip.capability]: event.target.value,
            } as AdvancedParams)
          }
        />
        <span className="text-2xs text-muted-foreground/70">
          {String(value).length} / {chip.maxLength}
        </span>
      </div>
    )
  }
  if (chip.kind === 'slider' && chip.range) {
    return (
      <ParamSlider
        label={label}
        hint={tAdvanced(`${chip.capability}Hint`)}
        value={Number(value)}
        onChange={(next) =>
          update({ [chip.capability]: next } as AdvancedParams)
        }
        min={chip.range.min}
        max={chip.range.max}
        step={chip.range.step}
        disabled={disabled}
        formatValue={
          chip.capability === 'referenceStrength'
            ? (v) => `${Math.round(v * 100)}%`
            : undefined
        }
      />
    )
  }
  return null
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
}: {
  chips: CapabilityChip[]
  params: AdvancedParams
  disabled: boolean
  hasReferenceImage: boolean
  sectionLabel: string
  scopeNotes: ReadonlyMap<string, string>
}) {
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioCapabilityChips')
  const tAdvanced = useTranslations('AdvancedSettings')
  const chipClasses = useStudioChipClasses()
  const {
    attach: liquidRef,
    className: liquidClassName,
    style: liquidStyle,
  } = useLiquidPopover(chipClasses.look === 'outline')

  const update = (patch: Partial<AdvancedParams>) =>
    dispatch({
      // ⚠ 整个对象带过去，只换一个键 —— `SET_ADVANCED_PARAMS` 是整体替换。
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...params, ...patch },
    })

  const setChips = chips.filter((chip) => isCapabilityChipSet(chip, params))
  const first = setChips[0]
  const firstText = first
    ? (() => {
        const label = t(`capability.${first.capability}`)
        const valueLabel = capabilityValueLabel(
          first,
          getCapabilityChipValue(first, params),
          t,
          tAdvanced,
        )
        return valueLabel ? `${label} ${valueLabel}` : label
      })()
    : null
  const chipText = firstText
    ? `${t('singleChipLabel')} · ${firstText}${setChips.length > 1 ? ` +${setChips.length - 1}` : ''}`
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
          )}
        >
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
          {chipText}
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        ref={liquidRef}
        style={liquidStyle}
        label={sectionLabel}
        align="end"
        side="top"
        sideOffset={8}
        className={cn(
          studioToolPopoverBaseClass,
          studioToolPopoverWidthClass.action,
          studioToolPopoverPaddingClass.small,
          liquidClassName,
        )}
        mobileClassName={studioToolSurfaceMobileClass.action}
      >
        <div className="flex flex-col gap-4">
          <span className="text-xs font-medium text-muted-foreground">
            {sectionLabel}
          </span>
          {chips.map((chip) => {
            const label = t(`capability.${chip.capability}`)
            const value = getCapabilityChipValue(chip, params)
            const unavailable =
              chip.requiresReferenceImage && !hasReferenceImage
            const scopeNote = scopeNotes.get(chip.capability)
            const note = scopeNote ? (
              <span className="text-2xs text-muted-foreground">
                {scopeNote}
              </span>
            ) : null
            if (chip.kind === 'toggle') {
              return (
                <div key={chip.capability} className="flex flex-col gap-1">
                  <label
                    className="flex items-center justify-between gap-3 text-sm"
                    title={tAdvanced(`${chip.capability}Hint`)}
                  >
                    {label}
                    <Switch
                      checked={value === true}
                      disabled={disabled || unavailable}
                      onCheckedChange={(checked) =>
                        update({
                          [chip.capability]: checked,
                        } as AdvancedParams)
                      }
                    />
                  </label>
                  {note}
                </div>
              )
            }
            return (
              <div key={chip.capability} className="flex flex-col gap-1.5">
                {chip.kind === 'slider' ? null : (
                  <span className="text-2xs font-medium text-foreground">
                    {label}
                  </span>
                )}
                {unavailable ? (
                  <span className="text-2xs text-muted-foreground">
                    {t('needsReference')}
                  </span>
                ) : (
                  <CapabilityControlBody
                    chip={chip}
                    value={value}
                    label={label}
                    disabled={disabled}
                    update={update}
                  />
                )}
                {note}
              </div>
            )
          })}
        </div>
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
}: {
  chip: CapabilityChip
  params: AdvancedParams
  disabled: boolean
  hasReferenceImage: boolean
  /** 「只对谁生效」—— 一行 chip 里没地方写字，挂在 title 上。 */
  scopeNote?: string
}) {
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioCapabilityChips')
  const tAdvanced = useTranslations('AdvancedSettings')

  const value = getCapabilityChipValue(chip, params)
  const isSet = isCapabilityChipSet(chip, params)
  const unavailable = chip.requiresReferenceImage && !hasReferenceImage

  const update = (patch: Partial<AdvancedParams>) =>
    dispatch({
      // ⚠ 整个对象带过去，只换一个键 —— `SET_ADVANCED_PARAMS` 是整体替换。
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...params, ...patch },
    })

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
        <CapabilityControlBody
          chip={chip}
          value={value}
          label={label}
          disabled={disabled}
          update={update}
        />
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}
