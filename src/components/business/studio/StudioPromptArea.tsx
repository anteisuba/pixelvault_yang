'use client'

import { memo, useCallback, useRef, useEffect, useState } from 'react'
import {
  ChevronDown,
  Dices,
  GitCompareArrows,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  STUDIO_PROMPT_TEXTAREA_ID,
  VARIANT_COUNT,
  COMPARE_MAX_MODELS,
} from '@/constants/studio'
import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { TTS_MAX_TEXT_LENGTH } from '@/constants/audio-options'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { getModelById, modelSupportsLora } from '@/constants/models'
import { cn } from '@/lib/utils'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from '@/components/ui/prompt-input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ModelSelector } from '@/components/business/ModelSelector'

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
  const isAudioMode = state.outputType === 'audio'
  const { selectedModel: imageModel, modelOptions } = useImageModelOptions()
  const { selectedModel: audioModel } = useAudioModelOptions()
  const selectedModel = isAudioMode ? audioModel : imageModel

  // B4: Compare mode state
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelectedIds, setCompareSelectedIds] = useState<Set<string>>(
    () => new Set(),
  )
  const toggleCompareModel = useCallback((optionId: string) => {
    setCompareSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) {
        next.delete(optionId)
      } else {
        next.add(optionId)
      }
      return next
    })
  }, [])

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
  const buildImageInput = useCallback(() => {
    if (state.workflowMode === 'quick' && selectedModel) {
      return {
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
      }
    }
    if (state.workflowMode === 'card' && styles.activeCardId) {
      return {
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
      }
    }
    return null
  }, [
    state.workflowMode,
    state.prompt,
    state.aspectRatio,
    state.advancedParams,
    selectedModel,
    selectedCharId,
    backgrounds.activeCardId,
    styles.activeCardId,
    projects.activeProjectId,
    imageUpload.referenceImages,
  ])

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return
    if (isAudioMode && selectedModel) {
      await generate({
        mode: 'audio',
        audio: {
          modelId: selectedModel.modelId,
          apiKeyId: selectedModel.keyId,
          freePrompt: state.prompt || undefined,
          voiceId: state.voiceId ?? undefined,
        },
      })
      return
    }
    const image = buildImageInput()
    if (!image) return
    await generate({ mode: 'image', image })
  }, [
    canGenerate,
    isAudioMode,
    selectedModel,
    state.prompt,
    state.voiceId,
    buildImageInput,
    generate,
  ])

  const handleGenerateVariants = useCallback(async () => {
    if (!canGenerate) return
    const image = buildImageInput()
    if (!image) return
    await generate({ mode: 'image', image, runMode: 'variant' })
  }, [canGenerate, buildImageInput, generate])

  const handleGenerateCompare = useCallback(async () => {
    if (compareSelectedIds.size < 2) return
    const image = buildImageInput()
    if (!image) return
    const compareModels = modelOptions
      .filter((o) => compareSelectedIds.has(o.optionId))
      .map((o) => ({ modelId: o.modelId, apiKeyId: o.keyId }))
    setCompareMode(false)
    setCompareSelectedIds(new Set())
    await generate({ mode: 'image', image, runMode: 'compare', compareModels })
  }, [compareSelectedIds, buildImageInput, modelOptions, generate])

  const handleEnterCompareMode = useCallback(() => {
    setCompareMode(true)
    setCompareSelectedIds(new Set())
  }, [])

  useStudioShortcuts({
    onGenerate: () => {
      void handleGenerate()
    },
    onGenerateVariants: () => {
      void handleGenerateVariants()
    },
  })

  const tStudio = useTranslations('StudioPage')

  const placeholder = isAudioMode
    ? tStudio('audioPlaceholder')
    : state.workflowMode === 'card' &&
        selectedStyleCard?.modelId &&
        modelSupportsLora(selectedStyleCard.modelId)
      ? t('freePromptPlaceholderLora')
      : t('freePromptPlaceholder')

  return (
    <>
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

          {/* Generate split button + variant dropdown (hidden in audio mode) */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !canGenerate}
              aria-busy={isGenerating}
              aria-disabled={!canGenerate}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm font-medium',
                'transition-all duration-200',
                isAudioMode ? 'rounded-xl' : 'rounded-l-xl',
                canGenerate && !isGenerating
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/25 active:scale-[0.97]'
                  : isGenerating
                    ? 'bg-primary text-primary-foreground studio-generating'
                    : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
              style={{
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
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
            {!isAudioMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={isGenerating || !canGenerate}
                    className={cn(
                      'flex items-center rounded-r-xl border-l border-white/20 px-2 py-2 text-sm',
                      'transition-all duration-200',
                      canGenerate && !isGenerating
                        ? 'bg-primary/90 text-primary-foreground hover:bg-primary/80 active:scale-[0.95]'
                        : 'bg-muted text-muted-foreground cursor-not-allowed',
                    )}
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem onClick={handleGenerate}>
                    <Sparkles className="size-4" />
                    <span>{t('generate')}</span>
                    <span className="ml-auto text-2xs text-muted-foreground">
                      1 credit
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleGenerateVariants}>
                    <Dices className="size-4" />
                    <span>{t('variantGenerate')}</span>
                    <span className="ml-auto text-2xs text-muted-foreground">
                      {t('variantCredits', { count: VARIANT_COUNT })}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleEnterCompareMode}>
                    <GitCompareArrows className="size-4" />
                    <span>{t('compareGenerate')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </PromptInputActions>
      </PromptInput>

      {/* B4: Compare mode — inline model multi-select */}
      {compareMode && !isAudioMode && (
        <div className="mt-2 rounded-xl border border-primary/20 bg-primary/3 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">
              {t('compareSelectModels')}
            </span>
            <button
              type="button"
              onClick={() => {
                setCompareMode(false)
                setCompareSelectedIds(new Set())
              }}
              className="text-2xs text-muted-foreground hover:text-foreground"
            >
              {t('cancel')}
            </button>
          </div>
          <ModelSelector
            value=""
            onChange={() => {}}
            options={modelOptions}
            multiSelect
            selectedValues={compareSelectedIds}
            onMultiChange={toggleCompareModel}
            maxSelections={COMPARE_MAX_MODELS}
          />
          <button
            type="button"
            onClick={() => void handleGenerateCompare()}
            disabled={compareSelectedIds.size < 2 || isGenerating}
            className={cn(
              'mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
              compareSelectedIds.size >= 2 && !isGenerating
                ? 'bg-primary text-primary-foreground shadow-sm hover:shadow-md active:scale-[0.97]'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            <GitCompareArrows className="size-4" />
            {t('compareGenerate')} ({compareSelectedIds.size})
          </button>
        </div>
      )}
    </>
  )
})
