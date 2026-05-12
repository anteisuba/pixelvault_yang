'use client'

import { useEffect } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import { WORKFLOWS, type WorkflowMediaGroup } from '@/constants/workflows'

interface StudioModeSyncProps {
  mode: WorkflowMediaGroup
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
export function StudioModeSync({ mode }: StudioModeSyncProps) {
  const { state, dispatch } = useStudioForm()

  useEffect(() => {
    if (state.outputType === mode) return
    const target = WORKFLOWS.find((w) => w.mediaGroup === mode)
    if (target) {
      // Close anything left open from the previous mode before switching
      // — keeping panels open across image/video/audio swaps surfaces
      // mode-specific dialogs (videoParams, voiceSelector, …) at the
      // wrong time. The provider is shared across the workspace layout,
      // so this dispatch is the only place that knows the user changed
      // canvases.
      dispatch({ type: 'CLOSE_ALL_PANELS' })
      dispatch({ type: 'SET_SELECTED_WORKFLOW_ID', payload: target.id })
    }
  }, [mode, state.outputType, dispatch])

  return null
}
