'use client'

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { studioImageEditPath } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import { fetchGenerationByIdAPI } from '@/lib/api-client'
import { buildStudioRemixPreset } from '@/lib/studio-remix'
import { evaluateGenerationAPI } from '@/lib/api-client/generation'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { cn } from '@/lib/utils'
import {
  applyAudioFeedbackTags,
  type AudioFeedbackTag,
} from '@/lib/studio/audio-feedback-mapping'
import type { GenerationRecord } from '@/types'

import { CompareGrid } from './CompareGrid'
import { GenerationPreview } from './GenerationPreview'
import { StudioAudioFeedback } from './StudioAudioFeedback'
import { StudioGenerationErrorDialog } from './StudioGenerationErrorDialog'
import { StudioResultFeedback } from './StudioResultFeedback'
import { VariantGrid } from './VariantGrid'

/**
 * StudioCanvas — central hero area for the canvas-centric layout.
 * Fills all vertical space between TopBar and BottomDock.
 * Delegates rendering to GenerationPreview (empty / loading / image / error).
 * Accepts gallery image drops — adds as reference and opens the ref panel.
 */
export const StudioCanvas = memo(function StudioCanvas() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const {
    lastGeneration: rawLastGeneration,
    error,
    retry,
    activeRun,
    selectWinner,
    lastEvaluation,
    setLastEvaluation,
    isGenerating,
  } = useStudioGen()
  const tAudioFeedback = useTranslations('audioFeedback')
  const [errorDismissed, setErrorDismissed] = useState<string | null>(null)
  const errorDialogOpen = !!error && error !== errorDismissed
  const { modelOptions } = useImageModelOptions()

  // Only show the latest generation if it matches the current output type.
  // Prevents Canvas from displaying an image result after user switches to
  // video/audio mode (and vice versa).
  const expectedOutputType =
    state.outputType === 'video'
      ? 'VIDEO'
      : state.outputType === 'audio'
        ? 'AUDIO'
        : 'IMAGE'
  const lastGeneration =
    rawLastGeneration && rawLastGeneration.outputType === expectedOutputType
      ? rawLastGeneration
      : null
  const lastGenerationRef = useRef<GenerationRecord | null>(null)

  useLayoutEffect(() => {
    lastGenerationRef.current = lastGeneration
  }, [lastGeneration])

  const handleSwitchModel = useCallback(() => {
    dispatch({ type: 'OPEN_PANEL', payload: 'modelSelector' })
  }, [dispatch])

  useEffect(() => {
    setLastEvaluation(null)
  }, [lastGeneration?.id, setLastEvaluation])

  const handleAudioFeedbackRetry = useCallback(
    (tags: AudioFeedbackTag[]) => {
      if (tags.length === 0 || isGenerating) return

      const patch = applyAudioFeedbackTags(tags, state)
      for (const action of patch.actions) {
        dispatch(action)
      }
      if (patch.openPanel) {
        dispatch({ type: 'OPEN_PANEL', payload: patch.openPanel })
        // `voice_mismatch` defers to the user — they must pick a new voice
        // before the next generation can apply. Skip the auto-regenerate so
        // we don't run with the stale voice.
        return
      }
      if (patch.pronunciationHint) {
        toast.info(tAudioFeedback('retryPronunciationHint'))
      }
      dispatch({ type: 'REQUEST_GENERATE' })
    },
    [dispatch, isGenerating, state, tAudioFeedback],
  )

  const handleFeedback = useCallback(
    (tags: string[]) => {
      if (!lastGeneration) return

      if (tags.includes('satisfied')) {
        if (lastEvaluation !== null) return

        const requestedGenerationId = lastGeneration.id
        void evaluateGenerationAPI(requestedGenerationId).then((result) => {
          if (lastGenerationRef.current?.id !== requestedGenerationId) {
            return
          }

          if (result.success && result.data) {
            setLastEvaluation(result.data)
          }
        })
        return
      }

      if (tags.length > 0) {
        dispatch({ type: 'OPEN_PANEL', payload: 'keepChange' })
      }
    },
    [dispatch, lastEvaluation, lastGeneration, setLastEvaluation],
  )

  // ── Drop target: gallery images → open reference panel (Pragmatic DnD) ──
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === 'studio-generation',
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false)
        const url = source.data.url as string
        if (url) {
          void imageUpload.addFromUrl(url).then(() => {
            document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)?.focus()
          })
        }
      },
    })
  }, [imageUpload])

  const handleUseAsReference = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)?.focus()
    },
    [imageUpload],
  )

  const handleRemix = useCallback(
    (generation: GenerationRecord) => {
      const preset = buildStudioRemixPreset(generation, modelOptions)
      // Preserve source outputType so remixing a video/audio stays in that mode
      const sourceOutputType =
        generation.outputType === 'VIDEO'
          ? 'video'
          : generation.outputType === 'AUDIO'
            ? 'audio'
            : 'image'
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: sourceOutputType })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
      dispatch({ type: 'SET_PROMPT', payload: preset.prompt })
      dispatch({ type: 'SET_ASPECT_RATIO', payload: preset.aspectRatio })
      dispatch({ type: 'CLOSE_ALL_PANELS' })
      if (preset.optionId) {
        dispatch({ type: 'SET_OPTION_ID', payload: preset.optionId })
      }
      if (
        preset.advancedParams &&
        Object.keys(preset.advancedParams).length > 0
      ) {
        dispatch({
          type: 'SET_ADVANCED_PARAMS',
          payload: preset.advancedParams,
        })
      }
      const promptField = document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)
      if (promptField instanceof HTMLTextAreaElement) {
        promptField.focus()
      }
    },
    [dispatch, modelOptions],
  )

  // Bootstrap remix from `/studio/<mode>?remix=<id>` — the /assets detail
  // sheet links here when the user clicks "Remix in Studio". We fetch
  // the full row (including snapshot, which the slim /api/images list
  // intentionally excludes) before invoking handleRemix, then strip the
  // query param so a refresh doesn't re-apply.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const remixHandledRef = useRef<string | null>(null)
  useEffect(() => {
    const remixId = searchParams.get('remix')
    if (!remixId || remixHandledRef.current === remixId) return
    if (modelOptions.length === 0) return // wait until model list is ready
    remixHandledRef.current = remixId
    void (async () => {
      const response = await fetchGenerationByIdAPI(remixId)
      if (response.success) {
        handleRemix(response.data)
      }
      // Strip ?remix= so a refresh doesn't re-apply the preset.
      const params = new URLSearchParams(searchParams.toString())
      params.delete('remix')
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })()
  }, [searchParams, router, pathname, handleRemix, modelOptions.length])

  // Route heavyweight image editing through the dedicated tool page.
  const handleEdit = useCallback(
    (generation: GenerationRecord) => {
      router.push(
        studioImageEditPath({
          generationId: generation.id,
          sourceUrl: generation.url,
          width: generation.width,
          height: generation.height,
        }),
      )
    },
    [router],
  )

  return (
    <div
      ref={canvasRef}
      className={cn(
        'studio-canvas transition-all',
        isDragOver && 'ring-2 ring-primary/40 bg-primary/5 rounded-xl',
      )}
    >
      <div className="mx-auto w-full max-w-5xl">
        {activeRun?.mode === 'compare' ? (
          <CompareGrid
            items={activeRun.items}
            selectedItemId={activeRun.selectedItemId}
            onSelect={selectWinner}
          />
        ) : activeRun?.mode === 'variant' ? (
          <VariantGrid
            items={activeRun.items}
            selectedItemId={activeRun.selectedItemId}
            onSelect={selectWinner}
          />
        ) : (
          <>
            <GenerationPreview
              generation={lastGeneration}
              isLatestResult
              onUseAsReference={handleUseAsReference}
              onRemix={handleRemix}
              onEdit={handleEdit}
              onRetry={retry}
            />
            {lastGeneration?.outputType === 'IMAGE' && !activeRun?.mode && (
              <StudioResultFeedback
                generationId={lastGeneration.id}
                evaluation={lastEvaluation}
                onFeedback={handleFeedback}
              />
            )}
            {lastGeneration?.outputType === 'AUDIO' && !activeRun?.mode && (
              <StudioAudioFeedback
                generationId={lastGeneration.id}
                onFeedback={handleFeedback}
                onRetry={handleAudioFeedbackRetry}
                isRetrying={isGenerating}
              />
            )}
          </>
        )}
      </div>
      {error && (
        <StudioGenerationErrorDialog
          open={errorDialogOpen}
          onOpenChange={(open) => {
            if (!open) setErrorDismissed(error)
          }}
          error={{ message: error }}
          onRetry={() => {
            setErrorDismissed(null)
            retry()
          }}
          onSwitchModel={handleSwitchModel}
        />
      )}
    </div>
  )
})
