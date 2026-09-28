'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { useStudioForm, type StudioFormState } from '@/contexts/studio-context'
import { useStudioPromptTemplates } from '@/hooks/use-studio-prompt-templates'
import { usePathname, useRouter } from '@/i18n/navigation'
import { getRecipeAPI } from '@/lib/api-client/recipes'
import type { RecipeRecord } from '@/types'
import type { StudioModelOption } from '@/types/model-option'

/** 套用会改到的那几格 —— 撤销时原样写回。 */
type TemplateApplySnapshot = Pick<
  StudioFormState,
  | 'selectedWorkflowId'
  | 'workflowMode'
  | 'selectedOptionId'
  | 'prompt'
  | 'aspectRatio'
  | 'advancedParams'
  | 'tagChips'
  | 'tagNegativeChips'
  | 'activeTagCharacterIndex'
  | 'recipeUsage'
  | 'promptDialect'
>

/**
 * 模板套用 = **直接套 + 可撤销**（owner 2026-09-26 模板 C）。
 *
 * 点一张卡就套上、回到结果；套之前先把这一次会被改掉的几格拍一张快照，
 * 「撤销」按快照原样写回 —— 点错也不丢原来的提示词、模型、比例。
 * ⚠ 标签台写回走 `SET_TAG_CHIPS`，⛔ 不走 `SET_PROMPT`：后者会清掉画风与画师串。
 */
export function useStudioTemplateApply(modelOptions: StudioModelOption[]) {
  const { state, dispatch } = useStudioForm()
  const templates = useStudioPromptTemplates(modelOptions)
  const [pending, setPending] = useState<{
    /** 第几次套用：每套一次提示条重新来过（宿主拿它当 key）。 */
    id: number
    name: string
    snapshot: TemplateApplySnapshot
    /** 已经撤过了：提示条还在淡出，⛔ 不许再撤一次。 */
    undone: boolean
  } | null>(null)
  const applyCount = useRef(0)

  const apply = useCallback(
    (recipe: RecipeRecord) => {
      const snapshot: TemplateApplySnapshot = {
        selectedWorkflowId: state.selectedWorkflowId,
        workflowMode: state.workflowMode,
        selectedOptionId: state.selectedOptionId,
        prompt: state.prompt,
        aspectRatio: state.aspectRatio,
        advancedParams: state.advancedParams,
        tagChips: state.tagChips,
        tagNegativeChips: state.tagNegativeChips,
        activeTagCharacterIndex: state.activeTagCharacterIndex,
        recipeUsage: state.recipeUsage,
        promptDialect: state.promptDialect,
      }
      if (state.promptDialect === 'tags')
        templates.handleApplyTagTemplate(recipe)
      else templates.handleApplyRecipe(recipe)
      applyCount.current += 1
      setPending({
        id: applyCount.current,
        name: recipe.name || recipe.modelId,
        snapshot,
        undone: false,
      })
    },
    [state, templates],
  )

  const undo = useCallback(() => {
    if (!pending || pending.undone) return
    const saved = pending.snapshot
    dispatch({
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: saved.selectedWorkflowId,
      openDefaultPanel: false,
    })
    dispatch({ type: 'SET_WORKFLOW_MODE', payload: saved.workflowMode })
    dispatch({ type: 'SET_OPTION_ID', payload: saved.selectedOptionId })
    dispatch({ type: 'SET_ASPECT_RATIO', payload: saved.aspectRatio })
    // 先放回参数，再放回角色位：参数里的角色比当前那一位少时，reducer 会把它清掉。
    dispatch({ type: 'SET_ADVANCED_PARAMS', payload: saved.advancedParams })
    if (saved.promptDialect === 'tags') {
      dispatch({
        type: 'SET_TAG_CHIPS',
        payload: { polarity: 'negative', chips: saved.tagNegativeChips },
      })
      dispatch({
        type: 'SET_TAG_CHIPS',
        payload: { polarity: 'positive', chips: saved.tagChips },
      })
      dispatch({
        type: 'SET_ACTIVE_TAG_CHARACTER',
        payload: saved.activeTagCharacterIndex,
      })
    } else {
      dispatch({ type: 'SET_PROMPT', payload: saved.prompt })
    }
    dispatch({ type: 'SET_RECIPE_USAGE', payload: saved.recipeUsage })
    // 提示条淡出完才由 `dismiss` 摘掉（撤销那一下它还要演收起）。
    setPending({ ...pending, undone: true })
  }, [dispatch, pending])

  const dismiss = useCallback(() => setPending(null), [])

  /**
   * 提示词页「使用 → 用在标签台」带着 `?template=<id>` 过来（pages/prompts.md）：取回来
   * 照这一台自己的套用走（带「撤销」），装一次就把参数拿掉 —— 刷新不再重套一遍、盖掉
   * 后来的改动。⚠ 等方言切到标签台再套（方言由路由同步，第一帧可能还是自然语言）；
   * 回来那一刻用最新的 `apply`，撤销快照才是套用前那一刻的。
   */
  const t = useTranslations('StudioTemplates')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const templateParam = searchParams.get('template')
  const tagsBench = state.promptDialect === 'tags'
  const applyRef = useRef(apply)
  useEffect(() => {
    applyRef.current = apply
  }, [apply])
  const appliedTemplate = useRef<string | null>(null)
  useEffect(() => {
    if (!templateParam || !tagsBench) return
    if (appliedTemplate.current === templateParam) return
    appliedTemplate.current = templateParam
    void getRecipeAPI(templateParam).then((response) => {
      const query = new URLSearchParams(searchParams.toString())
      query.delete('template')
      const rest = query.toString()
      router.replace(rest ? `${pathname}?${rest}` : pathname, {
        scroll: false,
      })
      if (response.success && response.data) applyRef.current(response.data)
      else toast.error(t('loadFailed'))
    })
  }, [pathname, router, searchParams, t, tagsBench, templateParam])

  return {
    apply,
    /** 刚套上的那一张的名字；`null` = 提示条不在。 */
    appliedName: pending?.name ?? null,
    appliedId: pending?.id ?? null,
    undo,
    dismiss,
    templates,
  }
}
