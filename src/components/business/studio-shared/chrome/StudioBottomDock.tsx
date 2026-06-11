'use client'

import { memo, useCallback } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'

import { StudioCardSection } from '@/components/business/studio/StudioCardSection'
import { StudioKeepChangePanel } from '@/components/business/image/StudioKeepChangePanel'
import { StudioPromptArea } from '@/components/business/studio/StudioPromptArea'
import { StudioDockPanelArea } from '@/components/business/studio/StudioDockPanelArea'

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
 * StudioBottomDock — single-column dock that hosts the cards row, prompt
 * area, and toolbar pills. Toolbar panels (advanced, refImage, video
 * params, script, voice selector, voice trainer, layer decompose,
 * civitai) all open as Krea-style centred dialogs via StudioDockPanelArea;
 * the dock no longer splits into a 60/40 grid, and the mobile-only Drawer
 * is gone — one consistent floating-panel surface across breakpoints.
 */
export const StudioBottomDock = memo(function StudioBottomDock() {
  const { state, dispatch } = useStudioForm()
  // 软键盘弹起时把 sticky dock 抬到键盘上方（审查 C1）。无键盘时为 0，
  // 不产生 transform。
  const keyboardInset = useKeyboardInset()

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

  return (
    <>
      <div
        className="studio-dock"
        style={
          keyboardInset > 0
            ? { transform: `translateY(-${keyboardInset}px)` }
            : undefined
        }
      >
        <div className="space-y-2">
          {state.workflowMode === 'card' && state.outputType !== 'audio' && (
            <StudioCardSection />
          )}
          <StudioPromptArea />
        </div>
      </div>
      <StudioDockPanelArea />
      <StudioKeepChangePanel
        open={state.panels.keepChange}
        onOpenChange={(open) =>
          dispatch({
            type: open ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'keepChange',
          })
        }
        currentIntent={null}
        onSubmit={handleKeepChangeSubmit}
      />
    </>
  )
})
