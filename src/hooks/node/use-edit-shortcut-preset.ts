'use client'

/**
 * 剪辑台的**快捷键预设**（S8d · spec §6「快捷键」，画板 `EditDeskText.dc.html` 右下）。
 *
 * PR / FCP 二选一，记在 `localStorage`。
 *
 * ⚠ **不进 `EditProject`**：键位是这台机器上这个人的手感，时间线是项目内容 ——
 * 写进去等于让「我习惯 FCP」跟着项目同步给别人，还会进撤销栈（⌘Z 会把键位换回去，
 * 那是没有人能预料的一步）。与渲染任务的 jobId 同一条论据（`useEditDeskRender`）。
 *
 * ⚠ 初值**同步读**一次而不是先 default 再 effect 覆盖：晚一帧的话弹层刚打开的那
 * 一瞬间会显示 Premiere 然后跳成 Final Cut。
 */

import { useCallback, useState } from 'react'

import {
  EDIT_SHORTCUT_PRESETS,
  EDIT_SHORTCUT_PRESET_DEFAULT,
  EDIT_SHORTCUT_PRESET_STORAGE_KEY,
  type EditShortcutPresetId,
} from '@/constants/edit-desk'

function readPreset(): EditShortcutPresetId {
  try {
    const raw = window.localStorage.getItem(EDIT_SHORTCUT_PRESET_STORAGE_KEY)
    const known = EDIT_SHORTCUT_PRESETS.find(
      (candidate) => candidate === raw,
    )
    return known ?? EDIT_SHORTCUT_PRESET_DEFAULT
  } catch {
    // 隐私模式 / 存储被禁 —— 忘掉一个手感偏好不该让剪辑台打不开。
    return EDIT_SHORTCUT_PRESET_DEFAULT
  }
}

export interface EditShortcutPreset {
  readonly preset: EditShortcutPresetId
  setPreset(next: EditShortcutPresetId): void
}

export function useEditShortcutPreset(): EditShortcutPreset {
  const [preset, setPresetState] = useState<EditShortcutPresetId>(() =>
    typeof window === 'undefined' ? EDIT_SHORTCUT_PRESET_DEFAULT : readPreset(),
  )

  const setPreset = useCallback((next: EditShortcutPresetId) => {
    setPresetState(next)
    try {
      window.localStorage.setItem(EDIT_SHORTCUT_PRESET_STORAGE_KEY, next)
    } catch {
      // 同上：记不住就下次再选一次。
    }
  }, [])

  return { preset, setPreset }
}
