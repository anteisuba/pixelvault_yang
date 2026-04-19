'use client'

import { memo } from 'react'
import {
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  Ratio,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'

import { useTranslations } from 'next-intl'

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
  const tBar = useTranslations('StudioToolbar')
  const tScript = useTranslations('VideoScript')

  // Video mode: show video-specific toolbar (enhance, refImage, aspectRatio, videoParams)
  if (state.outputType === 'video') {
    const pillBase =
      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors'
    const pillInactive =
      'border border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground'
    const pillActive = 'bg-primary/10 text-primary border border-primary/30'
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'enhance' })}
          disabled={isGenerating}
          className={cn(
            pillBase,
            state.panels.enhance ? pillActive : pillInactive,
            promptEnhance.isEnhancing && 'opacity-70',
          )}
        >
          <Sparkles className="size-3.5" />
          {tBar('enhance')}
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'TOGGLE_PANEL', payload: 'refImage' })
          }
          disabled={isGenerating}
          className={cn(
            pillBase,
            state.panels.refImage ? pillActive : pillInactive,
          )}
        >
          <ImageIcon className="size-3.5" />
          {tBar('reference')}
          {imageUpload.referenceImages.length > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-3xs text-primary">
              {imageUpload.referenceImages.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'TOGGLE_PANEL', payload: 'aspectRatio' })
          }
          disabled={isGenerating}
          className={cn(
            pillBase,
            state.panels.aspectRatio ? pillActive : pillInactive,
          )}
        >
          <Ratio className="size-3.5" />
          {state.aspectRatio}
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'TOGGLE_PANEL', payload: 'videoParams' })
          }
          disabled={isGenerating}
          className={cn(
            pillBase,
            state.panels.videoParams ? pillActive : pillInactive,
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          {tBar('video')}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_PANEL', payload: 'script' })}
          disabled={isGenerating}
          className={cn(
            pillBase,
            state.panels.script ? pillActive : pillInactive,
          )}
        >
          <FileText className="size-3.5" />
          {tScript('panelTitle')}
        </button>
      </div>
    )
  }

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
          {state.voiceId ? tBar('voiceSelected') : tBar('voice')}
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
          {tBar('clone')}
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
      onTransform={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'transform' })
      }
      transformOpen={state.panels.transform}
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
      quickMode={state.workflowMode === 'quick'}
    />
  )
})
