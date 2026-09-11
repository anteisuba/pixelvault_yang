'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { deferEffectTask } from '@/lib/defer-effect-task'
import {
  createProjectRuleAPI,
  deleteProjectRuleAPI,
  listProjectRulesAPI,
} from '@/lib/api-client'
import type {
  CreateProjectRuleInput,
  ProjectRule,
} from '@/types/assistant-persona'

/**
 * 项目规则的读写（`docs/references/pages/assistant-shell.md` §10，拍板 23）。
 *
 * ⚠ `scope` 给了就拿**该域的 + 全域的**（服务端那一侧的判据），⛔ 别在这里再滤
 * 一遍：滤两遍的下场是「全域规则在工作台上看不见」，而那正是它存在的意义。
 */

export interface UseProjectRulesValue {
  rules: ProjectRule[]
  isLoading: boolean
  error: string | null
  add(input: CreateProjectRuleInput): Promise<boolean>
  remove(ruleId: string): Promise<boolean>
  reload(): Promise<void>
}

export function useProjectRules(
  options: { scope?: string; enabled?: boolean } = {},
): UseProjectRulesValue {
  const { scope } = options
  const enabled = options.enabled ?? true
  const [rules, setRules] = useState<ProjectRule[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    const result = await listProjectRulesAPI(scope)
    if (!aliveRef.current) return
    setIsLoading(false)
    if (result.success) {
      setRules(result.data)
      setError(null)
      return
    }
    setError(result.error)
  }, [scope])

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

  const add = useCallback(async (input: CreateProjectRuleInput) => {
    const result = await createProjectRuleAPI(input)
    if (!aliveRef.current) return result.success
    if (result.success) {
      // 最新的在前 —— 与服务端的排序同一条，⛔ 别让本地列表与刷新后长得不一样。
      setRules((current) => [result.data, ...current])
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  const remove = useCallback(async (ruleId: string) => {
    const result = await deleteProjectRuleAPI(ruleId)
    if (!aliveRef.current) return result.success
    if (result.success) {
      setRules((current) => current.filter((rule) => rule.id !== ruleId))
      setError(null)
      return true
    }
    setError(result.error)
    return false
  }, [])

  return { rules, isLoading, error, add, remove, reload }
}
