'use client'

import { useMemo } from 'react'

import {
  getMaxCharacterReferenceImages,
  getMaxReferenceImages,
} from '@/constants/provider-capabilities'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import {
  previewStudioCharacterOutlet,
  type StudioCharacterOutlet,
} from '@/lib/studio-character-outlet'

const EMPTY: StudioCharacterOutlet = {
  entries: [],
  novelAiPreciseReference: false,
}

/**
 * 这一枪在场角色**真会带上**的图（按名单第一个模型预演，与服务端同一个编译器）。
 * 输入框的角色图排、NovelAI 价格提示都读它。
 */
export function useStudioCharacterOutlet(): StudioCharacterOutlet {
  const { characters, imageUpload } = useStudioData()
  const { state } = useStudioForm()
  const { runModels } = useStudioRunModels()
  const model = runModels[0]
  const userReferenceCount = imageUpload.referenceImages.length
  const hasInpaintMask = typeof state.advancedParams.inpaintMask === 'string'
  const { activeCards, imagePicks, lookIds, novelAiPreciseReference } =
    characters

  return useMemo(() => {
    if (!model || activeCards.length === 0) return EMPTY
    return previewStudioCharacterOutlet(
      activeCards,
      { imagePicks, lookIds },
      {
        adapterType: model.adapterType,
        modelId: model.modelId,
        maxReferenceImages: getMaxReferenceImages(
          model.adapterType,
          model.modelId,
        ),
        maxCharacterReferenceImages: getMaxCharacterReferenceImages(
          model.adapterType,
          model.modelId,
        ),
        userReferenceCount,
        novelAiPreciseReference,
        hasInpaintMask,
      },
    )
  }, [
    activeCards,
    hasInpaintMask,
    imagePicks,
    lookIds,
    model,
    novelAiPreciseReference,
    userReferenceCount,
  ])
}
