'use client'

import { useTranslations } from 'next-intl'

import { SpecChip } from '@/components/business/studio-shared/spec'
import { StudioChipZoomProvider } from '@/components/business/studio-shared/primitives/tool-surface'
import type { AspectRatio } from '@/constants/config'
import { LORA_GENERATE_ASPECT_RATIOS } from '@/constants/lora'
import type { SpecChipModel } from '@/lib/spec-chip-model'

interface LoraAspectRatioChipProps {
  value: AspectRatio
  onChange: (value: AspectRatio) => void
  disabled?: boolean
}

/**
 * LoRA 台的「比例」规格：只有比例一段（本域一次出一张，⛔ 不画张数 / 清晰度）。
 * 桌面输入框工具行那颗 `SpecChip` 与手机这颗共用这一份。
 */
export function loraAspectSpecModel(aspectRatio: AspectRatio): SpecChipModel {
  return {
    ratios: LORA_GENERATE_ASPECT_RATIOS.map((value) => ({
      value,
      supported: true,
    })),
    ratioLocked: false,
    resolutions: [],
    durations: [],
    durationSeconds: null,
    pricePerSecond: null,
    totalPrice: null,
    summary: aspectRatio,
    resolutionNote: null,
    isEmpty: false,
  }
}

export function isLoraAspectRatio(value: string): value is AspectRatio {
  return (LORA_GENERATE_ASPECT_RATIOS as readonly string[]).includes(value)
}

/**
 * 手机输入条上的比例 chip（P1-10 D7①）：与图片台同一颗 `SpecChip` —— 弹层从 chip
 * 长出来、由糊变清（`CHIP_POPOVER`），比例是带小形状的分段条，chip 上那颗比例框换比例时
 * 弹成新形状（动效样片 M）。⛔ 不再是蓝色选中的旧 Popover。
 * `StudioChipZoomProvider` 只开「从 chip 放大」那一种开合、不换 chip 外观（这一行不在
 * 描边工具行宿主里）。值仍由父层持有（URL 回放双向）。
 */
export function LoraAspectRatioChip({
  value,
  onChange,
  disabled,
}: LoraAspectRatioChipProps) {
  const t = useTranslations('LoraWorkbench')
  return (
    <StudioChipZoomProvider value>
      <SpecChip
        model={loraAspectSpecModel(value)}
        aspectRatio={value}
        onAspectRatioChange={(next) => {
          if (isLoraAspectRatio(next)) onChange(next)
        }}
        resolution={null}
        onResolutionChange={() => undefined}
        resolutionLabel={t('generate.aspectRatioLabel')}
        disabled={disabled}
        ariaLabel={t('generate.aspectRatioLabel')}
      />
    </StudioChipZoomProvider>
  )
}
