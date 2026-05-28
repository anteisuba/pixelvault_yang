'use client'

import { useMemo } from 'react'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { LlmCapabilityScope } from '@/constants/llm-capability'
import { use3DModelOptions } from '@/hooks/use-3d-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import {
  useLLMRoutePicker,
  type LLMRouteOption,
} from '@/hooks/use-llm-route-picker'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'

import { BaseModelPickerPanel } from './BaseModelPickerPanel'

export type MainModelPickerModality =
  | 'image'
  | 'video'
  | 'audio'
  | 'model_3d'
  | 'llm_assist'

interface CommonProps {
  value: string | null
  onChange: (option: StudioModelOption) => void
  onRequestSetup?: (option: StudioModelOption) => void
  triggerEmptyLabel?: string
  searchPlaceholder?: string
  emptySearchText?: string
  enableSearch?: boolean
  size?: 'compact' | 'default'
  className?: string
  disabled?: boolean
}

export type MainModelPickerProps = CommonProps &
  (
    | { modality: 'image' | 'video' | 'audio' | 'model_3d' }
    | { modality: 'llm_assist'; llmCapability: LlmCapabilityScope }
  )

export function MainModelPicker(props: MainModelPickerProps) {
  const { modality, ...rest } = props
  switch (modality) {
    case 'image':
      return <MainModelPickerImage {...rest} />
    case 'video':
      return <MainModelPickerVideo {...rest} />
    case 'audio':
      return <MainModelPickerAudio {...rest} />
    case 'model_3d':
      return <MainModelPicker3D {...rest} />
    case 'llm_assist': {
      const { llmCapability, ...subRest } = rest as Extract<
        MainModelPickerProps,
        { modality: 'llm_assist' }
      >
      return <MainModelPickerLLM scope={llmCapability} {...subRest} />
    }
  }
}

function MainModelPickerImage(props: CommonProps) {
  const { modelOptions } = useImageModelOptions()
  return <BaseModelPickerPanel options={modelOptions} {...props} />
}

function MainModelPickerVideo(props: CommonProps) {
  const { modelOptions } = useVideoModelOptions(props.value ?? '')
  return <BaseModelPickerPanel options={modelOptions} {...props} />
}

function MainModelPickerAudio(props: CommonProps) {
  const { modelOptions } = useAudioModelOptions()
  return <BaseModelPickerPanel options={modelOptions} {...props} />
}

function MainModelPicker3D(props: CommonProps) {
  const { modelOptions } = use3DModelOptions()
  return <BaseModelPickerPanel options={modelOptions} {...props} />
}

interface LLMSubProps extends CommonProps {
  scope: LlmCapabilityScope
}

function MainModelPickerLLM({ scope, ...rest }: LLMSubProps) {
  const { allRoutes } = useLLMRoutePicker(scope)

  const options = useMemo<StudioModelOption[]>(
    () => allRoutes.map(routeToStudioOption),
    [allRoutes],
  )

  return <BaseModelPickerPanel options={options} {...rest} />
}

/** Exported for unit-testing the conversion from LLM scope → picker shape. */
export function routeToStudioOption(route: LLMRouteOption): StudioModelOption {
  return {
    optionId: route.optionId,
    modelId: route.modelId ?? route.adapterType,
    adapterType: route.adapterType,
    providerConfig: { label: route.providerLabel, baseUrl: '' },
    requestCount: 0,
    isBuiltIn: false,
    freeTier: false,
    sourceType: route.isSaved ? 'saved' : 'workspace',
    keyId: route.apiKeyId ?? undefined,
    keyLabel: route.keyLabel,
    maskedKey: route.maskedKey,
  }
}
