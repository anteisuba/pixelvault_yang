'use client'

import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import {
  getCapabilityChipValue,
  getModelCapabilityChips,
} from '@/lib/model-capability-chips'
import { Button } from '@/components/ui/button'

/** 每一项预设：哪个能力键、「关」是哪一档、两句文案。 */
const PRESETS = {
  positive: {
    capability: 'qualityToggle',
    off: 'off',
    message: 'presetNote.quality',
    turnOff: 'presetNote.turnOffQuality',
  },
  negative: {
    capability: 'ucPreset',
    off: 'none',
    message: 'presetNote.uc',
    turnOff: 'presetNote.turnOffUc',
  },
} as const

/**
 * NovelAI 的质量标签 / UC 预设是**我们替用户拼进去的字**（网页端同做法），缺省与官方
 * 一致是开着的（Standard · Heavy）。所以框底下要明说「会加什么」，并给一个就地关掉的
 * 键 —— ⛔ 不能只藏在「专属」弹层里，那等于用户看不见的静默追加。
 * 关掉之后这一行消失；再打开去「专属」里选。
 */
export function StudioTagPresetNote({
  polarity,
  disabled,
}: {
  polarity: 'positive' | 'negative'
  disabled?: boolean
}) {
  const t = useTranslations('StudioTags')
  const tAdvanced = useTranslations('AdvancedSettings')
  const { state, dispatch } = useStudioForm()
  const { runModels } = useStudioRunModels()
  const preset = PRESETS[polarity]

  // 多选时由第一个认这个能力的模型说了算（与「专属」chip 的值域同一口径）。
  const chip = runModels
    .flatMap((model) =>
      getModelCapabilityChips(model.adapterType, model.modelId),
    )
    .find((entry) => entry.capability === preset.capability)
  if (!chip) return null
  const value = String(getCapabilityChipValue(chip, state.advancedParams))
  if (value === preset.off) return null

  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
      <span className="min-w-0">
        {t(preset.message, {
          preset: tAdvanced(`${preset.capability}Option.${value}`),
        })}
      </span>
      <Button
        type="button"
        variant="link"
        size="xs"
        className="px-0 text-2xs"
        disabled={disabled}
        onClick={() =>
          dispatch({
            type: 'SET_ADVANCED_PARAMS',
            payload:
              polarity === 'positive'
                ? { ...state.advancedParams, qualityToggle: 'off' }
                : { ...state.advancedParams, ucPreset: 'none' },
          })
        }
      >
        {t(preset.turnOff)}
      </Button>
    </p>
  )
}
