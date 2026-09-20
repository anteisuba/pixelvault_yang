'use client'

import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { ParamSlider } from '@/components/ui/param-slider'
import { Switch } from '@/components/ui/switch'
import { useStudioForm } from '@/contexts/studio-context'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getCapabilityChipValue } from '@/lib/model-capability-chips'
import type { TagWorkbenchControl } from '@/lib/tag-workbench-controls'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'

interface StudioTagCapabilityControlProps {
  control: TagWorkbenchControl
  disabled?: boolean
  /** 一行的紧凑排布（右列卡片内）还是带标题的块（编辑器主区）。 */
  hideLabel?: boolean
}

/**
 * 一条从能力表派生出来的控件 —— 编辑器主区（UC 预设 · `Text:`）与右列
 * （质量标签 · 采样器 · 步数 …）**用的是同一颗**（D10 ② 「同一份派生层，
 * 两台两种排列」）。
 *
 * 多选交集态（D10 ② Q3）：只有一部分选中模型支持的那一档**灰掉并标
 * 「只对 X 生效」，但仍然可改** —— 出图时按各模型能力裁剪 payload。
 * ⛔ 不禁用、⛔ 不隐藏：隐藏了用户根本不知道这个模型有这档能力。
 */
export function StudioTagCapabilityControl({
  control,
  disabled,
  hideLabel,
}: StudioTagCapabilityControlProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioCapabilityChips')
  const tTags = useTranslations('StudioTags')
  const tAdvanced = useTranslations('AdvancedSettings')
  const tModels = useTranslations('Models')

  const { chip, shared, supportedBy } = control
  const value = getCapabilityChipValue(chip, state.advancedParams)
  const label = t(`capability.${chip.capability}`)

  const update = (patch: Partial<AdvancedParams>) =>
    dispatch({
      // ⚠ 整个对象带过去，只换一个键 —— `SET_ADVANCED_PARAMS` 是整体替换。
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, ...patch },
    })

  const onlyForNote = shared
    ? null
    : tTags('onlyFor', {
        models: supportedBy
          .map((modelId) => getTranslatedModelLabel(tModels, modelId))
          .join(' · '),
      })

  return (
    <div
      className={cn('flex flex-col gap-1.5', !shared && 'opacity-60')}
      data-assistant-field="capabilities"
    >
      {hideLabel ? null : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xs font-medium">{label}</span>
          {onlyForNote ? (
            <span className="truncate text-3xs text-muted-foreground">
              {onlyForNote}
            </span>
          ) : null}
        </div>
      )}

      {chip.kind === 'select' && chip.options ? (
        <div className="flex flex-wrap gap-1">
          {chip.options.map((option) => {
            const selected = String(value) === option
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() =>
                  update({ [chip.capability]: option } as AdvancedParams)
                }
                className={cn(
                  'rounded-full border px-2.5 py-1 text-2xs transition-[background-color,border-color] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
                  selected
                    ? 'border-foreground bg-background font-medium'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent',
                )}
              >
                {tAdvanced(`${chip.capability}Option.${option}`)}
              </button>
            )
          })}
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
        />
      ) : null}

      {chip.kind === 'text' && chip.maxLength ? (
        <div className="flex flex-col gap-1">
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
          <span className="self-end font-mono text-3xs tabular-nums text-muted-foreground">
            {String(value).length} / {chip.maxLength}
          </span>
        </div>
      ) : null}

      {chip.kind === 'toggle' ? (
        <label className="flex items-center gap-2 text-2xs text-muted-foreground">
          <Switch
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(next) =>
              update({ [chip.capability]: next } as AdvancedParams)
            }
          />
          {tAdvanced(`${chip.capability}Hint`)}
        </label>
      ) : null}
    </div>
  )
}
