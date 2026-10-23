'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createAssistantSkillAPI,
  deleteAssistantSkillAPI,
  listAssistantSkillsAPI,
  updateAssistantSkillAPI,
  updateBuiltinSkillAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type {
  AssistantSkillView,
  CreateAssistantSkillRequest,
  UpdateAssistantSkillRequest,
} from '@/types/assistant-skill'

/**
 * 「你的技能」的读写（助手第 7b 步）：设置里的「技能」页、输入框的「/」菜单都用它。
 *
 * 形状照抄 `use-assistant-memories.ts`（同一套 `deferEffectTask` + `aliveRef`）。
 * ⚠ 每次写服务端都回整套（内置 + 改版 + 你写的），直接换掉本地那份，⛔ 不自己拼。
 */

export interface AssistantSkillsFailure {
  message: string
  i18nKey?: string
}

type Result =
  | { success: true; data: AssistantSkillView[] }
  | { success: false; error: string; i18nKey?: string }

export interface UseAssistantSkillsValue {
  skills: AssistantSkillView[]
  isLoading: boolean
  error: AssistantSkillsFailure | null
  create(input: CreateAssistantSkillRequest): Promise<boolean>
  /** 你写的那份、或你那份内置改版（按表里那一行的 id）。 */
  update(id: string, input: UpdateAssistantSkillRequest): Promise<boolean>
  /** 删你写的；删内置改版 = 回到内置原样。 */
  remove(id: string): Promise<boolean>
  /** 内置的开 / 关。 */
  setBuiltinEnabled(slug: string, enabled: boolean): Promise<boolean>
  /** 「改成我的版本」。 */
  overrideBuiltin(
    slug: string,
    input: { body: string; description: string },
  ): Promise<boolean>
  reload(): Promise<void>
}

export function useAssistantSkills(
  options: { enabled?: boolean } = {},
): UseAssistantSkillsValue {
  const enabled = options.enabled ?? true
  const [skills, setSkills] = useState<AssistantSkillView[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<AssistantSkillsFailure | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const apply = useCallback((result: Result): boolean => {
    if (!aliveRef.current) return result.success
    if (result.success) {
      setSkills(result.data)
      setError(null)
      return true
    }
    setError({
      message: result.error,
      ...(result.i18nKey ? { i18nKey: result.i18nKey } : {}),
    })
    return false
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    const result = await listAssistantSkillsAPI()
    if (!aliveRef.current) return
    setIsLoading(false)
    apply(result)
  }, [apply])

  useEffect(() => {
    if (!enabled) return
    return deferEffectTask(() => {
      void reload()
    })
  }, [enabled, reload])

  const create = useCallback(
    async (input: CreateAssistantSkillRequest) =>
      apply(await createAssistantSkillAPI(input)),
    [apply],
  )

  const update = useCallback(
    async (id: string, input: UpdateAssistantSkillRequest) =>
      apply(await updateAssistantSkillAPI(id, input)),
    [apply],
  )

  const remove = useCallback(
    async (id: string) => {
      const result = await deleteAssistantSkillAPI(id)
      if (!result.success) return apply(result)
      await reload()
      return true
    },
    [apply, reload],
  )

  const setBuiltinEnabled = useCallback(
    async (slug: string, value: boolean) =>
      apply(await updateBuiltinSkillAPI({ slug, enabled: value })),
    [apply],
  )

  const overrideBuiltin = useCallback(
    async (slug: string, input: { body: string; description: string }) =>
      apply(await updateBuiltinSkillAPI({ slug, ...input })),
    [apply],
  )

  return {
    skills,
    isLoading,
    error,
    create,
    update,
    remove,
    setBuiltinEnabled,
    overrideBuiltin,
    reload,
  }
}
