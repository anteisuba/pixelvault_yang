'use client'

import { useStudioForm } from '@/contexts/studio-context'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'

/**
 * 这一档（图片 / 视频 / 音频）的模型清单与选中那一项。
 * ⚠ 不带生成副作用，任何宿主都能挂 —— `useStudioGenerateAction` 带
 *   `REQUEST_GENERATE` 的执行端，只能挂一份，别为了拿模型清单去挂它。
 */
export function useStudioModeModelOptions() {
  const { state } = useStudioForm()
  const image = useImageModelOptions()
  const audio = useAudioModelOptions()
  const video = useVideoModelOptions(state.selectedOptionId ?? '')
  if (state.outputType === 'audio') return audio
  if (state.outputType === 'video') return video
  return image
}
