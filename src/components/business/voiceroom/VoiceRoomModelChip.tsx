'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { AUDIO_KIND } from '@/constants/audio-options'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { BaseModelPickerPanel } from '@/components/business/studio-shared/pickers/BaseModelPickerPanel'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { useAudioModelOptionsFor } from '@/hooks/use-audio-model-options'

/**
 * 房间顶栏的模型入口。
 *
 * 它主要不是「换模型」——语音档目录里长期只有一个可用型号。它真正的职责是
 * **把缺 API key 这件事变成一条能走通的路**（Hard Rule 8：缺 key 时不禁用 UI，
 * 路由到 `QuickSetupDialog` 内联配置）。在此之前，配音间没有任何地方能配 key，
 * 没配的人只会看到一句失败提示然后无路可走。
 *
 * ⚠ 用 `BaseModelPickerPanel` 而不是 `MainModelPicker`：后者内部调
 * `useAudioModelOptions()`，那个 hook 读 `useStudioForm()`——配音间**故意**住在
 * 工作台路由组外面，没有 `StudioProvider`。所以清单从
 * `useAudioModelOptionsFor()`（同一份实现的无上下文内核）取，面板还是那一个共享
 * 面板，皮肤与行为不分叉。
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
  const [setupFor, setSetupFor] = useState<StudioModelOption | null>(null)

  /*
   * ⚠ 还没选过时显示**第一个可用型号**，而不是「选择模型」。
   *
   * 服务端在没收到 modelId 时挑的就是这一个（`resolveAudioModelId`），顶栏写
   * 「选择模型」等于告诉用户「还没定」——可他一按生成就出声了。两边用同一条规则
   * 挑，界面上说的才是实话。这里只影响显示，不往 state 里写。
   */
  const shown = value ?? modelOptions[0]?.optionId ?? null

  return (
    <>
      <BaseModelPickerPanel
        options={modelOptions}
        value={shown}
        // 与图片 / 视频 / 音频工作台同一套三栏（`StudioPromptArea` 也传这个）。
        // 不传就退回 drill 那套单列下钻，和别处长得不一样。
        layout="columns"
        size="compact"
        popoverSide="bottom"
        onChange={(option) => onChange(option.optionId, option.modelId)}
        onRequestSetup={setSetupFor}
        triggerEmptyLabel={t('pickModel')}
      />

      {setupFor ? (
        <QuickSetupDialog
          open
          onOpenChange={(next) => {
            if (!next) setSetupFor(null)
          }}
          modelId={setupFor.modelId}
          modelLabel={setupFor.modelId}
          adapterType={setupFor.adapterType}
          optionId={setupFor.optionId}
          onVerified={() => {
            // 配好就直接用上它——不然用户得再点一次那个刚刚还锁着的条目。
            onChange(setupFor.optionId, setupFor.modelId)
            setSetupFor(null)
          }}
        />
      ) : null}
    </>
  )
}
