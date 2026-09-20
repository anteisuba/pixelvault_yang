'use client'

import { useMemo } from 'react'

import type { StudioModelOption } from '@/types/model-option'
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
  ModelPickerPopover,
  type ModelPickerPopoverProps,
} from './ModelPickerPopover'

/**
 * 按模态取清单，再交给**统一模型选择器**（D2 ④）。
 *
 * ⚠ 2026-09-17 收口：五个模态**全部**走 `ModelPickerPopover`。三栏钻取的
 * `BaseModelPickerPanel` 已整删 —— 与它一起没的还有 `layout` / `size` /
 * `detailForOption` / `triggerLabelForOption` / `enableSearch` 那几个只有三栏认识
 * 的 prop。⛔ 别为了「少改一个调用方」把它们加回来当无操作。
 */

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
  popoverSide?: 'top' | 'bottom'
  className?: string
  disabled?: boolean
  /**
   * 在这些模态各自的 hook 取到清单之后再收窄一次。谓词由调用方给 —— 组件本身不认
   * 识任何业务口径。
   *
   * 起因是视频节点的**模式**（关键帧 / 多图参考 / 全能参考）：不符合当前模式的模型
   * 要**直接从列表消失**（owner 2026-08-08 拍板，不是置灰）。
   */
  filterOption?: (option: StudioModelOption) => boolean
  /** 只渲染面板本体（不带触发器 / 浮层），原样透传。 */
  inline?: ModelPickerPopoverProps['inline']
  /** 多选，原样透传（两个要一起给才生效）。 */
  selectedOptionIds?: ModelPickerPopoverProps['selectedOptionIds']
  onToggleOption?: ModelPickerPopoverProps['onToggleOption']
  /** 底部「配置渠道与 key…」，原样透传。 */
  onManageChannels?: ModelPickerPopoverProps['onManageChannels']
  /**
   * 覆盖「上次用的模型」记忆的作用域。缺省是模态名（`image` / `video` / …）。
   *
   * 起因是 D10 的两台：自然语言台与标签台的名单互不相交，共用一个作用域会让
   * 「上次用的」指向一个这一台根本列不出来的型号。⛔ 别把它当通用开关 ——
   * 传了就等于宣布「这是另一份名单」。
   */
  memoryScope?: string
  /** 搜索时列表底下那一行「本名单之外的去处」，原样透传。 */
  renderSearchFallback?: ModelPickerPopoverProps['renderSearchFallback']
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

function useFiltered(
  modelOptions: StudioModelOption[],
  filterOption: CommonProps['filterOption'],
): StudioModelOption[] {
  return useMemo(
    () => (filterOption ? modelOptions.filter(filterOption) : modelOptions),
    [modelOptions, filterOption],
  )
}

/**
 * 每个模态只换两件事：**清单从哪个 hook 来**、**记忆作用域叫什么**。其余一律原样
 * 透传 —— 五处宿主同一颗触发器、同一个弹层（D2 ④「五处宿主同一形状」）。
 */
function toPickerProps(
  props: CommonProps,
  options: StudioModelOption[],
  memoryScope: string,
): ModelPickerPopoverProps {
  // `filterOption` 在各模态的 `useFiltered` 里已经消化掉了，⛔ 不能连同 `...rest`
  // 一起 spread 下去 —— 弹层没有这个 prop，会被**静默丢弃**（D7 台账那个老坑）。
  const {
    filterOption,
    popoverSide,
    memoryScope: memoryScopeOverride,
    ...rest
  } = props
  void filterOption
  return {
    ...rest,
    options,
    memoryScope: memoryScopeOverride ?? memoryScope,
    ...(popoverSide ? { side: popoverSide } : {}),
  }
}

function MainModelPickerImage(props: CommonProps) {
  const { modelOptions } = useImageModelOptions()
  const options = useFiltered(modelOptions, props.filterOption)
  return <ModelPickerPopover {...toPickerProps(props, options, 'image')} />
}

function MainModelPickerVideo(props: CommonProps) {
  const { modelOptions } = useVideoModelOptions(props.value ?? '')
  const options = useFiltered(modelOptions, props.filterOption)
  return <ModelPickerPopover {...toPickerProps(props, options, 'video')} />
}

function MainModelPickerAudio(props: CommonProps) {
  const { modelOptions } = useAudioModelOptions()
  const options = useFiltered(modelOptions, props.filterOption)
  return <ModelPickerPopover {...toPickerProps(props, options, 'audio')} />
}

function MainModelPicker3D(props: CommonProps) {
  const { modelOptions } = use3DModelOptions()
  const options = useFiltered(modelOptions, props.filterOption)
  return <ModelPickerPopover {...toPickerProps(props, options, 'model_3d')} />
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
  const filtered = useFiltered(options, rest.filterOption)
  return <ModelPickerPopover {...toPickerProps(rest, filtered, 'llm_assist')} />
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
    sourceType: route.isSaved ? 'saved' : 'workspace',
    keyId: route.apiKeyId ?? undefined,
    keyLabel: route.keyLabel,
    maskedKey: route.maskedKey,
  }
}
