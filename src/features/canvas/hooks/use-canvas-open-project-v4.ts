'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

import {
  CANVAS_NEW_PROJECT_QUERY_VALUE,
  STUDIO_CHARACTER_QUERY,
} from '@/constants/routes'
import { settleOperatorBenchOpenProject } from '@/hooks/use-studio-operator-store'

/**
 * **助手开台开到画布**（第 9e 步）：地址带 `?project=<id|new>`（没有 `character`）时切到那块画布
 * （`new` = 新建一块；那块已经没了就留在眼前这块），切好之后把真正的项目号交回开台那一格（新台的
 * 面板认它才接着跑），再把参数从地址栏拿掉 —— 刷新不再触发。
 * ⚠ 带 `character` 的是角色页「放进画布」那条深链，画布自己那段处理，这里不碰。
 */
export interface UseCanvasOpenProjectV4Options {
  readonly isHydrated: boolean
  readonly currentProjectId: string
  readonly projectIds: readonly string[]
  switchProject(id: string): void
  createProject(name: string): string
  /** 新建画布时的名字。 */
  readonly newProjectName: string
}

export function useCanvasOpenProjectV4({
  isHydrated,
  currentProjectId,
  projectIds,
  switchProject,
  createProject,
  newProjectName,
}: UseCanvasOpenProjectV4Options): void {
  const searchParams = useSearchParams()
  const requested = searchParams.get('project')
  const withCharacter = searchParams.has(STUDIO_CHARACTER_QUERY)
  /** 这一次处理到哪了（按请求的值记：清参数后 `useSearchParams` 晚一拍才变）。 */
  const handledRef = useRef<{
    key: string
    target: string | null
    done: boolean
  } | null>(null)

  useEffect(() => {
    if (!isHydrated || !requested || withCharacter) return
    if (handledRef.current?.key !== requested)
      handledRef.current = { key: requested, target: null, done: false }
    const handled = handledRef.current
    if (handled.done) return
    if (handled.target === null) {
      if (requested === CANVAS_NEW_PROJECT_QUERY_VALUE) {
        handled.target = createProject(newProjectName)
        return
      }
      handled.target = projectIds.includes(requested)
        ? requested
        : currentProjectId
      if (currentProjectId !== handled.target) {
        switchProject(handled.target)
        return
      }
    }
    if (currentProjectId !== handled.target) return
    handled.done = true
    settleOperatorBenchOpenProject(handled.target)
    const rest = new URLSearchParams(searchParams.toString())
    rest.delete('project')
    const query = rest.toString()
    window.history.replaceState(
      null,
      '',
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    )
  }, [
    createProject,
    currentProjectId,
    isHydrated,
    newProjectName,
    projectIds,
    requested,
    searchParams,
    switchProject,
    withCharacter,
  ])
}
