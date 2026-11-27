'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  useStudioData,
  useStudioForm,
  type StudioFormState,
} from '@/contexts/studio-context'
import { useStudioPresetApply } from '@/features/studio/hooks/use-studio-preset-apply'
import { useStudioPromptTemplates } from '@/features/studio/hooks/use-studio-prompt-templates'
import {
  buildTemplateStudioPreset,
  type StudioRemixPreset,
} from '@/lib/studio-remix'
import { getRecipeTemplateKind } from '@/lib/recipe-template-kind'
import type { RecipeRecord } from '@/types'
import type { StudioModelOption } from '@/types/model-option'

/** 套用会改到的那几格 —— 撤销时原样写回。 */
type TemplateApplySnapshot = Pick<
  StudioFormState,
  | 'selectedWorkflowId'
  | 'selectedOptionId'
  | 'prompt'
  | 'aspectRatio'
  | 'advancedParams'
  | 'tagChips'
  | 'tagNegativeChips'
  | 'activeTagCharacterIndex'
  | 'recipeUsage'
  | 'promptDialect'
> & {
  /** 「做同款」会把当时在场的角色挂回来；撤销时放回原来那几位。 */
  activeCardIds: string[]
}

/**
 * 模板套用 / 做同款 = **直接套 + 可撤销**（owner 2026-09-26 模板 C）。
 *
 * 点一张卡（或从别的页带着 `?template=` / `?remix=` 过来，`use-studio-arrival.ts`）就
 * 套上；套之前先把这一次会被改掉的几格拍一张快照，「撤销」按快照原样写回 —— 点错也
 * 不丢原来的提示词、模型、比例。三种来源共用这一条提示条（同一条到达反馈）。
 * ⚠ 标签台写回走 `SET_TAG_CHIPS`，⛔ 不走 `SET_PROMPT`：后者会清掉画风与画师串。
 * ⚠ 撤销放回角色的**选择**；挂回角色时顺手换掉的造型 / 勾的卡图不回滚。
 */
export function useStudioTemplateApply(modelOptions: StudioModelOption[]) {
  const tTemplates = useTranslations('StudioTemplates')
  const { state, dispatch } = useStudioForm()
  const { characters } = useStudioData()
  const templates = useStudioPromptTemplates(modelOptions)
  const { applyPreset, keySetupDialog } = useStudioPresetApply(modelOptions)
  const [pending, setPending] = useState<{
    /** 第几次套用：每套一次提示条重新来过（宿主拿它当 key）。 */
    id: number
    name: string
    /** 整句换掉「已套用「{name}」」（做同款用）。 */
    message?: string
    snapshot: TemplateApplySnapshot
    /** 已经撤过了：提示条还在淡出，⛔ 不许再撤一次。 */
    undone: boolean
  } | null>(null)
  const applyCount = useRef(0)

  /** 拍快照 → 套 → 亮提示条。 */
  const track = useCallback(
    (label: { name: string; message?: string }, run: () => void) => {
      const snapshot: TemplateApplySnapshot = {
        selectedWorkflowId: state.selectedWorkflowId,
        selectedOptionId: state.selectedOptionId,
        prompt: state.prompt,
        aspectRatio: state.aspectRatio,
        advancedParams: state.advancedParams,
        tagChips: state.tagChips,
        tagNegativeChips: state.tagNegativeChips,
        activeTagCharacterIndex: state.activeTagCharacterIndex,
        recipeUsage: state.recipeUsage,
        promptDialect: state.promptDialect,
        activeCardIds: characters.activeCardIds,
      }
      run()
      applyCount.current += 1
      setPending({
        id: applyCount.current,
        ...label,
        snapshot,
        undone: false,
      })
    },
    [characters.activeCardIds, state],
  )

  /**
   * 套一张模板。标签模板在标签台照它自己的整组替换（`handleApplyTagTemplate`，原样）；
   * 图片 / 视频模板与「做同款」同一条路（`buildTemplateStudioPreset` → `applyPreset`）：
   * 型号 · 提示词 · 负面 · 比例 · 参数 · 种子都带上 —— 包括没打标签标记、却存着 NAI
   * 型号的图片模板（它被 `studioArrivalBench` 带到标签台）。
   */
  const apply = useCallback(
    (recipe: RecipeRecord) => {
      track({ name: recipe.name || recipe.modelId }, () => {
        if (
          state.promptDialect === 'tags' &&
          getRecipeTemplateKind(recipe) === 'TAGS'
        )
          templates.handleApplyTagTemplate(recipe)
        else applyPreset(buildTemplateStudioPreset(recipe, modelOptions))
      })
    },
    [applyPreset, modelOptions, state.promptDialect, templates, track],
  )

  /** 仅叠加画风：合入画风词 / 负面 / 采样参数，不覆盖主角与角色，同样支持 5 秒撤销。 */
  const overlayStyle = useCallback(
    (recipe: RecipeRecord) => {
      const name = recipe.name || recipe.modelId
      track(
        {
          name,
          message: tTemplates('appliedStyleOverlay', { name }),
        },
        () => {
          templates.handleOverlayTagStyleTemplate(recipe)
        },
      )
    },
    [tTemplates, templates, track],
  )

  /** 「做同款」：素材 / 画廊带过来的那件作品。 */
  const applyRemix = useCallback(
    (preset: StudioRemixPreset, message: string) => {
      track({ name: '', message }, () => applyPreset(preset))
    },
    [applyPreset, track],
  )

  const { setActiveCardIds } = characters
  const undo = useCallback(() => {
    if (!pending || pending.undone) return
    const saved = pending.snapshot
    dispatch({
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: saved.selectedWorkflowId,
      openDefaultPanel: false,
    })
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
    if (saved.activeCardIds.join() !== characters.activeCardIds.join())
      setActiveCardIds(saved.activeCardIds)
    // 提示条淡出完才由 `dismiss` 摘掉（撤销那一下它还要演收起）。
    setPending({ ...pending, undone: true })
  }, [characters.activeCardIds, dispatch, pending, setActiveCardIds])

  const dismiss = useCallback(() => setPending(null), [])

  return {
    apply,
    overlayStyle,
    applyRemix,
    /** 刚套上的那一张的名字；`null` = 提示条不在。 */
    appliedName: pending?.name ?? null,
    appliedMessage: pending?.message,
    appliedId: pending?.id ?? null,
    undo,
    dismiss,
    templates,
    /** 套上的型号缺 key 时就地弹的配置（宿主挂一次）。 */
    keySetupDialog,
  }
}
