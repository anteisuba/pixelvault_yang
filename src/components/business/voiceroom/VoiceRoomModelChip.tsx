'use client'

import { useTranslations } from 'next-intl'

import { AUDIO_KIND } from '@/constants/audio-options'
import { ModelPickerPopover } from '@/components/business/studio-shared/pickers'
import { useAudioModelOptionsFor } from '@/hooks/use-audio-model-options'

/**
 * 房间顶栏的模型入口。
 *
 * ⚠ 用 `ModelPickerPopover` 而不是 `MainModelPicker`：后者内部调
 * `useAudioModelOptions()`，那个 hook 读 `useStudioForm()`——配音间**故意**住在
 * 工作台路由组外面，没有 `StudioProvider`。所以清单从
 * `useAudioModelOptionsFor()`（同一份实现的无上下文内核）取，弹层还是那一个共享
 * 弹层，皮肤与行为不分叉。
 */

interface VoiceRoomModelChipProps {
  /** null = 还没选过，走目录里第一个可用的（与服务端的兜底一致）。 */
  value: string | null
  onChange: (optionId: string, modelId: string) => void
}

export function VoiceRoomModelChip({
  value,
  onChange,
}: VoiceRoomModelChipProps) {
  const t = useTranslations('VoiceRoom')
  const { modelOptions } = useAudioModelOptionsFor(AUDIO_KIND.SPEECH, value)

  /*
   * ⚠ 还没选过时显示**第一个可用型号**，而不是「选择模型」。
   *
   * 服务端在没收到 modelId 时挑的就是这一个（`resolveAudioModelId`），顶栏写
   * 「选择模型」等于告诉用户「还没定」——可他一按生成就出声了。两边用同一条规则
   * 挑，界面上说的才是实话。这里只影响显示，不往 state 里写。
   */
  const shown = value ?? modelOptions[0]?.optionId ?? null

  return (
    <ModelPickerPopover
      options={modelOptions}
      value={shown}
      // 五处宿主同一颗触发器、同一个弹层（D2 ④）——⛔ 不在配音间另调形状。
      memoryScope="audio"
      side="bottom"
      onChange={(option) => onChange(option.optionId, option.modelId)}
      triggerEmptyLabel={t('pickModel')}
    />
  )
}
