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

/** 标签模板用在哪一台（每次问一句，owner 2026-09-28）。 */
export type PromptTemplateDestination = 'tags' | 'lora'

const TAG_TEMPLATE_BENCHES: Record<PromptTemplateDestination, string> = {
  tags: ROUTES.STUDIO_IMAGE_TAGS,
  lora: ROUTES.STUDIO_LORA,
}

function studioRouteFor(kind: RecipeTemplateKind): string {
  if (kind === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (kind === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

/**
 * 提示词页的「使用」（pages/prompts.md）：标签模板去选中的那一台，那一台按 `?template=`
 * 取回来、照自己的套用装好；别的模板跳回对应的台、只换提示词（沿用预填那一格）。每次
 * 都记一次最近使用时间 —— ⛔ 不等它回来（记不上不该挡住去工作台）。
 *
 * 返回 `false` = 预填写不进去（浏览器不让用 sessionStorage），调用方给出手动复制的出路。
 */
export function usePromptTemplateUse() {
  const router = useRouter()

  return useCallback(
    (
      template: PromptTemplateUseTarget,
      destination: PromptTemplateDestination = 'tags',
    ): boolean => {
      if (template.templateKind === 'TAGS') {
        void markRecipeUsedAPI(template.id)
        router.push(
          `${TAG_TEMPLATE_BENCHES[destination]}?template=${encodeURIComponent(template.id)}`,
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
