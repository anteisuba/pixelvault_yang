'use client'

import { useEffect } from 'react'

import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'
import {
  StudioCanvas,
  StudioBottomDock,
  StudioFlowLayout,
  StudioCommandPalette,
} from '@/components/business/studio'

import { useStudioForm } from '@/contexts/studio-context'
import { useStudioReplayFromUrl } from '@/hooks/use-studio-replay-from-url'

const STUDIO_MODE_KEY = 'studio-workflow-mode'

/**
 * StudioWorkspaceUI — the workspace's visual + non-mode-sync logic, lifted
 * out of the page level so the layout in (workspace)/layout.tsx can mount
 * it once and keep it mounted while the user flicks between
 * /studio/image, /studio/video, /studio/audio.
 *
 * The mode-sync side effect (dispatching SET_SELECTED_WORKFLOW_ID when the
 * route mode changes) lives in StudioModeSync — pages emit it; this
 * component never sees the prop.
 */
export function StudioWorkspaceUI() {
  const { state, dispatch } = useStudioForm()

  // Phase 1C: hydrate prompt / seed / negativePrompt / aspectRatio from
  // the URL on mount when the user arrived via "Use this image" replay.
  // LoRA `?style=` URL params are handled separately inside
  // `useActiveLoraStack`; together the two cover the full replay path.
  useStudioReplayFromUrl()

  // Restore workflow mode from localStorage on mount.
  // Also close any panels left open from the previous session — the
  // reducer's initialState keeps panels closed, but a stale tab restore
  // (or hot-reload in dev) can resurrect an open panel and pop a Dialog
  // the moment the user lands on /studio/{image,video,audio}.
  useEffect(() => {
    dispatch({ type: 'CLOSE_ALL_PANELS' })
    const saved = localStorage.getItem(STUDIO_MODE_KEY)
    if (saved === 'card' || saved === 'quick') {
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: saved })
    }

    const prefillPrompt = sessionStorage.getItem(
      STUDIO_PREFILL_PROMPT_STORAGE_KEY,
    )
    if (prefillPrompt) {
      dispatch({ type: 'SET_PROMPT', payload: prefillPrompt })
      sessionStorage.removeItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY)
      window.requestAnimationFrame(() => {
        document.getElementById('studio-prompt')?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        })
      })
    }
  }, [dispatch])

  // Persist workflow mode changes
  useEffect(() => {
    localStorage.setItem(STUDIO_MODE_KEY, state.workflowMode)
  }, [state.workflowMode])

  return (
    <>
      <a
        href="#studio-prompt"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to prompt
      </a>
      <div
        role="tabpanel"
        id={`studio-panel-${state.outputType}`}
        aria-labelledby={`studio-tab-${state.outputType}`}
        className="studio-layout-v2"
      >
        {/*
         * Unified canvas-centric layout for image / video / audio. The
         * inline gallery strip was removed in Phase 5.5d — users now
         * reach their archive through the Image chip popover's "Select
         * asset" path, which is also where reference images are picked.
         * Projects + API key management used to live in a Studio-local
         * sidebar but that sidebar had no trigger after the Phase 3.1
         * toggle removal — Projects moved to /assets and API keys to
         * the sidebar's Card section (single source of truth, no
         * duplicate entry in the top bar), so the workspace now renders
         * inside the (main) layout's SidebarProvider directly.
         */}
        <StudioFlowLayout
          canvas={<StudioCanvas />}
          dock={<StudioBottomDock />}
        />
      </div>

      <StudioCommandPalette />
    </>
  )
}
