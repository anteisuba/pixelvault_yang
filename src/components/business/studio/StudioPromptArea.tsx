'use client'

import { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  Dices,
  GitCompareArrows,
  Key,
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
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { getModelById, modelSupportsLora } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import {
  STYLE_PRESETS,
  getStylePresetById,
  NO_STYLE_PRESET_ID,
} from '@/constants/style-presets'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
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
import { DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { ModelSelector } from '@/components/business/ModelSelector'
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'

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
  const tModels = useTranslations('Models')
  const { healthMap } = useApiKeysContext()

  const selectedStyleCard = styles.activeCard
  const isAudioMode = state.outputType === 'audio'
  const isVideoMode = state.outputType === 'video'
  const { selectedModel: imageModel, modelOptions: imageModelOptions } =
    useImageModelOptions()
  const { selectedModel: audioModel, modelOptions: audioModelOptions } =
    useAudioModelOptions()
  const { selectedModel: videoModel, modelOptions: videoModelOptions } =
    useVideoModelOptions(state.selectedOptionId ?? '')
  const selectedModel = isAudioMode
    ? audioModel
    : isVideoMode
      ? videoModel
      : imageModel
  const modelOptions = isAudioMode
    ? audioModelOptions
    : isVideoMode
      ? videoModelOptions
      : imageModelOptions

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

  // ── Quick Setup Dialog state ────────────────────────────────────
  const [quickSetup, setQuickSetup] = useState<{
    open: boolean
    modelId: string
    modelLabel: string
    adapterType: AI_ADAPTER_TYPES
    optionId: string
  }>({
    open: false,
    modelId: '',
    modelLabel: '',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    optionId: '',
  })

  const tSetup = useTranslations('QuickSetup')

  // ── Model options: split into available / needs key ─────────────
  const { availableModels, lockedModels } = useMemo(() => {
    const available: typeof modelOptions = []
    const locked: typeof modelOptions = []
    for (const opt of modelOptions) {
      // Models with a saved key, or free-tier models → available
      if (opt.sourceType === 'saved' || opt.freeTier) {
        available.push(opt)
      } else {
        locked.push(opt)
      }
    }
    return { availableModels: available, lockedModels: locked }
  }, [modelOptions])

  const selectedCharId =
    characters.activeCardIds.length > 0 ? characters.activeCardIds[0] : null

  // ── canGenerate ────────────────────────────────────────────────
  // Video / audio always use the quick-picked model (no style-card routing).
  const usesStyleCardForModel =
    !isVideoMode && !isAudioMode && state.workflowMode === 'card'
  const currentModelId = usesStyleCardForModel
    ? selectedStyleCard?.modelId
    : selectedModel?.modelId
  const modelRequiresRef = currentModelId
    ? (getModelById(currentModelId)?.requiresReferenceImage ?? false)
    : false
  const hasRefImage = imageUpload.referenceImages.length > 0
  const canGenerate =
    (usesStyleCardForModel
      ? !!styles.activeCardId && !!selectedStyleCard?.modelId
      : !!selectedModel?.modelId && !!state.prompt.trim()) &&
    (!modelRequiresRef || hasRefImage)

  // ── Reset selectedOptionId when outputType changes ─────────────
  // image/video/audio each have their own model pools; carrying a stale
  // image model id into audio mode causes UNSUPPORTED_MODEL on generate.
  // If the current selection doesn't exist in the active mode's options,
  // clear it so the UI / backend pick a sensible default.
  const prevOutputTypeRef = useRef(state.outputType)
  useEffect(() => {
    if (prevOutputTypeRef.current !== state.outputType) {
      prevOutputTypeRef.current = state.outputType
      const stillValid =
        state.selectedOptionId &&
        modelOptions.some((o) => o.optionId === state.selectedOptionId)
      if (!stillValid) {
        // Prefer the first available option in the new mode, or clear.
        const fallback = modelOptions.find(
          (o) => o.sourceType === 'saved' || o.freeTier,
        )
        dispatch({
          type: 'SET_OPTION_ID',
          payload: fallback?.optionId ?? null,
        })
      }
    }
  }, [state.outputType, state.selectedOptionId, modelOptions, dispatch])

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

  // ── Style preset prompt composition ────────────────────────────
  const activePreset = useMemo(
    () => getStylePresetById(state.stylePresetId),
    [state.stylePresetId],
  )

  /** Prepend style preset prefix to user prompt */
  const composePrompt = useCallback(
    (userPrompt: string): string | undefined => {
      const trimmed = userPrompt.trim()
      if (!activePreset || !trimmed) return trimmed || undefined
      return `${activePreset.promptPrefix} ${trimmed}`
    },
    [activePreset],
  )

  /** Merge style preset negative prompt into advancedParams */
  const composeAdvancedParams = useCallback(() => {
    const params = { ...state.advancedParams }
    if (activePreset?.negativePrompt) {
      params.negativePrompt = params.negativePrompt
        ? `${params.negativePrompt}, ${activePreset.negativePrompt}`
        : activePreset.negativePrompt
    }
    return Object.keys(params).length > 0 ? params : undefined
  }, [state.advancedParams, activePreset])

  // ── Generate handler ──────────────────────────────────────────
  // ── Video input builder ──────────────────────────────────────
  const buildVideoInput = useCallback(() => {
    if (!selectedModel) return null
    // Video accepts a single reference image (i2v); pick the first if present.
    const firstRef =
      imageUpload.referenceImages.length > 0
        ? imageUpload.referenceImages[0]
        : undefined

    // When workflowMode='card' with character cards applied, prepend character prompt.
    let finalPrompt = composePrompt(state.prompt) ?? ''
    const appliedCharacterIds: string[] = []
    if (
      state.workflowMode === 'card' &&
      characters.activeCards.length > 0 &&
      finalPrompt
    ) {
      const charPrompts = characters.activeCards
        .map((c) => c.characterPrompt?.trim())
        .filter((p): p is string => !!p)
      if (charPrompts.length > 0) {
        const base =
          charPrompts.length === 1
            ? charPrompts[0]
            : charPrompts
                .map(
                  (p, i) =>
                    `[Character ${i + 1}: ${characters.activeCards[i].name}]\n${p}`,
                )
                .join('\n\n')
        finalPrompt = `${base}\n\n${finalPrompt}`
        appliedCharacterIds.push(...characters.activeCards.map((c) => c.id))
      }
    }

    return {
      prompt: finalPrompt,
      modelId: selectedModel.modelId,
      apiKeyId: selectedModel.keyId,
      aspectRatio: state.aspectRatio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
      duration: state.videoDuration,
      referenceImage: firstRef,
      negativePrompt: state.advancedParams.negativePrompt ?? undefined,
      resolution: (state.videoResolution ?? undefined) as
        | '480p'
        | '540p'
        | '720p'
        | '1080p'
        | undefined,
      characterCardIds:
        appliedCharacterIds.length > 0 ? appliedCharacterIds : undefined,
    }
  }, [
    selectedModel,
    state.prompt,
    state.aspectRatio,
    state.videoDuration,
    state.videoResolution,
    state.advancedParams.negativePrompt,
    state.workflowMode,
    characters.activeCards,
    composePrompt,
    imageUpload.referenceImages,
  ])

  const buildImageInput = useCallback(() => {
    if (state.workflowMode === 'quick' && selectedModel) {
      return {
        modelId: selectedModel.modelId,
        apiKeyId: selectedModel.keyId,
        freePrompt: composePrompt(state.prompt),
        aspectRatio: state.aspectRatio,
        projectId: projects.activeProjectId ?? undefined,
        referenceImages:
          imageUpload.referenceImages.length > 0
            ? imageUpload.referenceImages
            : undefined,
        advancedParams: composeAdvancedParams(),
      }
    }
    if (state.workflowMode === 'card' && styles.activeCardId) {
      return {
        characterCardId: selectedCharId ?? undefined,
        backgroundCardId: backgrounds.activeCardId ?? undefined,
        styleCardId: styles.activeCardId,
        freePrompt: composePrompt(state.prompt),
        aspectRatio: state.aspectRatio,
        projectId: projects.activeProjectId ?? undefined,
        referenceImages:
          imageUpload.referenceImages.length > 0
            ? imageUpload.referenceImages
            : undefined,
        advancedParams: composeAdvancedParams(),
      }
    }
    return null
  }, [
    state.workflowMode,
    state.prompt,
    state.aspectRatio,
    composePrompt,
    composeAdvancedParams,
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
    if (isVideoMode && selectedModel) {
      const video = buildVideoInput()
      if (!video) return
      await generate({ mode: 'video', video })
      return
    }
    const image = buildImageInput()
    if (!image) return
    const result = await generate({ mode: 'image', image })

    // Nudge: after 3 successful quick-mode generations, suggest Pro mode
    if (result && state.workflowMode === 'quick') {
      const NUDGE_KEY = 'studio-quick-gen-count'
      const NUDGE_DISMISSED_KEY = 'studio-pro-nudge-dismissed'
      if (!localStorage.getItem(NUDGE_DISMISSED_KEY)) {
        const count = Number(localStorage.getItem(NUDGE_KEY) || '0') + 1
        localStorage.setItem(NUDGE_KEY, String(count))
        if (count === 3) {
          toast(tV3('cardMode'), {
            description: t('proModeNudge'),
            action: {
              label: t('tryProMode'),
              onClick: () => {
                dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'card' })
                localStorage.setItem(NUDGE_DISMISSED_KEY, '1')
              },
            },
            onDismiss: () => localStorage.setItem(NUDGE_DISMISSED_KEY, '1'),
          })
        }
      }
    }
  }, [
    canGenerate,
    isAudioMode,
    isVideoMode,
    selectedModel,
    state.prompt,
    state.voiceId,
    state.workflowMode,
    buildImageInput,
    buildVideoInput,
    generate,
    dispatch,
    t,
    tV3,
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
  const tPresets = useTranslations('StylePresets')

  const placeholder = isAudioMode
    ? tStudio('audioPlaceholder')
    : state.workflowMode === 'card' &&
        selectedStyleCard?.modelId &&
        modelSupportsLora(selectedStyleCard.modelId)
      ? t('freePromptPlaceholderLora')
      : t('freePromptPlaceholder')

  return (
    <>
      {/* Style preset chips — image/card mode only */}
      {!isAudioMode && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-medium text-muted-foreground/70 mr-0.5">
            {tPresets('label')}
          </span>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'SET_STYLE_PRESET',
                payload: NO_STYLE_PRESET_ID,
              })
            }
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-all duration-200',
              state.stylePresetId === NO_STYLE_PRESET_ID
                ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted',
            )}
          >
            {tPresets('none')}
          </button>
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                dispatch({ type: 'SET_STYLE_PRESET', payload: preset.id })
              }
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-all duration-200',
                state.stylePresetId === preset.id
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              <span>{preset.icon}</span>
              <span>{tPresets(preset.messageKey)}</span>
            </button>
          ))}
        </div>
      )}

      <PromptInput
        id="studio-prompt"
        isLoading={isGenerating}
        value={state.prompt}
        onValueChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
        maxHeight={
          typeof window !== 'undefined' && window.innerWidth < 768 ? 160 : 320
        }
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
          {/* Quick mode: grouped model selector | Card mode: contextual hint */}
          {state.workflowMode === 'quick' ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
                  >
                    {selectedModel?.keyId && (
                      <ApiKeyHealthDot
                        status={healthMap[selectedModel.keyId]}
                      />
                    )}
                    <span className="font-medium max-w-32 truncate">
                      {selectedModel
                        ? (selectedModel.keyLabel ??
                          getTranslatedModelLabel(
                            tModels,
                            selectedModel.modelId,
                          ))
                        : t('noModelHint')}
                    </span>
                    {selectedModel && (
                      <span className="text-muted-foreground/50">
                        {getProviderLabel(selectedModel.providerConfig)}
                      </span>
                    )}
                    <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="min-w-56 max-h-72 overflow-y-auto"
                >
                  {/* Available models */}
                  {availableModels.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-2xs text-muted-foreground/70">
                        {tSetup('available')}
                      </DropdownMenuLabel>
                      {availableModels.map((option) => (
                        <DropdownMenuItem
                          key={option.optionId}
                          onClick={() =>
                            dispatch({
                              type: 'SET_OPTION_ID',
                              payload: option.optionId,
                            })
                          }
                          className={cn(
                            option.optionId === state.selectedOptionId &&
                              'bg-accent/60',
                          )}
                        >
                          {option.keyId && (
                            <ApiKeyHealthDot status={healthMap[option.keyId]} />
                          )}
                          {option.freeTier && !option.keyId && (
                            <span className="size-1.5 shrink-0 rounded-full bg-green-500" />
                          )}
                          <span className="font-medium">
                            {option.keyLabel ??
                              getTranslatedModelLabel(tModels, option.modelId)}
                          </span>
                          <span className="ml-auto text-2xs text-muted-foreground">
                            {getProviderLabel(option.providerConfig)}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  {/* Locked models (need API key) */}
                  {lockedModels.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-2xs text-muted-foreground/70">
                        {tSetup('needsKey')}
                      </DropdownMenuLabel>
                      {lockedModels.map((option) => (
                        <DropdownMenuItem
                          key={option.optionId}
                          onClick={() =>
                            setQuickSetup({
                              open: true,
                              modelId: option.modelId,
                              modelLabel: getTranslatedModelLabel(
                                tModels,
                                option.modelId,
                              ),
                              adapterType: option.adapterType,
                              optionId: option.optionId,
                            })
                          }
                          className="text-muted-foreground/70"
                        >
                          <Key className="size-3 shrink-0" />
                          <span>
                            {getTranslatedModelLabel(tModels, option.modelId)}
                          </span>
                          <span className="ml-auto text-2xs">
                            {getProviderLabel(option.providerConfig)}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <QuickSetupDialog
                open={quickSetup.open}
                onOpenChange={(v) =>
                  setQuickSetup((prev) => ({ ...prev, open: v }))
                }
                modelId={quickSetup.modelId}
                modelLabel={quickSetup.modelLabel}
                adapterType={quickSetup.adapterType}
                optionId={quickSetup.optionId}
              />
            </>
          ) : (
            // Card mode: reserve the row so layout stays balanced
            <span className="text-2xs text-muted-foreground/60 max-w-48 truncate" />
          )}

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
                isAudioMode || isVideoMode ? 'rounded-xl' : 'rounded-l-xl',
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
            {!isAudioMode && !isVideoMode && (
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
      {compareMode && !isAudioMode && !isVideoMode && (
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
