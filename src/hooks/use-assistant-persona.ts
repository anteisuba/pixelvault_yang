'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ASSISTANT_PERSONA_DEFAULTS } from '@/constants/assistant-persona'
import { deferEffectTask } from '@/lib/defer-effect-task'
import {
  getAssistantPersonaAPI,
  removeAssistantAvatarAPI,
  updateAssistantPersonaAPI,
  uploadAssistantAvatarAPI,
} from '@/lib/api-client'
import type {
  AssistantPersona,
  UpdateAssistantPersonaRequest,
} from '@/types/assistant-persona'

/**
 * 助手设置（persona）的读 / 写 / 传头像
 * （`docs/references/pages/assistant-shell.md` §8）。
 *
 * ⚠ **初值不是 null 而是默认值**：库里没有那一行时服务返回的就是
 * `ASSISTANT_PERSONA_DEFAULTS`，所以对话框在拉到数据之前也能画出正确的初始态 ——
 * ⛔ 不做「加载中什么都不显示」的空窗（那一格永远是同一份默认值）。
 */

const DEFAULT_PERSONA: AssistantPersona = {
  ...ASSISTANT_PERSONA_DEFAULTS,
  avatarUrl: null,
}

export interface UseAssistantPersonaValue {
  persona: AssistantPersona
  isLoading: boolean
  isSaving: boolean
  error: string | null
  /** 保存即写（§8.1）。返回是否成功，失败时 `error` 上有话说。 */
  save(input: UpdateAssistantPersonaRequest): Promise<boolean>
  /** 传一张自定义头像；成功后 `persona.avatarUrl` 就地更新。 */
  uploadAvatar(imageData: string): Promise<boolean>
  /** 撤掉自定义头像，退回预设。 */
  removeAvatar(): Promise<boolean>
  reload(): Promise<void>
}

export function useAssistantPersona(
  options: { enabled?: boolean } = {},
): UseAssistantPersonaValue {
  const enabled = options.enabled ?? true
  const [persona, setPersona] = useState<AssistantPersona>(DEFAULT_PERSONA)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 组件卸载之后别再 setState —— 对话框是关掉就走的那种。 */
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    const result = await getAssistantPersonaAPI()
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setPersona(result.data)
      setError(null)
      return
    }
    setError(result.error)
  }, [])

  /**
   * ⚠ 走 `deferEffectTask`：React 19 的 lint 不允许在 effect 体里同步启动会
   * setState 的活（`react-hooks/set-state-in-effect`）。全仓既有 hook 都是这个
   * 形状（`use-collections.ts` 等），⛔ 别在这里另发明一套。
   */
  useEffect(() => {
    if (!enabled) return
    return deferEffectTask(() => {
      void reload()
    })
  }, [enabled, reload])

  const save = useCallback(async (input: UpdateAssistantPersonaRequest) => {
    setIsSaving(true)
    const result = await updateAssistantPersonaAPI(input)
    if (!aliveRef.current) return result.success
    setIsSaving(false)
    if (result.success) {
      setPersona(result.data)
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  const uploadAvatar = useCallback(async (imageData: string) => {
    setIsSaving(true)
    const result = await uploadAssistantAvatarAPI(imageData)
    if (!aliveRef.current) return result.success
    setIsSaving(false)
    if (result.success) {
      setPersona((current) => ({ ...current, avatarUrl: result.data.url }))
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  const removeAvatar = useCallback(async () => {
    setIsSaving(true)
    const result = await removeAssistantAvatarAPI()
    if (!aliveRef.current) return result.success
    setIsSaving(false)
    if (result.success) {
      setPersona((current) => ({ ...current, avatarUrl: null }))
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  return {
    persona,
    isLoading,
    isSaving,
    error,
    save,
    uploadAvatar,
    removeAvatar,
    reload,
  }
}
