'use client'

import { useCallback } from 'react'

import { adapterHasCapability } from '@/constants/llm-capability'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'

/**
 * Shared prop assembly for the two PromptAssistantPanel hosts: the desktop
 * assistant dock (StudioAssistantDock) and the mobile drawer trigger
 * (StudioEnhanceButton). Keeps model resolution, LLM key filtering, and the
 * prompt write-back callbacks in one place so the hosts can't drift.
 */
export function useStudioAssistantPanelInputs() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, styles } = useStudioData()
  const { selectedModel: imageSelectedModel } = useImageModelOptions()
  const { selectedModel: videoSelectedModel } = useVideoModelOptions(
    state.selectedOptionId ?? '',
  )
  const { selectedModel: audioSelectedModel } = useAudioModelOptions()
  const { keys: apiKeys } = useApiKeysContext()

  const llmApiKeys = apiKeys
    .filter((k) => k.isActive && adapterHasCapability(k.adapterType, 'enhance'))
    .map((k) => ({ id: k.id, label: k.label || k.adapterType }))

  const selectedStyleCard = styles.activeCard
  const selectedModel =
    state.outputType === 'audio'
      ? audioSelectedModel
      : state.outputType === 'video'
        ? videoSelectedModel
        : imageSelectedModel
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)

  const open = state.panels.enhance

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      dispatch({
        type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
        payload: 'enhance',
      })
    },
    [dispatch],
  )

  const onUsePrompt = useCallback(
    (text: string) => {
      dispatch({ type: 'SET_PROMPT', payload: text })
    },
    [dispatch],
  )

  const onAppendPrompt = useCallback(
    (text: string) => {
      const current = state.prompt.trim()
      dispatch({
        type: 'SET_PROMPT',
        payload: current ? `${current}, ${text}` : text,
      })
    },
    [dispatch, state.prompt],
  )

  return {
    open,
    setOpen,
    currentPrompt: state.prompt,
    modelId,
    llmApiKeys,
    referenceImageData: imageUpload.referenceImages[0],
    onUsePrompt,
    onAppendPrompt,
  }
}
