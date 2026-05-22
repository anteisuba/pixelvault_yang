'use client'

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useState,
  type ClipboardEvent,
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import {
  Check,
  ChevronDown,
  Dices,
  GitCompareArrows,
  Key,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import {
  STUDIO_PROMPT_TEXTAREA_ID,
  VARIANT_COUNT,
  COMPARE_MAX_MODELS,
} from '@/constants/studio'
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
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useVoiceCards } from '@/hooks/use-voice-cards'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { useApiKeysContext } from '@/contexts/api-keys-context'
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
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { PromptTemplatePicker } from '@/components/business/studio/PromptTemplatePicker'
import { cn } from '@/lib/utils'
import { composeCharacterInjection } from '@/lib/character-card-injection'
import type { RecipeRecord } from '@/types'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
  const tPromptArea = useTranslations('StudioPromptArea')
  const tImageChip = useTranslations('ImageChip')
  const tModels = useTranslations('Models')
  const locale = useLocale()
  const { healthMap } = useApiKeysContext()

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

  const handleReplaceRecipePrompt = useCallback(
    (recipe: RecipeRecord) => {
      dispatch({ type: 'SET_PROMPT', payload: getRecipePrompt(recipe) })
      setRecipeLineage(recipe, 'replace')
    },
    [dispatch, getRecipePrompt, setRecipeLineage],
  )

  const handleInsertRecipePrompt = useCallback(
    (recipe: RecipeRecord) => {
      const nextPrompt = [state.prompt.trim(), getRecipePrompt(recipe)]
        .filter(Boolean)
        .join('\n\n')
      dispatch({ type: 'SET_PROMPT', payload: nextPrompt })
      setRecipeLineage(recipe, 'insert')
    },
    [dispatch, getRecipePrompt, setRecipeLineage, state.prompt],
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
  const [modelPickerOpen, setModelPickerOpen] = useState(false)

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

  const closeModelPicker = useCallback(() => {
    setModelPickerOpen(false)
  }, [])

  const handleModelPickerOpenChange = useCallback((open: boolean) => {
    setModelPickerOpen(open)
  }, [])

  const handleSelectModel = useCallback(
    (optionId: string) => {
      dispatch({ type: 'SET_OPTION_ID', payload: optionId })
      closeModelPicker()
    },
    [closeModelPicker, dispatch],
  )

  const handleOpenQuickSetup = useCallback(
    (option: (typeof modelOptions)[number]) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel: getTranslatedModelLabel(tModels, option.modelId),
        adapterType: option.adapterType,
        optionId: option.optionId,
      })
      closeModelPicker()
    },
    [closeModelPicker, tModels],
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
      : !!selectedModel?.modelId && !!trimmedPrompt) &&
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
        const advancedParams =
          injection.loras.length > 0
            ? {
                ...(baseAdvancedParams ?? {}),
                loras: [
                  ...(baseAdvancedParams?.loras ?? []),
                  ...injection.loras,
                ],
              }
            : baseAdvancedParams
        return {
          modelId: imageModelForGeneration.modelId,
          apiKeyId: imageModelForGeneration.keyId,
          freePrompt,
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
      } else if (!usesStyleCardForModel && !trimmedPrompt) {
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
        dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
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
    executeGenerate,
    dispatch,
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

  const handlePromptPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFile = getImageFileFromDataTransfer(event.clipboardData)
      if (!imageFile) return
      event.preventDefault()
      void imageUpload.handleFileChange(imageFile)
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

      <PromptInput
        id="studio-prompt"
        isLoading={isGenerating}
        value={state.prompt}
        onValueChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
        maxHeight={
          typeof window !== 'undefined' && window.innerWidth < 768 ? 160 : 320
        }
        onSubmit={handleGenerate}
        data-slot="input-group"
        role="group"
        disabled={isGenerating}
        className={cn(
          'group/input-group relative w-full overflow-hidden rounded-[2rem] border border-border/60 bg-background/60 p-2 shadow-sm outline-none transition-[color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          'has-[textarea:focus-visible]:border-primary/40 has-[textarea:focus-visible]:shadow-md has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-primary/15',
        )}
      >
        <ImageAttachmentPreviewStrip
          entries={imageUpload.referenceEntries}
          previewAlt={tImageChip('label')}
          removeLabel={(index) => tImageChip('removeReferenceImage', { index })}
          onRemove={imageUpload.removeReferenceImage}
          overLimitTooltip={tImageChip('disabledOverLimit')}
          unsupportedTooltip={tImageChip('disabledUnsupported')}
          variant="composer"
        />
        <PromptInputTextarea
          id={STUDIO_PROMPT_TEXTAREA_ID}
          aria-label={tForm('promptLabel')}
          placeholder={placeholder}
          onPaste={handlePromptPaste}
          className="min-h-12 px-2 py-1.5 font-serif text-sm leading-6 text-foreground placeholder:text-muted-foreground/60"
        />
        {isAudioMode && (
          <div
            className={cn(
              'flex justify-end px-2 pb-1 text-2xs tabular-nums',
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
        <PromptInputActions className="items-center justify-between gap-3 px-1.5 pb-1 pt-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {state.workflowMode === 'quick' && (
              <Popover
                open={modelPickerOpen}
                onOpenChange={handleModelPickerOpenChange}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('selectModel')}
                    aria-expanded={modelPickerOpen}
                    className={cn(
                      'flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 text-xs text-muted-foreground shadow-sm',
                      'transition-[color,background-color,border-color,box-shadow] duration-200',
                      'hover:border-primary/20 hover:bg-muted/45 hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20',
                      'data-[state=open]:border-primary/30 data-[state=open]:bg-muted/55 data-[state=open]:text-foreground data-[state=open]:shadow-md',
                    )}
                  >
                    {selectedModel?.keyId && (
                      <ApiKeyHealthDot
                        status={healthMap[selectedModel.keyId]}
                      />
                    )}
                    {!selectedModel?.keyId && selectedModel?.freeTier && (
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    )}
                    <span className="max-w-[7.5rem] truncate font-medium text-foreground sm:max-w-[10rem]">
                      {selectedModel
                        ? (selectedModel.keyLabel ??
                          getTranslatedModelLabel(
                            tModels,
                            selectedModel.modelId,
                          ))
                        : t('noModelHint')}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-3 shrink-0 transition-transform duration-300 ease-out',
                        modelPickerOpen && 'rotate-180',
                      )}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  sideOffset={10}
                  collisionPadding={12}
                  className="origin-bottom w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-border/70 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl data-[side=top]:slide-in-from-bottom-2"
                >
                  <Command className="bg-transparent">
                    <CommandInput
                      placeholder={tForm('modelSelector.searchPlaceholder')}
                      className="h-10 text-sm"
                    />
                    <CommandList className="max-h-80 overscroll-contain">
                      <CommandEmpty>
                        {tForm('modelSelector.emptySearch')}
                      </CommandEmpty>
                      {availableModels.length > 0 && (
                        <CommandGroup heading={tSetup('available')}>
                          {availableModels.map((option) => {
                            const isSelected =
                              option.optionId === state.selectedOptionId
                            const optionLabel =
                              option.keyLabel ??
                              getTranslatedModelLabel(tModels, option.modelId)
                            const optionModelLabel = getTranslatedModelLabel(
                              tModels,
                              option.modelId,
                            )
                            const providerLabel = getProviderLabel(
                              option.providerConfig,
                            )
                            const optionMeta = option.keyLabel
                              ? `${optionModelLabel} · ${providerLabel}`
                              : providerLabel
                            const searchValue = [
                              option.optionId,
                              optionLabel,
                              optionModelLabel,
                              providerLabel,
                              option.maskedKey,
                            ]
                              .filter((v): v is string => Boolean(v))
                              .join(' ')

                            return (
                              <CommandItem
                                key={option.optionId}
                                value={searchValue}
                                onSelect={() =>
                                  handleSelectModel(option.optionId)
                                }
                                className="group min-h-12 gap-3 px-3 py-2.5"
                              >
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/65 text-muted-foreground transition-colors group-hover:bg-background/80 group-hover:text-foreground group-data-[selected=true]:bg-background/80 group-data-[selected=true]:text-foreground">
                                  <Sparkles className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex min-w-0 items-center gap-2">
                                    {option.keyId ? (
                                      <ApiKeyHealthDot
                                        status={healthMap[option.keyId]}
                                      />
                                    ) : option.freeTier ? (
                                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                                    ) : null}
                                    <span className="truncate text-sm font-semibold">
                                      {optionLabel}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground/75">
                                    {optionMeta}
                                  </span>
                                </span>
                                {isSelected ? (
                                  <Check className="size-4 shrink-0 text-foreground" />
                                ) : null}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      )}

                      {lockedModels.length > 0 && (
                        <CommandGroup heading={tSetup('needsKey')}>
                          {lockedModels.map((option) => {
                            const optionModelLabel = getTranslatedModelLabel(
                              tModels,
                              option.modelId,
                            )
                            const providerLabel = getProviderLabel(
                              option.providerConfig,
                            )
                            const searchValue = [
                              option.optionId,
                              optionModelLabel,
                              providerLabel,
                            ]
                              .filter(Boolean)
                              .join(' ')

                            return (
                              <CommandItem
                                key={option.optionId}
                                value={searchValue}
                                onSelect={() => handleOpenQuickSetup(option)}
                                className="group min-h-12 gap-3 px-3 py-2.5 text-muted-foreground/65"
                              >
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/45 text-muted-foreground/75 transition-colors group-hover:bg-background/80 group-hover:text-foreground group-data-[selected=true]:bg-background/80 group-data-[selected=true]:text-foreground">
                                  <Key className="size-3.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold">
                                    {optionModelLabel}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground/70">
                                    {providerLabel}
                                  </span>
                                </span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            <PromptTemplatePicker
              onReplace={handleReplaceRecipePrompt}
              onInsert={handleInsertRecipePrompt}
              onApply={handleApplyRecipe}
            />
          </div>
          {/* Generate split button + variant dropdown (hidden in audio mode) */}
          <div
            className={cn(
              'inline-flex isolate shrink-0 items-stretch overflow-hidden rounded-full bg-primary text-primary-foreground',
              'shadow-sm shadow-primary/20 ring-1 ring-primary/10 transition-shadow duration-200',
              !isGenerating && 'hover:shadow-md hover:shadow-primary/25',
              (isGenerating || isAudioPromptOverLimit) &&
                'bg-muted text-muted-foreground',
            )}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void handleGenerate()
              }}
              disabled={isGenerating || isAudioPromptOverLimit}
              aria-busy={isGenerating}
              aria-disabled={!canGenerate}
              className={cn(
                'flex h-10 items-center gap-1.5 px-4 text-sm font-semibold',
                'transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isGenerating
                  ? 'cursor-not-allowed studio-generating'
                  : isAudioPromptOverLimit
                    ? 'cursor-not-allowed'
                    : 'active:scale-[0.97]',
              )}
              style={{
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <AnimatePresence initial={false} mode="wait">
                {isGenerating ? (
                  <motion.span
                    key="generating"
                    className="flex items-center gap-1.5"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <Loader2 className="size-4 animate-spin" />
                    <span>{t('generating')}</span>
                    {elapsedSeconds > 0 && (
                      <span className="text-2xs opacity-70 tabular-nums">
                        {elapsedSeconds}s
                      </span>
                    )}
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    className="flex items-center"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <kbd
                      aria-label={t('generate')}
                      className="inline-flex items-center gap-0.5 rounded border border-primary-foreground/25 bg-primary-foreground/10 px-1.5 py-0.5 font-sans text-xs font-medium tracking-tight text-primary-foreground/80"
                    >
                      <span aria-hidden>⌘</span>
                      <span aria-hidden>↵</span>
                    </kbd>
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            {!isAudioMode && !isVideoMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                    disabled={isGenerating}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center border-l border-primary-foreground/15 text-sm',
                      'transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      isGenerating
                        ? 'cursor-not-allowed'
                        : 'bg-primary-foreground/10 hover:bg-primary-foreground/15 active:scale-[0.95]',
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
                      {t('variantRequests', {
                        count: selectedModel?.requestCount ?? 1,
                      })}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleGenerateVariants}>
                    <Dices className="size-4" />
                    <span>{t('variantGenerate')}</span>
                    <span className="ml-auto text-2xs text-muted-foreground">
                      {t('variantRequests', { count: VARIANT_COUNT })}
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
