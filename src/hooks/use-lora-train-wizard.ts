'use client'

import { useCallback, useRef, useState } from 'react'

import type { LoraTrainingPresetId } from '@/constants/lora'

/**
 * 训练向导的步骤状态（进度表 34 · 从 `LoraWorkbench` 物理拆出）。
 *
 * ⚠ 向导只持有**步骤之间**的那一点状态 —— 选中的预设，以及「把人送回第 1 步」
 * 这个动作。上传、配置、提交与任务轮询整套状态机住在 `LoraTrainingForm` /
 * `LoraTrainingHistorySidebar` 里，⛔ 不在这里复刻一份：两份同名状态会各自漂移，
 * 而真正决定提交 payload 的永远是表单那一份。
 */
export interface LoraTrainWizardState {
  /** 选中的预设，`null` = 还没挑（表单走空态）。 */
  presetId: LoraTrainingPresetId | null
  /** 第 1 步那张预设卡 —— 空态的「挑一个预设」要把视口送回它。 */
  presetPanelRef: React.RefObject<HTMLDivElement | null>
  selectPreset: (preset: { id: LoraTrainingPresetId }) => void
  clearPreset: () => void
  /**
   * 空态里的「挑一个预设」：表单在第 2 步、预设卡在第 1 步，不滚回去的话，
   * 空态一收表单就摊开，而第 1 步反而被越过去了。
   */
  requestPreset: () => void
}

export function useLoraTrainWizard(): LoraTrainWizardState {
  const [presetId, setPresetId] = useState<LoraTrainingPresetId | null>(null)
  const presetPanelRef = useRef<HTMLDivElement>(null)

  const requestPreset = useCallback(() => {
    presetPanelRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [])

  const selectPreset = useCallback((preset: { id: LoraTrainingPresetId }) => {
    setPresetId(preset.id)
  }, [])

  const clearPreset = useCallback(() => {
    setPresetId(null)
  }, [])

  return {
    presetId,
    presetPanelRef,
    selectPreset,
    clearPreset,
    requestPreset,
  }
}
