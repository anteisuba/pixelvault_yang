'use client'

import { memo } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

import { StudioCardSection } from './StudioCardSection'
import { StudioPromptArea } from './StudioPromptArea'
import { StudioToolbarPanels } from './StudioToolbarPanels'
import { StudioDockPanelArea } from './StudioDockPanelArea'

/**
 * StudioBottomDock — Left-right split layout.
 * Desktop: 60%/40% grid with inline panel area.
 * Mobile: full-width controls, panel opens as bottom drawer.
 */
export const StudioBottomDock = memo(function StudioBottomDock() {
  const { state, dispatch } = useStudioForm()
  const isMobile = useIsMobile()

  const hasOpenPanel =
    state.panels.enhance ||
    state.panels.advanced ||
    state.panels.civitai ||
    state.panels.refImage ||
    state.panels.reverse ||
    state.panels.layerDecompose ||
    state.panels.aspectRatio ||
    state.panels.voiceSelector ||
    state.panels.voiceTrainer ||
    state.panels.videoParams ||
    state.panels.script

  const closeAllPanels = () => dispatch({ type: 'CLOSE_ALL_PANELS' })

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
      </div>
    )
  }

  // ── Desktop: 60%/40% grid layout ──────────────────────────────────
  return (
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
  )
})
