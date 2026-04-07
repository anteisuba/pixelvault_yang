'use client'

import { memo } from 'react'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioToolbar } from '@/components/business/StudioToolbar'

/**
 * StudioToolbarRow — renders ONLY the toolbar button row.
 * Panel content is rendered by StudioPanelPopovers + StudioPanelSheets
 * outside the dock DOM flow (zero layout impact).
 */
export const StudioToolbarPanels = memo(function StudioToolbarPanels() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, promptEnhance, civitai } = useStudioData()
  const { isGenerating } = useStudioGen()

  return (
    <StudioToolbar
      onEnhance={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'enhance' })}
      isEnhancing={promptEnhance.isEnhancing}
      onReverse={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'reverse' })}
      onAdvanced={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'advanced' })}
      advancedOpen={state.panels.advanced}
      onReferenceImage={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'refImage' })
      }
      referenceImageCount={imageUpload.referenceImages.length}
      onLayerDecompose={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'layerDecompose' })
      }
      onAspectRatio={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'aspectRatio' })
      }
      aspectRatioOpen={state.panels.aspectRatio}
      onCivitaiToken={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'civitai' })
      }
      hasToken={civitai.hasToken}
      disabled={isGenerating}
    />
  )
})
