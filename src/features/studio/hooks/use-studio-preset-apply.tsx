'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { WORKFLOW_IDS } from '@/constants/workflows'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { isMissingKeyModelOption } from '@/hooks/use-split-model-options'
import { findLook } from '@/lib/card-bus'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import { getTranslatedModelLabel } from '@/lib/model-options'
import type {
  StudioRemixCharacters,
  StudioRemixPreset,
} from '@/lib/studio-remix'
import { landRecipeInComposer } from '@/lib/studio-workbench-motion'
import type { CharacterImagePick } from '@/types'
import type { StudioModelOption } from '@/types/model-option'

import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'

/**
 * 「做同款 / 使用模板」落进工作台的**唯一**一处：素材 / 画廊（自己的与别人公开的）/
 * 提示词库的图片视频模板 / 结果卡上的重混，全都先变成 `StudioRemixPreset`
 * （`lib/studio-remix.ts`），再走这里的 `applyPreset`。
 *
 * 模型三种落法：
 * - 这一台的名单里有、key 齐 → 直接选上；
 * - 有、但这家没配 key → **先不选**，就地弹 `QuickSetupDialog`，验证通过才选上
 *   （Hard Rule 8）；其余几格照常套；
 * - 名单里没有（退役 `available:false` / 不在这一台）→ 保持当前模型并说一句
 *   「原本用的 X 已不可用，保持当前模型」；其余几格照常套。⛔ 悄悄换成同家别的型号。
 */
export function useStudioPresetApply(modelOptions: StudioModelOption[]): {
  applyPreset: (preset: StudioRemixPreset) => void
  keySetupDialog: ReactNode
} {
  const { state, dispatch } = useStudioForm()
  const { characters } = useStudioData()
  const { hasLoaded: keysLoaded } = useApiKeysContext()
  const tRemix = useTranslations('StudioV3')
  const tModels = useTranslations('Models')
  const [keySetupOption, setKeySetupOption] =
    useState<StudioModelOption | null>(null)

  const {
    cards: characterCards,
    findCard: findCharacterCard,
    setActiveCardIds,
    setImagePicks,
    setLookId,
  } = characters

  /** 把当时在场的角色挂回去（快照记的 id + 造型；旧作品按编译前缀里的 `@handle` 认）。 */
  const restoreCharacters = useCallback(
    (remix: StudioRemixCharacters) => {
      const cards: {
        id: string
        lookId?: string
        imagePicks?: CharacterImagePick[]
      }[] =
        remix.kind === 'ids'
          ? remix.cards.filter((card) => findCharacterCard(card.id))
          : remix.handles.flatMap((handle) => {
              const card = characterCards.find((item) => item.handle === handle)
              return card ? [{ id: card.id }] : []
            })
      // 当时没带角色（或角色已删）就不动台上的选择。
      if (cards.length === 0) return
      setActiveCardIds(cards.map((card) => card.id))
      for (const entry of cards) {
        const record = findCharacterCard(entry.id)
        if (!record) continue
        const look = findLook(record, entry.lookId)
        // setLookId 会清掉她挑的图，所以先换造型再挂图。
        setLookId(entry.id, look.isDefault ? null : look.id)
        /**
         * 挂回当时勾的那几张（11-19 真机：只勾 1 张主图，重混成了这套全部 4 张 ——
         * 没有 picks 时工作台按「自动排满这套」算）。已不在这套里的卡图丢掉；
         * 快照没记（旧作品）或丢光了就只挂主图，⛔ 全选。
         */
        const recorded = (entry.imagePicks ?? []).filter(
          (pick) =>
            !('slotId' in pick) ||
            look.referenceSlots.some((slot) => slot.id === pick.slotId),
        )
        const primary =
          look.referenceSlots.find((slot) => slot.isPrimary) ??
          look.referenceSlots[0]
        const picks: CharacterImagePick[] = recorded.length
          ? recorded
          : primary
            ? [{ slotId: primary.id }]
            : []
        if (picks.length) setImagePicks(entry.id, picks)
      }
    },
    [
      characterCards,
      findCharacterCard,
      setActiveCardIds,
      setImagePicks,
      setLookId,
    ],
  )

  const applyPreset = useCallback(
    (preset: StudioRemixPreset) => {
      if (preset.characters) restoreCharacters(preset.characters)
      if (preset.recipe) {
        // 模板一直是落到这一台的默认工作流（旧 `handleApplyRecipe` 的口径）。
        dispatch({
          type: 'SET_SELECTED_WORKFLOW_ID',
          payload:
            state.outputType === 'video'
              ? WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO
              : WORKFLOW_IDS.QUICK_IMAGE,
        })
      }
      if (preset.prompt)
        dispatch({ type: 'SET_PROMPT', payload: preset.prompt })
      if (preset.aspectRatio) {
        dispatch({ type: 'SET_ASPECT_RATIO', payload: preset.aspectRatio })
      }
      dispatch({ type: 'CLOSE_ALL_PANELS' })

      const option = preset.optionId
        ? modelOptions.find((item) => item.optionId === preset.optionId)
        : undefined
      if (option && isMissingKeyModelOption(option, keysLoaded)) {
        setKeySetupOption(option)
      } else if (option) {
        dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
      } else if (preset.sourceModelId) {
        toast(
          tRemix('remixModelUnavailable', {
            model: getTranslatedModelLabel(tModels, preset.sourceModelId),
          }),
        )
      }

      if (
        preset.advancedParams &&
        Object.keys(preset.advancedParams).length > 0
      ) {
        dispatch({
          type: 'SET_ADVANCED_PARAMS',
          payload: preset.advancedParams,
        })
      }
      if (preset.recipe) {
        dispatch({
          type: 'SET_RECIPE_USAGE',
          payload: {
            recipeId: preset.recipe.id,
            recipeVersion: preset.recipe.version,
            useMode: 'apply',
          },
        })
      }
      focusStudioPrompt()
      // 配方落进输入框：提示词由糊变清、卡顶一下（工作台原型「做同款」V 简化版）。
      window.requestAnimationFrame(landRecipeInComposer)
    },
    [
      dispatch,
      keysLoaded,
      modelOptions,
      restoreCharacters,
      state.outputType,
      tModels,
      tRemix,
    ],
  )

  const keySetupDialog = keySetupOption ? (
    <QuickSetupDialog
      open
      onOpenChange={(next) => {
        if (!next) setKeySetupOption(null)
      }}
      modelId={keySetupOption.modelId}
      modelLabel={getTranslatedModelLabel(tModels, keySetupOption.modelId)}
      adapterType={keySetupOption.adapterType}
      optionId={keySetupOption.optionId}
    />
  ) : null

  return { applyPreset, keySetupDialog }
}
