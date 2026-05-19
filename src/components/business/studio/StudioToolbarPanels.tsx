'use client'

import { memo, useCallback, useRef, useState } from 'react'
import {
  FileAudio2,
  FileText,
  Mic,
  Plus,
  SlidersHorizontal,
} from 'lucide-react'

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
import { StudioEnhanceButton } from './StudioEnhanceButton'

/**
 * StudioToolbarRow — renders ONLY the toolbar button row. Each interactive
 * tool (enhance, reverse, transform, cards, refImage, style, aspect ratio)
 * is now a self-contained Krea-style popover button anchored to its own
 * trigger; only inline panels (advanced, plan, civitai, layer decompose)
 * are still routed via dispatch + StudioDockPanelArea.
 */
export const StudioToolbarPanels = memo(function StudioToolbarPanels() {
  const { state, dispatch } = useStudioForm()
  const { civitai } = useStudioData()
  const { isGenerating, setCurrentPlan } = useStudioGen()
  const tBar = useTranslations('StudioToolbar')
  const tScript = useTranslations('VideoScript')
  const tV2 = useTranslations('StudioV2')

  // Same idea for aspect ratio: 3D models want a square source. Lock to 1:1
  // on enable, restore the user's previous AR on disable — but only if the
  // user is still on 1:1, so a manual change in between is respected.
  const previousAspectRatioRef = useRef<typeof state.aspectRatio | null>(null)

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
        toast.error(result.error ?? tV2('planFailed'))
      }
    } finally {
      setIsPlanning(false)
    }
  }, [isPlanning, state.prompt, tV2, setCurrentPlan, dispatch])

  // 3D Ready: wrap the user's prompt with a Hunyuan3D / TripoSR-friendly
  // template. The marker `[3D-READY]` lets us avoid double-wrapping when
  // the user clicks twice; if the marker is already present, we strip it.
  // Defined BEFORE the early returns below — React rules-of-hooks
  // forbids calling hooks after a conditional return.
  const handleMake3DReady = useCallback(() => {
    const marker = '[3D-READY]'
    const template = tBar('make3DReadyTemplate')
    const current = state.prompt

    if (current.includes(marker)) {
      // ── DISABLE ──
      const stripped = current
        .replace(`\n\n${marker}\n${template}`, '')
        .replace(`${marker}\n${template}`, '')
        .replace(marker, '')
        .trim()
      dispatch({ type: 'SET_PROMPT', payload: stripped })

      // Same logic for aspect ratio: only restore if the user is still on
      // 1:1 (the lock we set), otherwise they changed it manually and we
      // shouldn't undo their choice.
      const prevAspectRatio = previousAspectRatioRef.current
      previousAspectRatioRef.current = null
      if (
        prevAspectRatio &&
        prevAspectRatio !== '1:1' &&
        state.aspectRatio === '1:1'
      ) {
        dispatch({ type: 'SET_ASPECT_RATIO', payload: prevAspectRatio })
      }

      toast.info(tBar('make3DReadyOff'))
      return
    }

    // ── ENABLE ──
    const subject = current.trim()
    const wrapped = subject
      ? `${subject}\n\n${marker}\n${template}`
      : `${marker}\n${template}`
    dispatch({ type: 'SET_PROMPT', payload: wrapped })

    // Lock aspect ratio to 1:1 (3D pipeline only consumes square sources).
    // Remember the prior AR only when it wasn't already 1:1 — otherwise
    // disable doesn't need to swap back.
    if (state.aspectRatio !== '1:1') {
      previousAspectRatioRef.current = state.aspectRatio
      dispatch({ type: 'SET_ASPECT_RATIO', payload: '1:1' })
    } else {
      previousAspectRatioRef.current = null
    }

    toast.success(tBar('make3DReadyOn'))
  }, [state.prompt, state.aspectRatio, dispatch, tBar])

  // Video mode: show video-specific toolbar (enhance, refImage, aspectRatio, videoParams)
  if (state.outputType === 'video') {
    const pillBase =
      'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors'
    const pillInactive =
      'border border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground'
    const pillActive = 'bg-primary/10 text-primary border border-primary/30'
    return (
      // Wrap in Toolbar.Root so the shared chips (ReferenceImageChip,
      // StudioAspectRatioPopover, StudioEnhanceButton) — which use Radix
      // Toolbar.Button under the hood — can find their roving-focus
      // context. Plain `button` children stay valid inside Toolbar.Root.
      <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
        <StudioEnhanceButton disabled={isGenerating} />
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
          <SlidersHorizontal className="size-4" />
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
          <FileText className="size-4" />
          {tScript('panelTitle')}
        </button>
      </Toolbar.Root>
    )
  }

  // Audio mode: show audio-specific toolbar
  if (state.outputType === 'audio') {
    const pillBase =
      'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors'
    const pillInactive =
      'border border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground'
    const pillActive = 'bg-primary/10 text-primary border border-primary/30'
    return (
      // Wrap in Toolbar.Root for StudioEnhanceButton (Toolbar.Button under
      // the hood); plain `button` children remain valid inside.
      <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
        <StudioEnhanceButton disabled={isGenerating} />
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
          <Mic className="size-4" />
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
          <Plus className="size-4" />
          {tBar('clone')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (state.panels.voiceSelector) {
              dispatch({ type: 'CLOSE_PANEL', payload: 'voiceSelector' })
            }
            if (state.panels.voiceTrainer) {
              dispatch({ type: 'CLOSE_PANEL', payload: 'voiceTrainer' })
            }
            dispatch({ type: 'TOGGLE_PANEL', payload: 'audioTranscribe' })
          }}
          disabled={isGenerating}
          className={cn(
            pillBase,
            state.panels.audioTranscribe ? pillActive : pillInactive,
          )}
        >
          <FileAudio2 className="size-4" />
          {tBar('transcribe')}
        </button>
      </Toolbar.Root>
    )
  }

  return (
    <StudioToolbar
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
      onMake3DReady={handleMake3DReady}
      make3DReadyActive={state.prompt.includes('[3D-READY]')}
      disabled={isGenerating}
      quickMode={state.workflowMode === 'quick'}
    />
  )
})
