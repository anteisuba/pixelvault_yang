'use client'

import { useEffect, useRef } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import {
  DEFAULT_PROMPT_DIALECT,
  type PromptDialect,
} from '@/constants/prompt-dialects'
import { WORKFLOWS, type WorkflowMediaGroup } from '@/constants/workflows'

interface StudioModeSyncProps {
  mode: WorkflowMediaGroup
  /**
   * 这一台说哪种提示词方言（D10 ⑤）。`/studio/image/tags` 报 `tags`，其余
   * 全部留在缺省的 `natural` —— 方言由**路由**说了算，⛔ 不由选中的模型反推。
   */
  dialect?: PromptDialect
}

/**
 * StudioModeSync — invisible side-effect emitter. The (workspace) route
 * group's layout owns the StudioProvider + the entire visible UI, so the
 * per-mode page can no longer pass `defaultMediaGroup` as a prop. Each
 * page renders `<StudioModeSync mode="image" | "video" | "audio" />`,
 * which dispatches `SET_SELECTED_WORKFLOW_ID` whenever the route mode
 * differs from the current `state.outputType`.
 *
 * Because the layout stays mounted across image ↔ video ↔ audio
 * navigations, the user perceives an instant switch — no remount, no
 * provider reset, no flash.
 */
export function StudioModeSync({
  mode,
  dialect = DEFAULT_PROMPT_DIALECT,
}: StudioModeSyncProps) {
  const { state, dispatch } = useStudioForm()
  /**
   * ⚠ **只在路由换了时对齐**，⛔ 不盯状态（拆分与反推实跑 09-24）：助手换到另一
   * 台的型号时先改状态、再推路由，中间这一拍盯状态会把它拨回旧台，默认型号那条
   * hook 随即把刚换的型号当成「跨台的陈旧选择」顶掉。
   */
  const syncedDialect = useRef<PromptDialect | null>(null)

  useEffect(() => {
    if (syncedDialect.current === dialect) return
    syncedDialect.current = dialect
    if (state.promptDialect === dialect) return
    dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
  }, [dialect, state.promptDialect, dispatch])

  useEffect(() => {
    if (state.outputType === mode) return
    const target = WORKFLOWS.find((w) => w.mediaGroup === mode)
    if (target) {
      // Route-level mode changes should land on the workspace itself, not
      // auto-open the mode's first configuration panel.
      dispatch({ type: 'CLOSE_ALL_PANELS' })
      dispatch({
        type: 'SET_SELECTED_WORKFLOW_ID',
        payload: target.id,
        openDefaultPanel: false,
      })
    }
  }, [mode, state.outputType, dispatch])

  return null
}
