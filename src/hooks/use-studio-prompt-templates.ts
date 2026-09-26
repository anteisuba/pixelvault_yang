'use client'

import { useCallback, useMemo } from 'react'
import { WORKFLOW_IDS } from '@/constants/workflows'
import { useStudioForm } from '@/contexts/studio-context'
import {
  isTagTemplateParams,
  parseTagChips,
  serializeTagChips,
} from '@/lib/tag-composer'
import type { StudioModelOption } from '@/types/model-option'
import {
  AdvancedParamsSchema,
  type OutputType as RecipeOutputType,
  type RecipeRecord,
} from '@/types'
import type { TagTemplateParamsSchema } from '@/types/tag-composer'
import type { z } from 'zod'

export function useStudioPromptTemplates(modelOptions: StudioModelOption[]) {
  const { state, dispatch } = useStudioForm()
  const getRecipePrompt = useCallback(
    (recipe: RecipeRecord) => recipe.compiledPrompt.trim(),
    [],
  )

  const currentTemplateOutputType = useMemo<RecipeOutputType>(() => {
    if (state.outputType === 'video') return 'VIDEO'
    if (state.outputType === 'audio') return 'AUDIO'
    return 'IMAGE'
  }, [state.outputType])

  const isTagDialect = state.promptDialect === 'tags'
  const currentTemplateParams = useMemo<Record<string, unknown>>(
    () => ({
      aspectRatio: state.aspectRatio,
      // UC 与各角色都在 advancedParams 里（negativePrompt · novelAiLayout）。
      advancedParams: state.advancedParams,
      ...(isTagDialect
        ? ({ promptDialect: 'tags' } satisfies z.infer<
            typeof TagTemplateParamsSchema
          >)
        : {}),
    }),
    [isTagDialect, state.advancedParams, state.aspectRatio],
  )
  /**
   * 存成模板的那段正向 —— 标签台存**整体标签本身**，⛔ 不存编译进来的画风与
   * 画师串（那几块是常驻开关，不跟模板走）。
   */
  const currentTemplatePrompt = isTagDialect
    ? serializeTagChips(state.tagChips)
    : state.prompt

  const getRecipeAspectRatio = useCallback((recipe: RecipeRecord) => {
    if (!recipe.params || typeof recipe.params !== 'object') return null
    const params = recipe.params as Record<string, unknown>
    const aspectRatio = params.aspectRatio
    return aspectRatio === '1:1' ||
      aspectRatio === '16:9' ||
      aspectRatio === '9:16' ||
      aspectRatio === '4:3' ||
      aspectRatio === '3:4'
      ? aspectRatio
      : null
  }, [])

  const getRecipeAdvancedParams = useCallback((recipe: RecipeRecord) => {
    if (!recipe.params || typeof recipe.params !== 'object') return null
    const params = recipe.params as Record<string, unknown>
    const advancedParams = params.advancedParams
    return advancedParams &&
      typeof advancedParams === 'object' &&
      !Array.isArray(advancedParams)
      ? (advancedParams as Record<string, unknown>)
      : null
  }, [])

  const setRecipeLineage = useCallback(
    (recipe: RecipeRecord, useMode: 'replace' | 'insert' | 'apply') => {
      dispatch({
        type: 'SET_RECIPE_USAGE',
        payload: {
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          useMode,
        },
      })
    },
    [dispatch],
  )

  const handleApplyRecipe = useCallback(
    (recipe: RecipeRecord) => {
      const workflowId =
        recipe.outputType === 'VIDEO'
          ? WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO
          : recipe.outputType === 'AUDIO'
            ? WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE
            : WORKFLOW_IDS.QUICK_IMAGE
      const matchedOption = modelOptions.find(
        (option) => option.modelId === recipe.modelId,
      )
      const aspectRatio = getRecipeAspectRatio(recipe)
      const advancedParams = getRecipeAdvancedParams(recipe)

      dispatch({ type: 'SET_SELECTED_WORKFLOW_ID', payload: workflowId })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
      dispatch({
        type: 'SET_OPTION_ID',
        payload: matchedOption?.optionId ?? `workspace:${recipe.modelId}`,
      })
      dispatch({ type: 'SET_PROMPT', payload: getRecipePrompt(recipe) })
      if (aspectRatio) {
        dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
      }
      if (advancedParams) {
        dispatch({ type: 'SET_ADVANCED_PARAMS', payload: advancedParams })
      }
      setRecipeLineage(recipe, 'apply')
    },
    [
      dispatch,
      getRecipeAdvancedParams,
      getRecipeAspectRatio,
      getRecipePrompt,
      modelOptions,
      setRecipeLineage,
    ],
  )

  /**
   * 套用标签模板 = **整组替换**（owner 2026-09-26）：整体 · 各角色 · UC · 模型 ·
   * 规格 · 专属参数一起换。⚠ 不走 `SET_PROMPT`：那一步会清掉画风与画师串，而
   * 它们是常驻开关、不属于模板。
   * ⚠ **LoRA 模板只换标签**（标签台也列它们，owner 2026-09-26）：它的模型是挂 LoRA
   *   的底模，NAI 跑不了 LoRA —— 换过去等于把人带出标签台。所以只把正向 / UC 换成
   *   它的标签，模型、规格、专属参数都留着。
   */
  const handleApplyTagTemplate = useCallback(
    (recipe: RecipeRecord) => {
      if (!isTagTemplateParams(recipe.params)) {
        dispatch({
          type: 'SET_TAG_CHIPS',
          payload: {
            polarity: 'positive',
            chips: parseTagChips(recipe.compiledPrompt),
          },
        })
        const negative = getRecipeAdvancedParams(recipe)?.negativePrompt
        if (typeof negative === 'string' && negative.trim()) {
          dispatch({
            type: 'SET_TAG_CHIPS',
            payload: { polarity: 'negative', chips: parseTagChips(negative) },
          })
        }
        dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: null })
        setRecipeLineage(recipe, 'apply')
        return
      }
      const matchedOption = modelOptions.find(
        (option) => option.modelId === recipe.modelId,
      )
      const aspectRatio = getRecipeAspectRatio(recipe)
      const advancedParams = AdvancedParamsSchema.safeParse(
        getRecipeAdvancedParams(recipe) ?? {},
      )

      dispatch({
        type: 'SET_SELECTED_WORKFLOW_ID',
        payload: WORKFLOW_IDS.QUICK_IMAGE,
      })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
      dispatch({
        type: 'SET_OPTION_ID',
        payload: matchedOption?.optionId ?? `workspace:${recipe.modelId}`,
      })
      if (aspectRatio) {
        dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
      }
      const params = advancedParams.success ? advancedParams.data : {}
      dispatch({ type: 'SET_ADVANCED_PARAMS', payload: params })
      dispatch({
        type: 'SET_TAG_CHIPS',
        payload: {
          polarity: 'positive',
          chips: parseTagChips(recipe.compiledPrompt),
        },
      })
      dispatch({
        type: 'SET_TAG_CHIPS',
        payload: {
          polarity: 'negative',
          chips: parseTagChips(params.negativePrompt ?? ''),
        },
      })
      dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: null })
      setRecipeLineage(recipe, 'apply')
    },
    [
      dispatch,
      getRecipeAdvancedParams,
      getRecipeAspectRatio,
      modelOptions,
      setRecipeLineage,
    ],
  )

  return {
    currentTemplateOutputType,
    currentTemplateParams,
    currentTemplatePrompt,
    handleApplyRecipe,
    handleApplyTagTemplate,
  }
}
