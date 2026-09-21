'use client'

import { useCallback, useMemo, useState } from 'react'
import { WORKFLOW_IDS } from '@/constants/workflows'
import { useStudioForm } from '@/contexts/studio-context'
import { hasPlaceholders } from '@/lib/prompt-placeholders'
import type { StudioModelOption } from '@/types/model-option'
import type {
  InspirationRecord,
  OutputType as RecipeOutputType,
  RecipeRecord,
} from '@/types'

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

  const currentTemplateParams = useMemo<Record<string, unknown>>(
    () => ({
      aspectRatio: state.aspectRatio,
      advancedParams: state.advancedParams,
    }),
    [state.advancedParams, state.aspectRatio],
  )

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

  const [placeholderDialog, setPlaceholderDialog] = useState<{
    open: boolean
    prompt: string
  }>({ open: false, prompt: '' })

  const applyInspirationPrompt = useCallback(
    (prompt: string) => {
      dispatch({ type: 'SET_PROMPT', payload: prompt })
    },
    [dispatch],
  )

  const handleApplyInspiration = useCallback(
    (inspiration: InspirationRecord) => {
      if (hasPlaceholders(inspiration.prompt)) {
        setPlaceholderDialog({ open: true, prompt: inspiration.prompt })
      } else {
        applyInspirationPrompt(inspiration.prompt)
      }
    },
    [applyInspirationPrompt],
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

  return {
    currentTemplateOutputType,
    currentTemplateParams,
    handleApplyRecipe,
    handleApplyInspiration,
    placeholderDialog,
    setPlaceholderDialog,
    applyInspirationPrompt,
  }
}
