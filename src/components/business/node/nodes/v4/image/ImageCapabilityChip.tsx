'use client'

import { isAiAdapterType } from '@/constants/providers'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'
import type { NodeV4GenerationParams } from '@/types/node-workflow'
import { ModelCapabilitySingleChip } from '@/components/business/studio/StudioModelCapabilityChips'
import { useStudioChipDensity } from '@/components/business/studio-shared/primitives/tool-surface'

/**
 * 尺寸与「画面」chip 对齐（`SpecChip` 触发器）；底色与描边由 `canvas.css` 里提示词栏
 * 那条 chip 规则统一给。⚠ 一行写完，⛔ 折成两行。
 */
const compactTriggerClass =
  'h-7 gap-1 whitespace-nowrap px-2.5 text-xs font-normal ring-0 data-[state=open]:ring-0'
const regularTriggerClass =
  'h-8 min-w-0 whitespace-nowrap px-3 text-2sm font-normal ring-0 data-[state=open]:ring-0'

/**
 * 图片卡的「专属」chip（owner 2026-10-08：与图片台同一颗）。画质住卡上的 `quality`，
 * 其余几项住 `advanced`；模型没有专属能力时整颗不画。桌面卡与手机抽屉共用。
 */
export function ImageCapabilityChip({
  model,
  params,
  onParamsChange,
  hasReferenceImage,
  disabled = false,
}: {
  model: { adapterType: string; modelId: string } | undefined
  params: NodeV4GenerationParams | undefined
  onParamsChange: (next: NodeV4GenerationParams) => void
  hasReferenceImage: boolean
  disabled?: boolean
}) {
  const compact = useStudioChipDensity() === 'compact'
  if (!model || !isAiAdapterType(model.adapterType)) return null
  return (
    <ModelCapabilitySingleChip
      models={[{ adapterType: model.adapterType, modelId: model.modelId }]}
      // 卡上存的是自由串（档位跟着模型走），读给 chip 时按它的形状看。
      params={
        {
          ...params?.advanced,
          ...(params?.quality ? { quality: params.quality } : {}),
        } as AdvancedParams
      }
      onParamsChange={(next) => {
        const { quality, ...advanced } = next as Record<
          string,
          string | number | boolean
        >
        onParamsChange({
          ...params,
          ...(typeof quality === 'string' ? { quality } : {}),
          advanced,
        })
      }}
      hasReferenceImage={hasReferenceImage}
      disabled={disabled}
      triggerClassName={cn(
        'nodrag nopan',
        compact ? compactTriggerClass : regularTriggerClass,
      )}
    />
  )
}
