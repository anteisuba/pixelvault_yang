'use client'

import { memo } from 'react'
import { Mic, Plus, SlidersHorizontal } from 'lucide-react'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioToolbar } from '@/components/business/StudioToolbar'
import { cn } from '@/lib/utils'

/**
 * StudioToolbarRow — renders ONLY the toolbar button row.
 * Panel content is rendered by StudioPanelPopovers + StudioPanelSheets
 * outside the dock DOM flow (zero layout impact).
 */
export const StudioToolbarPanels = memo(function StudioToolbarPanels() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, promptEnhance, civitai } = useStudioData()
  const { isGenerating } = useStudioGen()

  // Audio mode: show audio-specific toolbar
  if (state.outputType === 'audio') {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (state.panels.voiceTrainer) {
              dispatch({ type: 'CLOSE_PANEL', payload: 'voiceTrainer' })
            }
            dispatch({ type: 'TOGGLE_PANEL', payload: 'voiceSelector' })
          }}
          disabled={isGenerating}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            state.panels.voiceSelector
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'border border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
          )}
        >
          <Mic className="size-3.5" />
          {state.voiceId ? '✓ Voice' : 'Voice'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (state.panels.voiceSelector) {
              dispatch({ type: 'CLOSE_PANEL', payload: 'voiceSelector' })
            }
            dispatch({ type: 'TOGGLE_PANEL', payload: 'voiceTrainer' })
          }}
          disabled={isGenerating}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            state.panels.voiceTrainer
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'border border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
          )}
        >
          <Plus className="size-3.5" />
          Clone
        </button>
      </div>
    )
  }

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
