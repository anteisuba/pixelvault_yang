'use client'

import { useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import type { MentionPickerOption } from '@/components/business/node/nodes/v4/chrome/MentionPicker'
import { prefetchRecipes, useRecipes } from '@/hooks/prompts/use-recipes'
import { markRecipeUsedAPI } from '@/lib/api-client/recipes'
import type { RecipeRecord } from '@/types'

/** 候选里那一行灰字最多带多少字（整段提示词太长，只给开头认一认）。 */
const HINT_MAX_CHARS = 60

/**
 * 画布卡提示词栏的 **`/` = 「我的模板」**（提示词页那张表，owner 2026-10-15）。
 *
 * - 只列跟这张卡同类的模板（图片卡列图片模板，视频卡列视频模板）。
 * - 选中只把提示词落进正文、反向词交给调用方；⛔ 换模型、⛔ 套参数（owner 选 A：
 *   换模型容易吓到人）。
 * - 列表是会话内共享的缓存（`useRecipes`）：卡挂上时空闲预取一次，⛔ 每张卡各拉一遍。
 */
export function useRecipeSlashOptions(outputType: RecipeRecord['outputType']) {
  const groupLabel = useTranslations('StudioNode.v4.chrome')('myTemplates')
  const { recipes } = useRecipes(false)
  useEffect(() => prefetchRecipes(), [])

  const matching = useMemo(
    () => recipes.filter((recipe) => recipe.outputType === outputType),
    [recipes, outputType],
  )

  const options = useMemo<readonly MentionPickerOption[]>(
    () =>
      matching.map((recipe) => {
        const prompt = recipe.compiledPrompt.trim()
        return {
          id: recipe.id,
          name: recipe.name.trim() || prompt.slice(0, 20),
          groupLabel,
          hint:
            prompt.length > HINT_MAX_CHARS
              ? `${prompt.slice(0, HINT_MAX_CHARS)}…`
              : prompt,
          ...(recipe.coverThumbnailUrl
            ? {
                media: {
                  kind: 'image' as const,
                  thumbnailUrl: recipe.coverThumbnailUrl,
                },
              }
            : {}),
        }
      }),
    [matching, groupLabel],
  )

  /** 选中的那一条（找不到 = `null`）；顺手记一次「最近使用」。 */
  const pick = (optionId: string): RecipeRecord | null => {
    const recipe = matching.find((item) => item.id === optionId) ?? null
    if (recipe) void markRecipeUsedAPI(recipe.id)
    return recipe
  }

  return { options, pick }
}
