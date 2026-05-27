'use client'

import { memo } from 'react'
import {
  FileAudio2,
  FileText,
  Mic,
  Plus,
  SlidersHorizontal,
} from 'lucide-react'

import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioToolbar } from '@/components/business/StudioToolbar'
import { cn } from '@/lib/utils'

import { ReferenceImageChip } from './ReferenceImageChip'
import { StudioAspectRatioPopover } from './StudioAspectRatioPopover'
import { StudioEnhanceButton } from './StudioEnhanceButton'

interface StudioToolbarPanelsProps {
  compact?: boolean
}

/**
 * StudioToolbarRow — renders ONLY the toolbar button row. Each interactive
 * tool (enhance, reverse, transform, cards, refImage, style, aspect ratio)
 * is now a self-contained Krea-style popover button anchored to its own
 * trigger; only inline panels (advanced, civitai, layer decompose)
 * are still routed via dispatch + StudioDockPanelArea.
 */
export const StudioToolbarPanels = memo(function StudioToolbarPanels({
  compact = false,
}: StudioToolbarPanelsProps) {
  const { state, dispatch } = useStudioForm()
  const { civitai } = useStudioData()
  const { isGenerating } = useStudioGen()
  const tBar = useTranslations('StudioToolbar')
  const tScript = useTranslations('VideoScript')

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
      <Toolbar.Root className={cn('flex items-center gap-1.5', 'flex-wrap')}>
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
      <Toolbar.Root className={cn('flex items-center gap-1.5', 'flex-wrap')}>
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

  // Active = non-default seed / negative present. Drives the toolbar pill
  // highlight so users notice when they're on dialled-in settings vs
  // pristine defaults — important once Phase 1B's "use same seed"
  // actions start writing seed into advancedParams without opening the
  // panel themselves.
  const advancedActive = Boolean(
    (typeof state.advancedParams.seed === 'number' &&
      state.advancedParams.seed >= 0) ||
    (state.advancedParams.negativePrompt &&
      state.advancedParams.negativePrompt.trim().length > 0),
  )

  return (
    <StudioToolbar
      onLayerDecompose={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'layerDecompose' })
      }
      onCivitaiToken={() =>
        dispatch({ type: 'TOGGLE_PANEL', payload: 'civitai' })
      }
      onAdvanced={
        state.outputType === 'image'
          ? () => dispatch({ type: 'TOGGLE_PANEL', payload: 'advanced' })
          : undefined
      }
      advancedActive={advancedActive}
      hasToken={civitai.hasToken}
      disabled={isGenerating}
      quickMode={state.workflowMode === 'quick'}
      compact={compact}
    />
  )
})
