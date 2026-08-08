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

import {
  BaseModelPickerPanel,
  type BaseModelPickerPanelProps,
} from './BaseModelPickerPanel'

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
  popoverSide?: 'top' | 'bottom'
  className?: string
  disabled?: boolean
  detailForOption?: (option: StudioModelOption) => string | undefined
  /**
   * 在这些模态各自的 hook 取到清单之后再收窄一次。谓词由调用方给 —— 组件本身不认
   * 识任何业务口径。
   *
   * 起因是视频节点的**模式**（关键帧 / 多图参考 / 全能参考）：不符合当前模式的模型
   * 要**直接从列表消失**（owner 2026-08-08 拍板，不是置灰）。
   *
   * ⚠ 与 `WorkflowModelPicker` 的 `options` prop 不冲突：那边是**换掉数据源**（父级
   * 自己 curate 一份），这里是**在同一个数据源上过滤**。视频节点要的是后者 —— 清单
   * 还是那份视频模型清单，只是按模式收窄。
   */
  filterOption?: (option: StudioModelOption) => boolean
  /**
   * 收起态触发器的标签覆写，原样透传给 `BaseModelPickerPanel`（那边接得住，所以不用
   * 像 `filterOption` 一样在这里消化）。契约见该组件的 prop 注释。
   */
  triggerLabelForOption?: BaseModelPickerPanelProps['triggerLabelForOption']
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

/**
 * ⚠ `filterOption` 必须在这里消化掉，不能连同 `...props` 一起 spread 进
 * `BaseModelPickerPanel` —— 那边没有这个 prop，会被**静默丢弃**（同 D7 台账里
 * `triggerLabel` 那次：传了一个不存在的 prop，谁都没报错，功能就是不生效）。
 */
function useFiltered(
  modelOptions: StudioModelOption[],
  filterOption: CommonProps['filterOption'],
): StudioModelOption[] {
  return useMemo(
    () => (filterOption ? modelOptions.filter(filterOption) : modelOptions),
    [modelOptions, filterOption],
  )
}

function MainModelPickerImage({ filterOption, ...props }: CommonProps) {
  const { modelOptions } = useImageModelOptions()
  const options = useFiltered(modelOptions, filterOption)
  return <BaseModelPickerPanel options={options} {...props} />
}

function MainModelPickerVideo({ filterOption, ...props }: CommonProps) {
  const { modelOptions } = useVideoModelOptions(props.value ?? '')
  const options = useFiltered(modelOptions, filterOption)
  return <BaseModelPickerPanel options={options} {...props} />
}

function MainModelPickerAudio({ filterOption, ...props }: CommonProps) {
  const { modelOptions } = useAudioModelOptions()
  const options = useFiltered(modelOptions, filterOption)
  return <BaseModelPickerPanel options={options} {...props} />
}

function MainModelPicker3D({ filterOption, ...props }: CommonProps) {
  const { modelOptions } = use3DModelOptions()
  const options = useFiltered(modelOptions, filterOption)
  return <BaseModelPickerPanel options={options} {...props} />
}

interface LLMSubProps extends CommonProps {
  scope: LlmCapabilityScope
}

function MainModelPickerLLM({ scope, filterOption, ...rest }: LLMSubProps) {
  const { allRoutes } = useLLMRoutePicker(scope)

  const options = useMemo<StudioModelOption[]>(
    () => allRoutes.map(routeToStudioOption),
    [allRoutes],
  )
  const filtered = useFiltered(options, filterOption)

  return (
    <BaseModelPickerPanel
      options={filtered}
      savedOptionLabelMode="model"
      {...rest}
    />
  )
}

/** Exported for unit-testing the conversion from LLM scope → picker shape. */
export function routeToStudioOption(route: LLMRouteOption): StudioModelOption {
  return {
    optionId: route.optionId,
    modelId: route.modelId ?? route.adapterType,
    displayLabel: route.label,
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
