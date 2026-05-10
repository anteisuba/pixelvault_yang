'use client'

import { memo, useCallback } from 'react'

import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

import { StudioCardSection } from './StudioCardSection'
import { StudioKeepChangePanel } from './StudioKeepChangePanel'
import { StudioPanelDialogs } from './StudioPanelDialogs'
import { StudioPromptArea } from './StudioPromptArea'
import { StudioToolbarPanels } from './StudioToolbarPanels'
import { StudioDockPanelArea } from './StudioDockPanelArea'

function buildRefinePrompt(
  basePrompt: string,
  keepTags: string[],
  changeTags: string[],
  freeText: string,
): string {
  const keepText = keepTags.length > 0 ? `Keep ${keepTags.join(', ')}.` : ''
  const changeText =
    changeTags.length > 0 ? `Change ${changeTags.join(', ')}.` : ''
  const suffix = [keepText, changeText, freeText.trim()]
    .filter((part) => part.length > 0)
    .join(' ')
  const trimmedBase = basePrompt.trim()

  if (!suffix) return trimmedBase
  return trimmedBase ? `${trimmedBase}. ${suffix}` : suffix
}

/**
 * StudioBottomDock — Left-right split layout.
 * Desktop: 60%/40% grid with inline panel area.
 * Mobile: full-width controls, panel opens as bottom drawer.
 */
export const StudioBottomDock = memo(function StudioBottomDock() {
  const { state, dispatch } = useStudioForm()
  const { currentPlan } = useStudioGen()
  const isMobile = useIsMobile()

  // enhance / reverse / aspectRatio render in their own dialogs/popover
  // (StudioPanelDialogs, StudioAspectRatioPopover) and intentionally do
  // NOT trigger the dock's two-column layout.
  const hasOpenPanel =
    state.panels.advanced ||
    state.panels.civitai ||
    state.panels.refImage ||
    state.panels.layerDecompose ||
    state.panels.voiceSelector ||
    state.panels.voiceTrainer ||
    state.panels.videoParams ||
    state.panels.script

  const closeAllPanels = () => dispatch({ type: 'CLOSE_ALL_PANELS' })
  const handleKeepChangeSubmit = useCallback(
    (keepTags: string[], changeTags: string[], freeText: string) => {
      const refinedPrompt = buildRefinePrompt(
        state.prompt,
        keepTags,
        changeTags,
        freeText,
      )

      dispatch({ type: 'SET_PROMPT', payload: refinedPrompt })
      dispatch({ type: 'CLOSE_PANEL', payload: 'keepChange' })
      dispatch({ type: 'REQUEST_GENERATE' })
    },
    [dispatch, state.prompt],
  )

  const keepChangePanel = (
    <StudioKeepChangePanel
      open={state.panels.keepChange}
      onOpenChange={(open) =>
        dispatch({
          type: open ? 'OPEN_PANEL' : 'CLOSE_PANEL',
          payload: 'keepChange',
        })
      }
      currentIntent={currentPlan?.intent ?? null}
      onSubmit={handleKeepChangeSubmit}
    />
  )

  // ── Mobile: full-width dock + drawer for panels ───────────────────
  if (isMobile) {
    return (
      <div className="studio-dock">
        <div className="space-y-2">
          {state.workflowMode === 'card' && state.outputType !== 'audio' && (
            <StudioCardSection />
          )}
          <StudioPromptArea />
          <StudioToolbarPanels />
        </div>

        <Drawer
          open={hasOpenPanel}
          onOpenChange={(open) => {
            if (!open) closeAllPanels()
          }}
        >
          <DrawerContent className="max-h-[80vh]">
            <div className="overflow-y-auto px-4 pb-6 pt-2">
              <StudioDockPanelArea />
            </div>
          </DrawerContent>
        </Drawer>
        <StudioPanelDialogs />
        {keepChangePanel}
      </div>
    )
  }

  // ── Desktop: 60%/40% grid layout ──────────────────────────────────
  return (
    <>
      <div className="studio-dock">
        <div
          className="grid gap-4 transition-all duration-300"
          style={{
            gridTemplateColumns: hasOpenPanel ? '60% 1fr' : '1fr',
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Left: input controls */}
          <div className="space-y-2">
            {state.workflowMode === 'card' && state.outputType !== 'audio' && (
              <StudioCardSection />
            )}
            <StudioPromptArea />
            <StudioToolbarPanels />
          </div>

          {/* Right: tool panel — expands naturally, pushes history down */}
          {hasOpenPanel && <StudioDockPanelArea />}
        </div>
      </div>
      <StudioPanelDialogs />
      {keepChangePanel}
    </>
  )
})
