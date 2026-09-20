'use client'

import { useTranslations } from 'next-intl'

import {
  getCapabilityChipValue,
  getModelCapabilityChips,
  isCapabilityChipVisible,
  isCapabilityChipSet,
  type CapabilityChip,
} from '@/lib/model-capability-chips'
import { cn } from '@/lib/utils'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import type { AdvancedParams } from '@/types'
import { Input } from '@/components/ui/input'
import { OptionGroup } from '@/components/ui/option-group'
import { ParamSlider } from '@/components/ui/param-slider'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolSurfaceMobileClass,
  studioToolSurfaceSizeClass,
  studioToolPopoverBaseClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
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
 */
interface StudioModelCapabilityChipsProps {
  disabled?: boolean
  /** 手机 composer 那一行放不下时横向滚动，不换行（换行会让 composer 高度跳）。 */
  scroll?: boolean
}

export function StudioModelCapabilityChips({
  disabled = false,
  scroll = false,
}: StudioModelCapabilityChipsProps) {
  const { state } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { selectedModel } = useImageModelOptions()
  const t = useTranslations('StudioCapabilityChips')
  const tModels = useTranslations('Models')

  const chips = getModelCapabilityChips(
    selectedModel?.adapterType,
    selectedModel?.modelId,
  )
  if (!selectedModel || chips.length === 0) return null

  const hasReferenceImage = imageUpload.referenceImages.length > 0

  return (
    <div
      className="flex flex-col gap-1.5 border-t border-dashed border-border pt-3"
      // 助手改到专属那一格时整行闪一次（进度表 21）。
      data-assistant-field="capabilities"
    >
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('sectionLabel', {
          model: getTranslatedModelLabel(tModels, selectedModel.modelId),
        })}
      </span>
      <div
        className={cn(
          'flex items-center gap-1.5',
          scroll
            ? 'studio-mobile-chip-row min-w-0 overflow-x-auto'
            : 'flex-wrap',
        )}
      >
        {chips
          .filter((chip) =>
            isCapabilityChipVisible(
              chip,
              state.advancedParams,
              hasReferenceImage,
            ),
          )
          .map((chip) => (
            <CapabilityChipControl
              key={chip.capability}
              chip={chip}
              params={state.advancedParams}
              disabled={disabled}
              hasReferenceImage={hasReferenceImage}
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

function CapabilityChipControl({
  chip,
  params,
  disabled,
  hasReferenceImage,
}: {
  chip: CapabilityChip
  params: AdvancedParams
  disabled: boolean
  hasReferenceImage: boolean
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
  const valueLabel =
    chip.kind === 'select'
      ? tAdvanced(`${chip.capability}Option.${String(value)}`)
      : chip.kind === 'slider'
        ? chip.capability === 'referenceStrength'
          ? `${Math.round(Number(value) * 100)}%`
          : String(value)
        : chip.kind === 'text'
          ? // 文本档不把整串塞进 chip —— 只报「填了多少字」，正文在弹层里读。
            t('textFilled', { count: String(value).length })
          : null
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
        title={tAdvanced(`${chip.capability}Hint`)}
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
          title={unavailable ? t('needsReference') : undefined}
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
        {chip.kind === 'select' && chip.options ? (
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
        ) : null}
        {chip.kind === 'text' && chip.maxLength ? (
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
        ) : null}
        {chip.kind === 'slider' && chip.range ? (
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
        ) : null}
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}
