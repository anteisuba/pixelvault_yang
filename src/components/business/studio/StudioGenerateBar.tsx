'use client'

import { memo, useCallback, useRef, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { getModelById } from '@/constants/models'
import { cn } from '@/lib/utils'

const ASPECT_RATIOS = ['1:1', '16:9', '9:16'] as const

export const StudioGenerateBar = memo(function StudioGenerateBar() {
  const { state, dispatch } = useStudioForm()
  const { characters, backgrounds, styles, imageUpload, projects } =
    useStudioData()
  const { isGenerating, generate } = useStudioGen()
  const t = useTranslations('StudioV2')

  // ── Quick mode: resolve selected model (shared hook) ──────────
  const { selectedModel } = useImageModelOptions()

  // ── Card mode: style card ─────────────────────────────────────
  const selectedStyleCard = styles.activeCard
  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null

  // ── canGenerate: depends on workflow mode ──────────────────────
  const currentModelId =
    state.workflowMode === 'quick'
      ? selectedModel?.modelId
      : selectedStyleCard?.modelId
  const modelRequiresRef = currentModelId
    ? (getModelById(currentModelId)?.requiresReferenceImage ?? false)
    : false
  const hasRefImage = imageUpload.referenceImages.length > 0
  const canGenerate =
    (state.workflowMode === 'quick'
      ? !!selectedModel?.modelId && !!state.prompt.trim()
      : !!styles.activeCardId && !!selectedStyleCard?.modelId) &&
    (!modelRequiresRef || hasRefImage)

  // ── Reset advancedParams when adapter type changes ──────────
  const prevAdapterRef = useRef(selectedStyleCard?.adapterType)
  useEffect(() => {
    const currentAdapter = selectedStyleCard?.adapterType
    if (
      prevAdapterRef.current !== undefined &&
      currentAdapter !== undefined &&
      prevAdapterRef.current !== currentAdapter
    ) {
      dispatch({ type: 'RESET_ADVANCED_PARAMS' })
    }
    prevAdapterRef.current = currentAdapter
  }, [selectedStyleCard?.adapterType, dispatch])

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return

    if (state.workflowMode === 'quick' && selectedModel) {
      // Quick mode: pass modelId + apiKeyId directly
      await generate({
        mode: 'image',
        image: {
          modelId: selectedModel.modelId,
          apiKeyId: selectedModel.keyId,
          freePrompt: state.prompt || undefined,
          aspectRatio: state.aspectRatio,
          projectId: projects.activeProjectId ?? undefined,
          referenceImages:
            imageUpload.referenceImages.length > 0
              ? imageUpload.referenceImages
              : undefined,
          advancedParams:
            Object.keys(state.advancedParams).length > 0
              ? state.advancedParams
              : undefined,
        },
      })
    } else if (state.workflowMode === 'card' && styles.activeCardId) {
      // Card mode: pass card IDs (original flow)
      await generate({
        mode: 'image',
        image: {
          characterCardId: selectedCharId ?? undefined,
          backgroundCardId: backgrounds.activeCardId ?? undefined,
          styleCardId: styles.activeCardId,
          freePrompt: state.prompt || undefined,
          aspectRatio: state.aspectRatio,
          projectId: projects.activeProjectId ?? undefined,
          referenceImages:
            imageUpload.referenceImages.length > 0
              ? imageUpload.referenceImages
              : undefined,
          advancedParams:
            Object.keys(state.advancedParams).length > 0
              ? state.advancedParams
              : undefined,
        },
      })
    }
  }, [
    canGenerate,
    state.workflowMode,
    state.prompt,
    state.aspectRatio,
    state.advancedParams,
    selectedModel,
    generate,
    selectedCharId,
    backgrounds.activeCardId,
    styles.activeCardId,
    projects.activeProjectId,
    imageUpload.referenceImages,
  ])

  return (
    <>
      {/* Sticky on mobile, static on desktop */}
      <div className="flex items-center justify-between gap-3 lg:static sticky bottom-0 z-10 bg-background/95 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none py-2 lg:py-0 -mx-1 px-1 lg:mx-0 lg:px-0">
        <div
          role="radiogroup"
          aria-label={t('aspectRatioLabel')}
          className="flex gap-1.5"
        >
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={state.aspectRatio === r}
              onClick={() => dispatch({ type: 'SET_ASPECT_RATIO', payload: r })}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                state.aspectRatio === r
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
              )}
            >
              {r}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate}
          className={cn(
            'flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium transition-colors',
            canGenerate && !isGenerating
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('generating')}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {t('generate')}
            </>
          )}
        </button>
      </div>

      {/* No-model warning (card mode only) */}
      {state.workflowMode === 'card' &&
        styles.activeCardId &&
        !selectedStyleCard?.modelId && (
          <p className="text-xs text-destructive/70 font-serif">
            {t('noModel')}
          </p>
        )}

      {/* Reference image required warning */}
      {modelRequiresRef && !hasRefImage && (
        <p className="text-xs text-destructive/70 font-serif">
          {t('requiresReferenceImage')}
        </p>
      )}
    </>
  )
})
