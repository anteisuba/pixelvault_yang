'use client'

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { motionTransition } from '@/constants/motion'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import {
  getWorkflowById,
  WORKFLOW_IDS,
  WORKFLOW_MEDIA_GROUPS,
} from '@/constants/workflows'
import {
  SAMPLE_PROMPT_KEYS,
  SAMPLE_PROMPT_STORAGE_KEY,
} from '@/constants/sample-prompts'
import {
  TTS_ESTIMATED_CHARS_PER_MINUTE,
  TTS_MAX_TEXT_LENGTH,
  TTS_MIN_PREVIEW_MINUTES,
  TTS_PROMPT_WARNING_LENGTH,
} from '@/constants/audio-options'
import {
  STUDIO_TOOL_PANEL_NAMES,
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useVoiceCards } from '@/hooks/cards/use-voice-cards'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { getModelById, modelSupportsLora } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import {
  getReferenceCapability,
  getReferenceCapabilityMax,
} from '@/constants/reference-image-capabilities'
import { AUDIO_PACE_SPEED } from '@/constants/voice-cards'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { getStylePresetById } from '@/constants/style-presets'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { PromptTemplatePicker } from '@/components/business/studio/PromptTemplatePicker'
import { PlaceholderFillDialog } from '@/components/business/prompts/inspiration/PlaceholderFillDialog'
import { StudioToolbarPanels } from '@/components/business/studio/StudioToolbarPanels'
import { cn } from '@/lib/utils'
import { composeCharacterInjection } from '@/lib/character-card-injection'
import { compilePromptTags } from '@/lib/prompt-tag-compiler'
import { hasPlaceholders } from '@/lib/prompt-placeholders'
import type {
  AdvancedParams,
  InspirationRecord,
  OutputType as RecipeOutputType,
  RecipeRecord,
} from '@/types'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from '@/components/ui/prompt-input'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'
import { PromptTagTray } from '@/components/business/studio/prompt-tags/PromptTagTray'

