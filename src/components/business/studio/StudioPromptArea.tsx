'use client'

import { memo, useCallback, useRef, useEffect } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { getModelById, modelSupportsLora } from '@/constants/models'
import { cn } from '@/lib/utils'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from '@/components/ui/prompt-input'

/**
 * StudioPromptArea — Prompt textarea with embedded Generate button.
 * Uses prompt-kit PromptInput compound component.
 */
export const StudioPromptArea = memo(function StudioPromptArea() {
  const { state, dispatch } = useStudioForm()
  const { styles, characters, backgrounds, imageUpload, projects } =
    useStudioData()
  const { isGenerating, generate, elapsedSeconds } = useStudioGen()
  const t = useTranslations('StudioV2')
  const tV3 = useTranslations('StudioV3')
  const tForm = useTranslations('StudioForm')

  const selectedStyleCard = styles.activeCard
  const { selectedModel } = useImageModelOptions()

  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null

  // ── canGenerate ────────────────────────────────────────────────
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

  // ── Reset advancedParams when adapter changes ─────────────────
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

  // ── Generate handler ──────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return

    if (state.workflowMode === 'quick' && selectedModel) {
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

  useStudioShortcuts({
    onGenerate: () => {
      void handleGenerate()
    },
  })

  const placeholder =
    state.workflowMode === 'card' &&
    selectedStyleCard?.modelId &&
    modelSupportsLora(selectedStyleCard.modelId)
      ? t('freePromptPlaceholderLora')
      : t('freePromptPlaceholder')

  return (
    <PromptInput
      isLoading={isGenerating}
      value={state.prompt}
      onValueChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
      maxHeight={320}
      onSubmit={handleGenerate}
      disabled={isGenerating}
      className="border-border/60 bg-background/60 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all"
    >
      <PromptInputTextarea
        id={STUDIO_PROMPT_TEXTAREA_ID}
        aria-label={tForm('promptLabel')}
        placeholder={placeholder}
        className="font-serif text-sm text-foreground placeholder:text-muted-foreground/60"
      />
      <PromptInputActions className="justify-between px-2 pb-2">
        {/* Contextual hint */}
        <span className="text-2xs text-muted-foreground/60 max-w-48 truncate">
          {!canGenerate && !isGenerating
            ? state.workflowMode === 'quick' && !selectedModel?.modelId
              ? t('noModelHint')
              : state.workflowMode === 'quick' && !state.prompt.trim()
                ? tV3('generateShortcutHint')
                : null
            : null}
        </span>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !canGenerate}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium',
            'transition-all duration-200',
            canGenerate && !isGenerating
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/25 hover:scale-[1.03] active:scale-[0.95]'
              : isGenerating
                ? 'bg-primary text-primary-foreground studio-generating'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>{t('generating')}</span>
              {elapsedSeconds > 0 && (
                <span className="text-2xs opacity-70 tabular-nums">
                  {elapsedSeconds}s
                </span>
              )}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              <span>{t('generate')}</span>
            </>
          )}
        </button>
      </PromptInputActions>
    </PromptInput>
  )
})
