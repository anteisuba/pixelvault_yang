'use client'

import { getModelById } from '@/constants/models'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import { useStudioForm } from '@/contexts/studio-context'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'

/**
 * 视频「原生出声」的**唯一**判据与显示值。
 *
 * 支不支持按**选中的那条端点**的契约判（`parameters.generateAudio`），⛔ 不按型号
 * 猜：同一个型号的参考端点与文生端点并不一定都收这个字段，画一颗发不出去的开关比
 * 没有更糟。
 *
 * 显示值 = 用户设过就用他的，没设过用目录默认（多数模型是 true）—— 开关的位置从
 * 一开始就说实话，而不是先摆一个关着的开关再偷偷发 true。
 *
 * 两个宿主共用它：规格 chip 的「更多」折叠区，与手机 composer 那一行里的出声 chip。
 */
export function useStudioVideoAudio(): {
  supported: boolean
  value: boolean
} {
  const { state } = useStudioForm()
  const { selectedModel } = useVideoModelOptions(state.selectedOptionId ?? '')

  const supported = Boolean(
    selectedModel &&
    getVideoModelSendContract(
      selectedModel.modelId,
      selectedModel.adapterType as AI_ADAPTER_TYPES,
    ).parameters.generateAudio,
  )
  const value =
    state.videoGenerateAudio ??
    (selectedModel
      ? (getModelById(selectedModel.modelId)?.videoDefaults?.generateAudio ??
        true)
      : true)

  return { supported, value }
}
