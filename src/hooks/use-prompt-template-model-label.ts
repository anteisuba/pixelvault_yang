'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'

import { LORA_BASE_MODELS } from '@/constants/lora-base-models'
import { getTranslatedModelLabel } from '@/lib/model-options'
import type { RecipeTemplateKind } from '@/lib/recipe-template-kind'

export interface PromptTemplateModelLabelTarget {
  modelId: string
  templateKind: RecipeTemplateKind
  lora: { baseId: string | null } | null
}

/**
 * 模板卡片与详情那一格「模型」写什么：LoRA 模板写它的底模（与 LoRA 台底模选择器
 * 同一个名字），别的模板写模型名。
 */
export function usePromptTemplateModelLabel() {
  const tModels = useTranslations('Models')
  const tLora = useTranslations('LoraWorkbench')

  return useCallback(
    (template: PromptTemplateModelLabelTarget): string => {
      if (template.templateKind === 'LORA') {
        const base =
          LORA_BASE_MODELS.find(
            (entry) => entry.id === template.lora?.baseId,
          ) ??
          LORA_BASE_MODELS.find(
            (entry) => entry.providerModelId === template.modelId,
          )
        if (base) {
          return base.translationKey
            ? tLora(`spine.${base.translationKey}`)
            : base.displayName
        }
      }
      return getTranslatedModelLabel(tModels, template.modelId)
    },
    [tLora, tModels],
  )
}
