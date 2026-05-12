'use client'

import { memo, useCallback, useState } from 'react'
import { FileText, Mic, Plus, SlidersHorizontal, Sparkles } from 'lucide-react'

import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'
import { toast } from 'sonner'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioToolbar } from '@/components/business/StudioToolbar'
import { fetchGenerationPlanAPI } from '@/lib/api-client/generation'
import { cn } from '@/lib/utils'

import { ReferenceImageChip } from './ReferenceImageChip'
import { StudioAspectRatioPopover } from './StudioAspectRatioPopover'

/**
 * StudioToolbarRow — renders ONLY the toolbar button row.
 * Panel content is rendered by StudioDockPanelArea (inline panels) and
 * StudioPanelDialogs (enhance / reverse / transform modals) — see
 * StudioBottomDock for the actual mounts.
 */
export const StudioToolbarPanels = memo(function StudioToolbarPanels() {
  const { state, dispatch } = useStudioForm()
  const { promptEnhance, civitai } = useStudioData()
  const { isGenerating, setCurrentPlan } = useStudioGen()
  const tBar = useTranslations('StudioToolbar')
  const tScript = useTranslations('VideoScript')
  const tV2 = useTranslations('StudioV2')

  const [isPlanning, setIsPlanning] = useState(false)
  // Plan flow is opt-in from the toolbar (image quick-mode only). It asks
  // the AI to suggest models / compile a prompt / estimate cost; the user
  // then confirms or discards in the plan dialog. Manually picking a model
  // and clicking Generate skips this entirely (see StudioPromptArea).
  const handleOpenPlan = useCallback(async () => {
    if (isPlanning) return
    const prompt = state.prompt.trim()
    if (!prompt) {
      toast.info(tV2('planNeedsPrompt'))
      return
    }
    setIsPlanning(true)
    try {
      const result = await fetchGenerationPlanAPI({ naturalLanguage: prompt })
      if (result.success && result.data) {
        setCurrentPlan(result.data)
        dispatch({ type: 'OPEN_PANEL', payload: 'planPreview' })
      } else {
        toast.error(result.error ?? 'Failed to generate plan')
      }
    } finally {
      setIsPlanning(false)
    }
  }, [isPlanning, state.prompt, tV2, setCurrentPlan, dispatch])

  // Video mode: show video-specific toolbar (enhance, refImage, aspectRatio, videoParams)
  if (state.outputType === 'video') {
    const pillBase =
      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors'
    const pillInactive =
      'border border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground'
    const pillActive = 'bg-primary/10 text-primary border border-primary/30'
    return (
      // Wrap in Toolbar.Root so the shared chips (ReferenceImageChip,
      // StudioAspectRatioPopover) — which use Radix Toolbar.Button under
      // the hood — can find their roving-focus context. Plain `button`
      // children stay valid inside Toolbar.Root.
      <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
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
        {/* Reference image: same Krea-style chip as image mode (upload + select asset popover). */}
        <ReferenceImageChip disabled={isGenerating} />
        {/* Aspect ratio: same popover as image mode — video-specific ratios are picked inside the popover based on outputType. */}
        <StudioAspectRatioPopover disabled={isGenerating} />
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
      </Toolbar.Root>
    )
  }

  // Audio mode: show audio-specific toolbar
  if (state.outputType === 'audio') {
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
          disabled={isGenerating || promptEnhance.isEnhancing}
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
          onClick={() => {
            if (state.panels.voiceTrainer) {
              dispatch({ type: 'CLOSE_PANEL', payload: 'voiceTrainer' })
            }
            dispatch({ type: 'TOGGLE_PANEL', payload: 'voiceSelector' })
          }}
          disabled={isGenerating}
          className={cn(
            pillBase,
            state.panels.voiceSelector ? pillActive : pillInactive,
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
            pillBase,
            state.panels.voiceTrainer ? pillActive : pillInactive,
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
      onTransform={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'transform' })
      }
      transformOpen={state.panels.transform}
      onPlan={handleOpenPlan}
      planLoading={isPlanning}
      planActive={state.panels.planPreview}
      onLayerDecompose={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'layerDecompose' })
      }
      onCivitaiToken={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'civitai' })
      }
      hasToken={civitai.hasToken}
      disabled={isGenerating}
      quickMode={state.workflowMode === 'quick'}
    />
  )
})