const STUDIO_FLOATING_SURFACE_SELECTOR = [
  '[data-studio-tool-popover]',
  '[role="dialog"]',
  '[data-slot="dialog-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
].join(', ')

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
  const tPromptArea = useTranslations('StudioPromptArea')
  const tImageChip = useTranslations('ImageChip')
  const tModels = useTranslations('Models')
  const locale = useLocale()
  const reducedMotion = useReducedMotion()
  const promptTags = usePromptTagStack()

  useEffect(() => {
    if (!localStorage.getItem(SAMPLE_PROMPT_STORAGE_KEY) && !state.prompt) {
      const key = SAMPLE_PROMPT_KEYS[state.selectedWorkflowId]
      if (key) {
        dispatch({ type: 'SET_PROMPT', payload: tPromptArea(key) })
        localStorage.setItem(SAMPLE_PROMPT_STORAGE_KEY, '1')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedStyleCard = styles.activeCard
  const isAudioMode = state.outputType === 'audio'
  const isVideoMode = state.outputType === 'video'
  const voiceCards = useVoiceCards({ enabled: isAudioMode })
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
  const trimmedPrompt = state.prompt.trim()
  const selectedPromptTags = useMemo(
    () => promptTags.allSelections(),
    [promptTags],
  )
  const hasPositivePromptTags = promptTags.positive.length > 0
  const hasPromptForImage = Boolean(trimmedPrompt || hasPositivePromptTags)
  const audioPromptLength = isAudioMode ? trimmedPrompt.length : 0
  const isAudioPromptOverLimit =
    isAudioMode && audioPromptLength > TTS_MAX_TEXT_LENGTH
  const isAudioPromptNearLimit =
    isAudioMode && audioPromptLength >= TTS_PROMPT_WARNING_LENGTH
  const audioEstimatedMinutesLabel = useMemo(() => {
    const estimatedMinutes =
      audioPromptLength > 0
        ? Math.max(
            TTS_MIN_PREVIEW_MINUTES,
            audioPromptLength / TTS_ESTIMATED_CHARS_PER_MINUTE,
          )
        : 0

    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits:
        estimatedMinutes > 0 && estimatedMinutes < 1 ? 1 : 0,
    }).format(estimatedMinutes)
  }, [audioPromptLength, locale])
  const audioPromptMeta = selectedModel
    ? tPromptArea('audioPromptMeta', {
        current: audioPromptLength,
        max: TTS_MAX_TEXT_LENGTH,
        minutes: audioEstimatedMinutesLabel,
        credits: selectedModel.requestCount ?? 1,
      })
    : tPromptArea('audioPromptMetaNoModel', {
        current: audioPromptLength,
        max: TTS_MAX_TEXT_LENGTH,
        minutes: audioEstimatedMinutesLabel,
      })
  type SelectedModelOption = NonNullable<typeof selectedModel>
  const modelOptions = isAudioMode
    ? audioModelOptions
    : isVideoMode
      ? videoModelOptions
      : imageModelOptions

  const getRecipePrompt = useCallback(
    (recipe: RecipeRecord) => recipe.compiledPrompt.trim(),
    [],
  )

  const currentTemplateOutputType = useMemo<RecipeOutputType>(() => {
    if (state.outputType === 'video') return 'VIDEO'
    if (state.outputType === 'audio') return 'AUDIO'
    return 'IMAGE'
  }, [state.outputType])

  const currentTemplateParams = useMemo<Record<string, unknown>>(
    () => ({
      aspectRatio: state.aspectRatio,
      advancedParams: state.advancedParams,
    }),
    [state.advancedParams, state.aspectRatio],
  )

  const getRecipeAspectRatio = useCallback((recipe: RecipeRecord) => {
    if (!recipe.params || typeof recipe.params !== 'object') return null
    const params = recipe.params as Record<string, unknown>
    const aspectRatio = params.aspectRatio
    return aspectRatio === '1:1' ||
      aspectRatio === '16:9' ||
      aspectRatio === '9:16' ||
      aspectRatio === '4:3' ||
      aspectRatio === '3:4'
      ? aspectRatio
      : null
  }, [])

  const getRecipeAdvancedParams = useCallback((recipe: RecipeRecord) => {
    if (!recipe.params || typeof recipe.params !== 'object') return null
    const params = recipe.params as Record<string, unknown>
    const advancedParams = params.advancedParams
    return advancedParams &&
      typeof advancedParams === 'object' &&
      !Array.isArray(advancedParams)
      ? (advancedParams as Record<string, unknown>)
      : null
  }, [])

  const setRecipeLineage = useCallback(
    (recipe: RecipeRecord, useMode: 'replace' | 'insert' | 'apply') => {
      dispatch({
        type: 'SET_RECIPE_USAGE',
        payload: {
          recipeId: recipe.id,
          recipeVersion: recipe.version,
          useMode,
        },
      })
    },
    [dispatch],
  )

  // ── Inspiration: apply + placeholder dialog ─────────────────────
  const [placeholderDialog, setPlaceholderDialog] = useState<{
    open: boolean
    prompt: string
  }>({ open: false, prompt: '' })

  const applyInspirationPrompt = useCallback(
    (prompt: string) => {
      dispatch({ type: 'SET_PROMPT', payload: prompt })
    },
    [dispatch],
  )

  const handleApplyInspiration = useCallback(
    (inspiration: InspirationRecord) => {
      if (hasPlaceholders(inspiration.prompt)) {
        setPlaceholderDialog({ open: true, prompt: inspiration.prompt })
      } else {
        applyInspirationPrompt(inspiration.prompt)
      }
    },
    [applyInspirationPrompt],
  )

  const handleApplyRecipe = useCallback(
    (recipe: RecipeRecord) => {
      const workflowId =
        recipe.outputType === 'VIDEO'
          ? WORKFLOW_IDS.CINEMATIC_SHORT_VIDEO
          : recipe.outputType === 'AUDIO'
            ? WORKFLOW_IDS.VOICE_NARRATION_DIALOGUE
            : WORKFLOW_IDS.QUICK_IMAGE
      const matchedOption = modelOptions.find(
        (option) => option.modelId === recipe.modelId,
      )
      const aspectRatio = getRecipeAspectRatio(recipe)
      const advancedParams = getRecipeAdvancedParams(recipe)

      dispatch({ type: 'SET_SELECTED_WORKFLOW_ID', payload: workflowId })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
      dispatch({
        type: 'SET_OPTION_ID',
        payload: matchedOption?.optionId ?? `workspace:${recipe.modelId}`,
      })
      dispatch({ type: 'SET_PROMPT', payload: getRecipePrompt(recipe) })
      if (aspectRatio) {
        dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
      }
      if (advancedParams) {
        dispatch({ type: 'SET_ADVANCED_PARAMS', payload: advancedParams })
      }
      setRecipeLineage(recipe, 'apply')
    },
    [
      dispatch,
      getRecipeAdvancedParams,
      getRecipeAspectRatio,
      getRecipePrompt,
      modelOptions,
      setRecipeLineage,
    ],
  )

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
  const handleOpenQuickSetup = useCallback(
    (option: (typeof modelOptions)[number]) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel: getTranslatedModelLabel(tModels, option.modelId),
        adapterType: option.adapterType,
        optionId: option.optionId,
      })
    },
    [tModels],
  )

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
  const currentAdapterType = usesStyleCardForModel
    ? (selectedStyleCard?.adapterType as AI_ADAPTER_TYPES | undefined)
    : selectedModel?.adapterType
  // Surface-aware capability lookup: video mode reads from the video pool
  // (Veo 3.1 exposes 3, others 1); image stays on the image pool.
  const currentMaxReferenceImages =
    currentAdapterType && currentModelId
      ? getReferenceCapabilityMax(
          getReferenceCapability(
            isVideoMode ? 'video' : 'image',
            currentAdapterType,
            currentModelId,
          ),
        )
      : 1
  const modelRejectsRefImages =
    hasRefImage && !isAudioMode && currentMaxReferenceImages === 0
  // A half-filled reference (audio without transcript) would 400 at the API
  // boundary; gate the generate button before it gets there.
  const isAudioReferenceIncomplete =
    isAudioMode &&
    Boolean(state.audioReferenceUrl) &&
    state.audioReferenceText.trim().length === 0
  const canGenerate =
    (usesStyleCardForModel
      ? !!styles.activeCardId && !!selectedStyleCard?.modelId
      : !!selectedModel?.modelId &&
        (isAudioMode || isVideoMode ? !!trimmedPrompt : hasPromptForImage)) &&
    (!modelRequiresRef || hasRefImage) &&
    !modelRejectsRefImages &&
    !isAudioPromptOverLimit &&
    !isAudioReferenceIncomplete

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

  const selectedVoiceCard = useMemo(
    () => (state.voiceCardId ? voiceCards.findCard(state.voiceCardId) : null),
    [state.voiceCardId, voiceCards],
  )

  const audioPronunciationDictionary = useMemo(
    () => ({
      ...(selectedVoiceCard?.pronunciationDictionary ?? {}),
      ...state.pronunciationDictionary,
    }),
    [selectedVoiceCard?.pronunciationDictionary, state.pronunciationDictionary],
  )

  const audioSpeed = useMemo(() => {
    if (state.audioPace in AUDIO_PACE_SPEED) {
      return AUDIO_PACE_SPEED[state.audioPace as keyof typeof AUDIO_PACE_SPEED]
    }

    return undefined
  }, [state.audioPace])
  const composerContainerRef = useRef<HTMLDivElement>(null)
  const isComposerExpanded = true
  const hasOpenToolPanel = STUDIO_TOOL_PANEL_NAMES.some(
    (panel) => state.panels[panel],
  )

  useEffect(() => {
    if (!hasOpenToolPanel) return

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      const targetElement =
        target instanceof Element
          ? target
          : target.parentNode instanceof Element
            ? target.parentNode
            : null

      if (targetElement?.closest(STUDIO_FLOATING_SURFACE_SELECTOR)) {
        return
      }

      const isInsideComposer = Boolean(
        composerContainerRef.current?.contains(target),
      )
      const isToolbarTrigger = Boolean(
        targetElement?.closest('[role="toolbar"] button'),
      )

      if (hasOpenToolPanel && (!isInsideComposer || !isToolbarTrigger)) {
        dispatch({ type: 'CLOSE_TOOL_PANELS' })
      }

      if (isInsideComposer) {
        return
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
    }
  }, [dispatch, hasOpenToolPanel])

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
  const composeAdvancedParams = useCallback(
    (negativePrompt?: string) => {
      const params = { ...state.advancedParams }
      const negativePrompts = [
        params.negativePrompt,
        activePreset?.negativePrompt,
        negativePrompt,
      ]
        .map((prompt) => prompt?.trim())
        .filter((prompt): prompt is string => !!prompt)

      if (negativePrompts.length > 0) {
        params.negativePrompt = negativePrompts.join(', ')
      }
      return Object.keys(params).length > 0 ? params : undefined
    },
    [state.advancedParams, activePreset],
  )

  const composePromptTagsForImage = useCallback(
    (
      freePrompt: string | undefined,
      advancedParams: AdvancedParams | undefined,
    ) => {
      const compiled = compilePromptTags({
        freePrompt,
        selectedTags: selectedPromptTags,
        existingNegativePrompt: advancedParams?.negativePrompt,
      })
      return {
        freePrompt: compiled.freePrompt,
        advancedParams: compiled.negativePrompt
          ? {
              ...(advancedParams ?? {}),
              negativePrompt: compiled.negativePrompt,
            }
          : advancedParams,
      }
    },
    [selectedPromptTags],
  )

  // ── Generate handler ──────────────────────────────────────────
  // ── Video input builder ──────────────────────────────────────
  const buildVideoInput = useCallback(() => {
    if (!selectedModel) return null
    // Video reference capacity is per-model: Veo 3.1 accepts up to 3 subject
    // references, everything else takes the single i2v starting frame.
    const videoCap = getReferenceCapability(
      'video',
      selectedModel.adapterType as AI_ADAPTER_TYPES,
      selectedModel.modelId,
    )
    const videoMax = getReferenceCapabilityMax(videoCap)
    const refs = imageUpload.referenceImages.slice(0, videoMax)
    const firstRef = refs[0]

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
    const selectedWorkflow = getWorkflowById(state.selectedWorkflowId)
    const videoWorkflowId =
      selectedWorkflow?.mediaGroup === WORKFLOW_MEDIA_GROUPS.VIDEO
        ? selectedWorkflow.id
        : undefined

    return {
      prompt: finalPrompt,
      modelId: selectedModel.modelId,
      apiKeyId: selectedModel.keyId,
      aspectRatio: state.aspectRatio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
      duration: state.videoDuration,
      referenceImage: firstRef,
      // Only emit the array form when the model genuinely takes multiple —
      // single-image i2v models keep their existing payload shape so we
      // don't accidentally send unused fields to fal.
      ...(videoMax > 1 && refs.length > 0 ? { referenceImages: refs } : {}),
      negativePrompt: state.advancedParams.negativePrompt ?? undefined,
      resolution: (state.videoResolution ?? undefined) as
        | '480p'
        | '540p'
        | '720p'
        | '1080p'
        | undefined,
      ...(videoWorkflowId ? { workflowId: videoWorkflowId } : {}),
      characterCardIds:
        appliedCharacterIds.length > 0 ? appliedCharacterIds : undefined,
    }
  }, [
    selectedModel,
    state.selectedWorkflowId,
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

  const buildImageInput = useCallback(
    (overrides?: {
      selectedModel?: SelectedModelOption
      compiledPrompt?: string
      negativePrompt?: string
    }) => {
      const imageModelForGeneration = overrides?.selectedModel ?? selectedModel

      if (state.workflowMode === 'quick' && imageModelForGeneration) {
        const injection = composeCharacterInjection(characters.activeCards)
        const basePrompt =
          overrides?.compiledPrompt ?? composePrompt(state.prompt)
        const freePrompt = injection.promptPrefix
          ? `${injection.promptPrefix}\n\n${basePrompt ?? ''}`.trim() ||
            undefined
          : basePrompt
        const mergedReferenceImages =
          imageUpload.referenceImages.length > 0
            ? imageUpload.referenceImages
            : injection.referenceImageUrl
              ? [injection.referenceImageUrl]
              : undefined
        const baseAdvancedParams = composeAdvancedParams(
          overrides?.negativePrompt,
        )
        const taggedPrompt = composePromptTagsForImage(
          freePrompt,
          baseAdvancedParams,
        )
        const advancedParams =
          injection.loras.length > 0
            ? {
                ...(taggedPrompt.advancedParams ?? {}),
                loras: [
                  ...(taggedPrompt.advancedParams?.loras ?? []),
                  ...injection.loras,
                ],
              }
            : taggedPrompt.advancedParams
        return {
          modelId: imageModelForGeneration.modelId,
          apiKeyId: imageModelForGeneration.keyId,
          freePrompt: taggedPrompt.freePrompt,
          aspectRatio: state.aspectRatio,
          projectId: projects.activeProjectId ?? undefined,
          referenceImages: mergedReferenceImages,
          advancedParams,
          recipeUsage: state.recipeUsage ?? undefined,
          characterCardIds:
            injection.appliedCardIds.length > 0
              ? injection.appliedCardIds
              : undefined,
        }
      }
      if (state.workflowMode === 'card' && styles.activeCardId) {
        const taggedPrompt = composePromptTagsForImage(
          composePrompt(state.prompt),
          composeAdvancedParams(),
        )
        return {
          characterCardId: selectedCharId ?? undefined,
          backgroundCardId: backgrounds.activeCardId ?? undefined,
          styleCardId: styles.activeCardId,
          freePrompt: taggedPrompt.freePrompt,
          aspectRatio: state.aspectRatio,
          projectId: projects.activeProjectId ?? undefined,
          referenceImages:
            imageUpload.referenceImages.length > 0
              ? imageUpload.referenceImages
              : undefined,
          advancedParams: taggedPrompt.advancedParams,
          recipeUsage: state.recipeUsage ?? undefined,
        }
      }
      return null
    },
    [
      state.workflowMode,
      state.prompt,
      state.recipeUsage,
      state.aspectRatio,
      composePrompt,
      composeAdvancedParams,
      composePromptTagsForImage,
      selectedModel,
      selectedCharId,
      backgrounds.activeCardId,
      styles.activeCardId,
      projects.activeProjectId,
      imageUpload.referenceImages,
      characters.activeCards,
    ],
  )

  const executeGenerate = useCallback(async () => {
    if (!canGenerate) return
    if (isAudioMode && selectedModel) {
      await generate({
        mode: 'audio',
        audio: {
          modelId: selectedModel.modelId,
          apiKeyId: selectedModel.keyId,
          freePrompt: state.prompt || undefined,
          voiceId: selectedVoiceCard?.voiceId ?? state.voiceId ?? undefined,
          // Preset reference (from a saved voice card) wins; otherwise fall
          // back to whatever ad-hoc clip the user uploaded for this run.
          // The Fish adapter's priority chain (speakerVoiceIds > voiceId >
          // references) takes care of the rest at the provider call site.
          referenceAudioUrl:
            selectedVoiceCard?.referenceAudioUrl ??
            state.audioReferenceUrl ??
            undefined,
          referenceText:
            selectedVoiceCard?.sampleText ??
            (state.audioReferenceText.trim()
              ? state.audioReferenceText.trim()
              : undefined),
          emotion: state.audioEmotion,
          pace: state.audioPace,
          pauseMarkers: state.audioPauseMarkers,
          pronunciationDictionary: audioPronunciationDictionary,
          speed: audioSpeed,
          volume: state.audioVolume,
          normalizeLoudness: state.audioNormalizeLoudness,
          normalizeText: state.audioNormalizeText,
          withTimestamps: state.audioWithTimestamps,
          format: state.audioFormat,
          sampleRate: state.audioSampleRate,
          mp3Bitrate: state.audioMp3Bitrate,
          opusBitrate: state.audioOpusBitrate,
          latency: state.audioLatency,
          temperature: state.audioTemperature,
          topP: state.audioTopP,
          chunkLength: state.audioChunkLength,
          repetitionPenalty: state.audioRepetitionPenalty,
          speakerVoiceIds:
            state.audioSpeakerVoiceIds.length > 0
              ? state.audioSpeakerVoiceIds
              : undefined,
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
    state.audioEmotion,
    state.audioPace,
    state.audioPauseMarkers,
    state.audioVolume,
    state.audioNormalizeLoudness,
    state.audioNormalizeText,
    state.audioWithTimestamps,
    state.audioFormat,
    state.audioSampleRate,
    state.audioMp3Bitrate,
    state.audioOpusBitrate,
    state.audioLatency,
    state.audioTemperature,
    state.audioTopP,
    state.audioChunkLength,
    state.audioRepetitionPenalty,
    state.audioSpeakerVoiceIds,
    state.audioReferenceUrl,
    state.audioReferenceText,
    state.workflowMode,
    selectedVoiceCard?.voiceId,
    selectedVoiceCard?.referenceAudioUrl,
    selectedVoiceCard?.sampleText,
    audioPronunciationDictionary,
    audioSpeed,
    buildImageInput,
    buildVideoInput,
    generate,
    dispatch,
    t,
    tV3,
  ])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    if (!canGenerate) {
      // Krea-style: button stays clickable; click surfaces the missing piece
      // instead of silently doing nothing.
      if (usesStyleCardForModel && !styles.activeCardId) {
        toast.info(tPromptArea('blocked.styleCardRequired'))
      } else if (!usesStyleCardForModel && !selectedModel?.modelId) {
        toast.info(tPromptArea('blocked.modelRequired'))
      } else if (
        !usesStyleCardForModel &&
        !(isAudioMode || isVideoMode ? trimmedPrompt : hasPromptForImage)
      ) {
        toast.info(tPromptArea('blocked.promptRequired'))
        document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)?.focus()
      } else if (isAudioPromptOverLimit) {
        toast.info(
          tPromptArea('blocked.audioPromptTooLong', {
            max: TTS_MAX_TEXT_LENGTH,
          }),
        )
        document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)?.focus()
      } else if (isAudioReferenceIncomplete) {
        toast.info(tPromptArea('blocked.audioReferenceTextRequired'))
      } else if (modelRequiresRef && !hasRefImage) {
        toast.info(tPromptArea('blocked.referenceRequired'))
        requestAnimationFrame(() => {
          document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)?.focus()
        })
      } else if (modelRejectsRefImages) {
        toast.info(tPromptArea('blocked.referenceUnsupported'))
      }
      return
    }
    await executeGenerate()
  }, [
    canGenerate,
    isGenerating,
    usesStyleCardForModel,
    styles.activeCardId,
    selectedModel?.modelId,
    modelRequiresRef,
    hasRefImage,
    modelRejectsRefImages,
    isAudioPromptOverLimit,
    isAudioReferenceIncomplete,
    trimmedPrompt,
    hasPromptForImage,
    isAudioMode,
    isVideoMode,
    executeGenerate,
    tPromptArea,
  ])

  const handledGenerateRequestRef = useRef(state.generateRequestId)
  useEffect(() => {
    if (state.generateRequestId === handledGenerateRequestRef.current) {
      return
    }

    handledGenerateRequestRef.current = state.generateRequestId
    void handleGenerate()
  }, [state.generateRequestId, handleGenerate])

  const handlePromptPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFile = getImageFileFromDataTransfer(event.clipboardData)
      if (!imageFile) return
      event.preventDefault()
      void imageUpload.handleFileChange(imageFile)
    },
    [imageUpload],
  )

  const handlePromptDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      imageUpload.handleDragEnter(event)
    },
    [imageUpload],
  )

  const handlePromptDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      imageUpload.handleDragOver(event)
    },
    [imageUpload],
  )

  const handlePromptDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      imageUpload.handleDragLeave(event)
    },
    [imageUpload],
  )

  const handlePromptDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      void imageUpload.handleDrop(event).then(() => {
        document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)?.focus()
      })
    },
    [imageUpload],
  )

  useStudioShortcuts({
    onGenerate: () => {
      void handleGenerate()
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
      {/*
       * Inline style preset chips were removed in Phase 4.1 to compress the
       * dock to a Krea-style single-row compose bar. The state field
       * `state.stylePresetId` and the SET_STYLE_PRESET reducer action are kept
       * intact so Phase 4.2 (Style transfer chip popover) can re-expose the
       * presets inside the chip — no functionality is lost, only the inline
       * UI is suppressed.
       */}

      {/* Quick-Setup modal lives at fragment root because it's a Dialog
          (no flow-layout footprint). The model picker capsule itself now
          renders inline inside PromptInputActions below. */}
      {state.workflowMode === 'quick' && (
        <QuickSetupDialog
          open={quickSetup.open}
          onOpenChange={(v) => setQuickSetup((prev) => ({ ...prev, open: v }))}
          modelId={quickSetup.modelId}
          modelLabel={quickSetup.modelLabel}
          adapterType={quickSetup.adapterType}
          optionId={quickSetup.optionId}
        />
      )}

      <div ref={composerContainerRef}>
        <PromptInput
          id="studio-prompt"
          isLoading={isGenerating}
          value={state.prompt}
          onValueChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
          maxHeight="var(--studio-prompt-max-h)"
          onSubmit={handleGenerate}
          onDragEnter={handlePromptDragEnter}
          onDragOver={handlePromptDragOver}
          onDragLeave={handlePromptDragLeave}
          onDrop={handlePromptDrop}
          data-slot="input-group"
          data-expanded={isComposerExpanded}
          role="group"
          disabled={isGenerating}
          className={cn(
            'group/input-group relative mx-auto w-full max-w-5xl 2xl:max-w-6xl rounded-none border-0 bg-transparent p-0 shadow-none outline-none [--studio-prompt-max-h:160px] md:[--studio-prompt-max-h:320px]',
            isGenerating && 'opacity-100',
            imageUpload.isDragging &&
              'rounded-3xl ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
          )}
        >
          <AnimatePresence initial={false}>
            {isComposerExpanded && (
              <motion.div
                key="composer-dock-controls"
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0, y: 8, marginBottom: 0 }}
                animate={{ height: 'auto', opacity: 1, y: 0, marginBottom: 8 }}
                exit={{ height: 0, opacity: 0, y: 6, marginBottom: 0 }}
                transition={motionTransition('slow', reducedMotion)}
              >
                <div className="studio-dock-control-row flex flex-col gap-2 px-1 md:flex-row md:items-center md:gap-3">
                  <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                    {state.workflowMode === 'quick' && (
                      <MainModelPicker
                        modality={
                          isAudioMode
                            ? 'audio'
                            : isVideoMode
                              ? 'video'
                              : 'image'
                        }
                        value={state.selectedOptionId ?? null}
                        onChange={(option) =>
                          dispatch({
                            type: 'SET_OPTION_ID',
                            payload: option.optionId,
                          })
                        }
                        onRequestSetup={handleOpenQuickSetup}
                        triggerEmptyLabel={t('noModelHint')}
                        searchPlaceholder={tForm(
                          'modelSelector.searchPlaceholder',
                        )}
                        emptySearchText={tForm('modelSelector.emptySearch')}
                      />
                    )}
                    <PromptTemplatePicker
                      currentModelId={selectedModel?.modelId}
                      currentOutputType={currentTemplateOutputType}
                      currentParams={currentTemplateParams}
                      currentPrompt={state.prompt}
                      currentProvider={
                        selectedModel
                          ? getProviderLabel(selectedModel.providerConfig)
                          : undefined
                      }
                      onApply={handleApplyRecipe}
                      onApplyInspiration={handleApplyInspiration}
                    />
                    <PlaceholderFillDialog
                      open={placeholderDialog.open}
                      onOpenChange={(open) =>
                        setPlaceholderDialog((prev) => ({ ...prev, open }))
                      }
                      prompt={placeholderDialog.prompt}
                      onApply={applyInspirationPrompt}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="hidden h-4 w-px shrink-0 bg-border/60 md:block"
                  />
                  <div className="relative min-w-0 md:flex-1">
                    <div className="overflow-x-auto">
                      <div className="flex min-w-max items-center">
                        <StudioToolbarPanels compact />
                      </div>
                    </div>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background to-transparent md:hidden"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background to-transparent md:hidden"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            layout
            animate={{
              borderRadius: isComposerExpanded ? 24 : 999,
              paddingTop: isComposerExpanded ? 8 : 6,
              paddingBottom: isComposerExpanded ? 8 : 6,
              paddingLeft: 8,
              paddingRight: 8,
            }}
            className={cn(
              'studio-composer overflow-hidden border border-black/5 shadow-2xl shadow-black/20 ring-1 ring-black/5',
              'has-[textarea:focus-visible]:border-black/10 has-[textarea:focus-visible]:shadow-black/30 has-[textarea:focus-visible]:ring-black/10',
            )}
            transition={motionTransition('slow', reducedMotion)}
          >
            <ImageAttachmentPreviewStrip
              entries={imageUpload.referenceEntries}
              previewAlt={tImageChip('label')}
              removeLabel={(index) =>
                tImageChip('removeReferenceImage', { index })
              }
              onRemove={imageUpload.removeReferenceImage}
              overLimitTooltip={tImageChip('disabledOverLimit')}
              unsupportedTooltip={tImageChip('disabledUnsupported')}
              variant="composer"
            />
            {!isAudioMode && !isVideoMode ? (
              <PromptTagTray
                prompt={state.prompt}
                disabled={isGenerating}
                onPromptChange={(value) =>
                  dispatch({ type: 'SET_PROMPT', payload: value })
                }
              />
            ) : null}
            <div className="flex min-h-11 items-center gap-2">
              <PromptInputTextarea
                id={STUDIO_PROMPT_TEXTAREA_ID}
                aria-label={tForm('promptLabel')}
                placeholder={placeholder}
                onPaste={handlePromptPaste}
                className="min-h-8 flex-1 px-3 py-1 font-sans text-sm leading-5 selection:bg-neutral-950 selection:text-white placeholder:text-neutral-400 disabled:opacity-100"
              />
              <PromptInputActions className="shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleGenerate()
                  }}
                  disabled={isGenerating || isAudioPromptOverLimit}
                  aria-label={t('generate')}
                  aria-busy={isGenerating}
                  aria-disabled={!canGenerate}
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-sm transition-[background-color,transform,box-shadow]',
                    'hover:bg-neutral-800 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
                    (isGenerating || isAudioPromptOverLimit) &&
                      'cursor-not-allowed bg-muted text-muted-foreground shadow-none hover:bg-muted hover:shadow-none',
                  )}
                  style={{
                    transitionTimingFunction: 'var(--ease-standard)',
                  }}
                >
                  <AnimatePresence initial={false} mode="wait">
                    {isGenerating ? (
                      <motion.span
                        key="generating"
                        className="flex items-center justify-center"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={motionTransition('fast', reducedMotion)}
                      >
                        <Loader2 className="size-4 animate-spin" />
                        {elapsedSeconds > 0 && (
                          <span className="sr-only">
                            {t('generating')} {elapsedSeconds}s
                          </span>
                        )}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        className="flex items-center justify-center"
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.92 }}
                        transition={motionTransition('fast', reducedMotion)}
                      >
                        <Send className="size-4 -rotate-12" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </PromptInputActions>
            </div>
          </motion.div>
          {isAudioMode && (
            <div
              className={cn(
                'flex justify-end px-3 pt-1 text-2xs tabular-nums',
                isAudioPromptOverLimit
                  ? 'text-destructive'
                  : isAudioPromptNearLimit
                    ? 'text-amber-600'
                    : 'text-muted-foreground/70',
              )}
            >
              {audioPromptMeta}
            </div>
          )}
        </PromptInput>
      </div>
    </>
  )
})
