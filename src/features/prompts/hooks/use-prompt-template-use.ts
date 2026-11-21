'use client'

import { useCallback } from 'react'

import { ROUTES, studioTemplatePath } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import { markRecipeUsedAPI } from '@/lib/api-client/recipes'
import type { RecipeTemplateKind } from '@/lib/recipe-template-kind'
import { studioArrivalBench } from '@/lib/studio-arrival'

export interface PromptTemplateUseTarget {
  id: string
  templateKind: RecipeTemplateKind
  /** 模板存的型号 —— 决定落到哪一台（NAI 等吃标签的型号去标签台）。 */
  modelId: string
}

/** 标签模板用在哪一台（每次问一句，owner 2026-09-28）。 */
export type PromptTemplateDestination = 'tags' | 'lora'

const TAG_TEMPLATE_BENCHES: Record<PromptTemplateDestination, string> = {
  tags: ROUTES.STUDIO_IMAGE_TAGS,
  lora: ROUTES.STUDIO_LORA,
}

/**
 * 提示词页的「使用」（pages/prompts.md）：一律带着 `?template=<id>` 跳到那一台，由那一台
 * 取回模板、装好整份配方（`features/studio/hooks/use-studio-arrival.ts`；配音间自己接）。
 * 标签模板去选中的那一台；别的按型号挑台（`studioArrivalBench`）。每次都记一次最近使用
 * 时间 —— ⛔ 不等它回来（记不上不该挡住去工作台）。
 */
export function usePromptTemplateUse() {
  const router = useRouter()

  return useCallback(
    (
      template: PromptTemplateUseTarget,
      destination: PromptTemplateDestination = 'tags',
    ): void => {
      void markRecipeUsedAPI(template.id)
      const bench =
        template.templateKind === 'TAGS'
          ? TAG_TEMPLATE_BENCHES[destination]
          : studioArrivalBench(template.templateKind, template.modelId)
      router.push(studioTemplatePath(bench, template.id))
    },
    [router],
  )
}
