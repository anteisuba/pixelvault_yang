'use client'

import { useCallback } from 'react'

import { ROUTES } from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import { useRouter } from '@/i18n/navigation'
import { markRecipeUsedAPI } from '@/lib/api-client/recipes'
import type { RecipeTemplateKind } from '@/lib/recipe-template-kind'

export interface PromptTemplateUseTarget {
  id: string
  templateKind: RecipeTemplateKind
  compiledPrompt: string
}

function studioRouteFor(kind: RecipeTemplateKind): string {
  if (kind === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (kind === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

/**
 * 提示词页的「使用」（pages/prompts.md）：LoRA 模板回 LoRA 台由那边按 `?template=`
 * 原样装好整套；别的模板跳回对应的台、只换提示词（沿用预填那一格）。每次都记一次
 * 最近使用时间 —— ⛔ 不等它回来（记不上不该挡住去工作台）。
 *
 * 返回 `false` = 预填写不进去（浏览器不让用 sessionStorage），调用方给出手动复制的出路。
 */
export function usePromptTemplateUse() {
  const router = useRouter()

  return useCallback(
    (template: PromptTemplateUseTarget): boolean => {
      if (template.templateKind === 'LORA') {
        void markRecipeUsedAPI(template.id)
        router.push(
          `${ROUTES.STUDIO_LORA}?template=${encodeURIComponent(template.id)}`,
        )
        return true
      }
      try {
        window.sessionStorage.setItem(
          STUDIO_PREFILL_PROMPT_STORAGE_KEY,
          template.compiledPrompt,
        )
      } catch {
        return false
      }
      void markRecipeUsedAPI(template.id)
      router.push(studioRouteFor(template.templateKind))
      return true
    },
    [router],
  )
}
