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
import { ChevronDown, Loader2, Send, X } from 'lucide-react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { useLocale, useTranslations } from 'next-intl'

import { motionTransition } from '@/constants/motion'
import {
  STUDIO_PROMPT_TEXTAREA_ID,
  STUDIO_REFERENCE_DRAG_TYPE,
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
import { CARD_RECIPE } from '@/constants/cards/card-types'
import {
  AUDIO_KIND,
  TTS_ESTIMATED_CHARS_PER_MINUTE,
  TTS_MIN_PREVIEW_MINUTES,
  TTS_PROMPT_WARNING_RATIO,
} from '@/constants/audio-options'
import { resolveAudioTextLimit } from '@/constants/models/audio'
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
import { getVideoModelParameterOptions } from '@/constants/video-model-send-plan'
import { getNodeModeForModel } from '@/constants/video-node-modes'
import { useStudioVideoMode } from '@/hooks/use-studio-video-mode'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import {
  getReferenceCapability,
  getReferenceCapabilityMax,
} from '@/constants/reference-image-capabilities'
import { AUDIO_PACE_SPEED } from '@/constants/voice-cards'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import { getStylePresetById } from '@/constants/style-presets'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { PromptTemplatePicker } from '@/components/business/studio/PromptTemplatePicker'
import { PlaceholderFillDialog } from '@/components/business/prompts/inspiration/PlaceholderFillDialog'
import { StudioToolbarPanels } from '@/components/business/studio/StudioToolbarPanels'
// 参数栏（layout='panel'）直接组合这几颗 —— 它们本来就是独立组件，不用经过
// StudioToolbarPanels 那层横向工具条。
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioEnhanceButton } from '@/components/business/studio/StudioEnhanceButton'
// 规格三档（比例 · 清晰度 · 张数）在参数栏里收进一个触发器；dock 那三颗独立的
// chip 仍归视频 / 音频用，两套并存不互相替代。
import { StudioSpecPopover } from '@/components/business/studio/StudioSpecPopover'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioAudioKindSwitcher } from '@/components/business/studio/StudioAudioKindSwitcher'
import { cn } from '@/lib/utils'
import { composeCharacterInjection } from '@/lib/character-card-injection'
import { hasPlaceholders } from '@/lib/prompt-placeholders'
import { resolveInlineAudioReference } from '@/lib/studio/audio-reference'
import type {
  InspirationRecord,
  OutputType as RecipeOutputType,
  RecipeRecord,
} from '@/types'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from '@/components/ui/prompt-input'
import { Spinner } from '@/components/ui/spinner'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'

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
interface StudioPromptAreaProps {
  /**
   * 排布方式。`'dock'`（默认）= 底部整宽 composer，视频 / 音频仍走这套；
   * `'panel'` = 左侧参数栏的纵向堆叠（提示词 → 模板/参考图 → 模型 → 规格 →
   * 生成），工作台重设计用。
   *
   * ⚠ 两个分支**共用同一套 handler**（`handleGenerate` / `buildImageInput` /
   * quick setup …）—— 变的只有 JSX 排布。提示词输入与 `executeGenerate` 绑在
   * 一起，是这个组件不能按"参数/动作"拆开的唯一原因。
   */
  layout?: 'dock' | 'panel'
}

export const StudioPromptArea = memo(function StudioPromptArea({
  layout = 'dock',
}: StudioPromptAreaProps = {}) {
  const isPanel = layout === 'panel'
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

  /**
   * 视频选择器只列**当前用途**的端点 —— 与 `StudioVideoModeToggle` 配对：
   * 用途拆到工具条上之后，第三栏就只剩渠道（Seedance 2.0 Fast 从 6 行降到 3 行）。
   * 画布用的是同一条路数（`VideoComposer` 的 `filterModelByMode`）。
   *
   * ⚠ 必须 memo：谓词的引用每次 render 变一次的话，选择器拿到的 `options` 数组
   * 身份也跟着变 —— 那正是 `BaseModelPickerPanel` 注释里记的「视图被重置回第一层」
   * 那个坑。
   * ⚠ 非视频模态传 `undefined` 而不是恒真谓词：恒真谓词一样会每帧换引用。
   * ⚠ 用途取自 `useStudioVideoMode`（与工具条上的分段控件同一个源）。**没选模型
   *   时它落在 `DEFAULT_VIDEO_NODE_MODE`，不能退化成「不过滤」** —— 首次打开
   *   选择器恰恰是没有选中项的那一刻，退化就等于这个功能在最该生效的场景里不
   *   生效。实测过一版正是如此：闸门全绿，真机第三栏照旧 6 行。
   */
  const { mode: videoMode } = useStudioVideoMode()
  const filterVideoModelByMode = useMemo(
    () =>
      isVideoMode
        ? (option: StudioModelOption) =>
            getNodeModeForModel(option.modelId, option.adapterType) ===
            videoMode
        : undefined,
    [isVideoMode, videoMode],
  )
  const trimmedPrompt = state.prompt.trim()
  const hasPromptForImage = Boolean(trimmedPrompt)
  const audioPromptLength = isAudioMode ? trimmedPrompt.length : 0
  // Per-model, not per-app: the ceiling belongs to whichever vendor this model
  // routes to, and most of them publish none (then only the payload guard
  // applies). Mirrors the server check in generate-audio.service.ts.
  const audioTextLimit = resolveAudioTextLimit(
    isAudioMode ? getModelById(selectedModel?.modelId ?? '') : undefined,
  )
  const isAudioPromptOverLimit =
    isAudioMode && audioPromptLength > audioTextLimit.enforced
  const isAudioPromptNearLimit =
    isAudioMode &&
    audioPromptLength >= audioTextLimit.enforced * TTS_PROMPT_WARNING_RATIO
  // Image free-prompt cap mirrors StudioGenerateSchema's
  // freePrompt.max(FREE_PROMPT_MAX_LENGTH); gate before the request 400s with
  // a generic VALIDATION_ERROR the user can't act on.
  const isImageMode = !isAudioMode && !isVideoMode
  const imagePromptLength = isImageMode ? trimmedPrompt.length : 0
  // Quick mode sends freePrompt straight to the provider, so cap it at the
  // selected model's real encoder limit; card mode's freePrompt goes through
  // LLM fusion, so it keeps the card-recipe default.
  const imagePromptMaxChars =
    (isImageMode && state.workflowMode === 'quick'
      ? getModelById(selectedModel?.modelId ?? '')?.maxPromptChars
      : undefined) ?? CARD_RECIPE.FREE_PROMPT_MAX_LENGTH
  const isImagePromptOverLimit =
    isImageMode && imagePromptLength > imagePromptMaxChars
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
  // No model → no vendor → no known ceiling; a model whose vendor publishes no
  // limit gets a plain character count. Printing the payload guard as a
  // denominator would read as "you may write 40,000 characters", which is a
  // promise nobody verified.
  const audioPromptMeta = !selectedModel
    ? tPromptArea('audioPromptMetaNoModel', {
        current: audioPromptLength,
        minutes: audioEstimatedMinutesLabel,
      })
    : audioTextLimit.declared !== undefined
      ? tPromptArea('audioPromptMeta', {
          current: audioPromptLength,
          max: audioTextLimit.declared,
          minutes: audioEstimatedMinutesLabel,
          credits: selectedModel.requestCount ?? 1,
        })
      : tPromptArea('audioPromptMetaNoLimit', {
          current: audioPromptLength,
          minutes: audioEstimatedMinutesLabel,
          credits: selectedModel.requestCount ?? 1,
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
  /**
   * 负面提示词的折叠态。⚠ 只是**显示**折叠，值本身活在 `state.advancedParams`
   * —— 折叠不影响它是否随请求发出（发出的判据只有「有没有内容」）。
   */
  const [negativePromptExpanded, setNegativePromptExpanded] = useState(false)

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
    !isImagePromptOverLimit &&
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
      const isToolSurfaceTrigger = Boolean(
        targetElement?.closest(
          '[data-slot="popover-trigger"], [role="toolbar"] button',
        ),
      )

      if (hasOpenToolPanel && (!isInsideComposer || !isToolSurfaceTrigger)) {
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

    // ⚠ 档位按当前模型夹取，**夹在这里而不是只夹在面板里**：面板（
    // `StudioVideoParams`）可能一次都没被打开过，而残留值来自「切模型」——
    // 先在支持 1080p 的模型上选了 1080p，再切到只到 720p 的
    // `SEEDANCE_25_REFERENCE`，state 里那个 1080p 原样发出去就是 400。这里是
    // 这两个值离开客户端的唯一出口，夹在出口才挡得住所有来路。
    //   · duration —— 落到最接近的合法档；契约不支持这个参数时发 `'auto'`
    //     （载荷里 duration 必填，而 `'auto'` 的语义正是「交给模型定」）
    //   · resolution —— 直接省略（本来就可空），让模型走自己的默认档，
    //     比擅自换一个用户没选过的档诚实
    const { durations: allowedDurations, resolutions: allowedResolutions } =
      getVideoModelParameterOptions(
        selectedModel.modelId,
        selectedModel.adapterType,
      )
    const duration: number | 'auto' =
      allowedDurations.length === 0
        ? 'auto'
        : allowedDurations.includes(state.videoDuration)
          ? state.videoDuration
          : allowedDurations.reduce((closest, candidate) =>
              Math.abs(candidate - state.videoDuration) <
              Math.abs(closest - state.videoDuration)
                ? candidate
                : closest,
            )
    const resolution =
      state.videoResolution &&
      allowedResolutions.includes(state.videoResolution)
        ? state.videoResolution
        : undefined

    return {
      prompt: finalPrompt,
      modelId: selectedModel.modelId,
      apiKeyId: selectedModel.keyId,
      aspectRatio: state.aspectRatio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
      duration,
      referenceImage: firstRef,
      // Only emit the array form when the model genuinely takes multiple —
      // single-image i2v models keep their existing payload shape so we
      // don't accidentally send unused fields to fal.
      ...(videoMax > 1 && refs.length > 0 ? { referenceImages: refs } : {}),
      negativePrompt: state.advancedParams.negativePrompt ?? undefined,
      resolution: resolution as '480p' | '540p' | '720p' | '1080p' | undefined,
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

  /**
   * 这一轮要跑的模型名单 = 主模型 + 额外模型，按名单顺序去重。
   * 额外模型里可能有已经不在当前 options 里的（切模态、key 被删），过滤掉 ——
   * 名单上留一条点不动也发不出的行，比少一行更糟。
   */
  const runModels = useMemo(() => {
    const byId = new Map(imageModelOptions.map((o) => [o.optionId, o]))
    const ids = [
      ...(state.selectedOptionId ? [state.selectedOptionId] : []),
      ...state.extraModelOptionIds,
    ]
    const seen = new Set<string>()
    return ids
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
      .map((id) => byId.get(id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
  }, [imageModelOptions, state.selectedOptionId, state.extraModelOptionIds])

  const runModelIds = useMemo(
    () => new Set(runModels.map((o) => o.optionId)),
    [runModels],
  )

  const handleToggleRunModel = useCallback(
    (option: SelectedModelOption) => {
      // 还没有主模型时，第一次点选就当选主模型 —— 否则名单有条目却没有主模型，
      // 清晰度/字数上限这些按主模型算的能力就无从取值。
      if (!state.selectedOptionId) {
        dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
        return
      }
      dispatch({ type: 'TOGGLE_EXTRA_MODEL', payload: option.optionId })
    },
    [dispatch, state.selectedOptionId],
  )

  const handleRemoveRunModel = useCallback(
    (optionId: string) => {
      if (optionId !== state.selectedOptionId) {
        dispatch({ type: 'REMOVE_EXTRA_MODEL', payload: optionId })
        return
      }
      // 移除主模型：把名单里下一条顶上来，别让主模型变空。
      const next = state.extraModelOptionIds[0] ?? null
      dispatch({ type: 'SET_OPTION_ID', payload: next })
      if (next) dispatch({ type: 'REMOVE_EXTRA_MODEL', payload: next })
    },
    [dispatch, state.selectedOptionId, state.extraModelOptionIds],
  )

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
        return {
          modelId: imageModelForGeneration.modelId,
          apiKeyId: imageModelForGeneration.keyId,
          freePrompt,
          aspectRatio: state.aspectRatio,
          projectId: projects.activeProjectId ?? undefined,
          referenceImages: mergedReferenceImages,
          advancedParams: baseAdvancedParams,
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
      const isSfx = state.audioKind === AUDIO_KIND.SFX
      // Audio clip + transcript must ship as a coherent pair (schema refine);
      // resolve them from one source so a card clip without a transcript never
      // 400s the request.
      const audioReference = resolveInlineAudioReference({
        cardReferenceAudioUrl: selectedVoiceCard?.referenceAudioUrl,
        cardSampleText: selectedVoiceCard?.sampleText,
        adHocReferenceUrl: state.audioReferenceUrl,
        adHocReferenceText: state.audioReferenceText,
      })
      await generate({
        mode: 'audio',
        audio: {
          modelId: selectedModel.modelId,
          apiKeyId: selectedModel.keyId,
          freePrompt: state.prompt || undefined,
          voiceId: selectedVoiceCard?.voiceId ?? state.voiceId ?? undefined,
          // The voice card's avatar rides along BY REFERENCE so the generated
          // clip carries a cover into 素材库. Only a valid http URL — a malformed
          // cover must never 400 the generation.
          coverImageUrl:
            typeof selectedVoiceCard?.coverImage === 'string' &&
            selectedVoiceCard.coverImage.startsWith('http')
              ? selectedVoiceCard.coverImage
              : undefined,
          // Preset reference (from a saved voice card) wins; otherwise fall
          // back to whatever ad-hoc clip the user uploaded for this run.
          // The Fish adapter's priority chain (speakerVoiceIds > voiceId >
          // references) takes care of the rest at the provider call site.
          referenceAudioUrl: audioReference.referenceAudioUrl,
          referenceText: audioReference.referenceText,
          emotion: state.audioEmotion,
          expressiveness: state.audioExpressiveness,
          durationSeconds: isSfx ? state.audioSfxDurationSeconds : undefined,
          loop: isSfx ? state.audioSfxLoop : undefined,
          promptInfluence: isSfx ? state.audioSfxPromptInfluence : undefined,
          variantCount: isSfx ? state.audioSfxVariantCount : undefined,
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
    const result = await generate({
      mode: 'image',
      image,
      variantCount: state.imageBatchCount,
      // 只有一条时不送名单 —— 让它走原来的单模型路径，请求逐字节不变。
      compareModels:
        runModels.length > 1
          ? runModels.map((o) => ({ modelId: o.modelId, apiKeyId: o.keyId }))
          : undefined,
    })

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
    state.imageBatchCount,
    runModels,
    state.voiceId,
    state.audioKind,
    state.audioEmotion,
    state.audioExpressiveness,
    state.audioSfxDurationSeconds,
    state.audioSfxLoop,
    state.audioSfxPromptInfluence,
    state.audioSfxVariantCount,
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
    selectedVoiceCard?.coverImage,
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

  /**
   * 挡住生成的那一条原因（`canGenerate` 为假时必有一条）。
   *
   * 抽出来是因为它有**两个**消费者：点击时的 toast，和参数栏生成按钮上的
   * 文案。两边各写一串 if/else 必然漂 —— 改了一处忘了另一处，用户看到的
   * 按钮和点出来的提示就会说两件事。
   */
  const blockedReason = useMemo((): {
    message: string
    focusPrompt?: 'now' | 'nextFrame'
  } | null => {
    if (canGenerate) return null
    if (usesStyleCardForModel && !styles.activeCardId) {
      return { message: tPromptArea('blocked.styleCardRequired') }
    }
    if (!usesStyleCardForModel && !selectedModel?.modelId) {
      return { message: tPromptArea('blocked.modelRequired') }
    }
    if (
      !usesStyleCardForModel &&
      !(isAudioMode || isVideoMode ? trimmedPrompt : hasPromptForImage)
    ) {
      return {
        message: tPromptArea('blocked.promptRequired'),
        focusPrompt: 'now',
      }
    }
    if (isAudioPromptOverLimit) {
      return {
        message: tPromptArea('blocked.audioPromptTooLong', {
          max: audioTextLimit.enforced,
        }),
        focusPrompt: 'now',
      }
    }
    if (isImagePromptOverLimit) {
      return {
        message: tPromptArea('blocked.promptTooLong', {
          max: imagePromptMaxChars,
        }),
        focusPrompt: 'now',
      }
    }
    if (isAudioReferenceIncomplete) {
      return { message: tPromptArea('blocked.audioReferenceTextRequired') }
    }
    if (modelRequiresRef && !hasRefImage) {
      return {
        message: tPromptArea('blocked.referenceRequired'),
        focusPrompt: 'nextFrame',
      }
    }
    if (modelRejectsRefImages) {
      return { message: tPromptArea('blocked.referenceUnsupported') }
    }
    return null
  }, [
    canGenerate,
    usesStyleCardForModel,
    styles.activeCardId,
    selectedModel?.modelId,
    modelRequiresRef,
    hasRefImage,
    modelRejectsRefImages,
    isAudioPromptOverLimit,
    audioTextLimit.enforced,
    isImagePromptOverLimit,
    imagePromptMaxChars,
    isAudioReferenceIncomplete,
    trimmedPrompt,
    hasPromptForImage,
    isAudioMode,
    isVideoMode,
    tPromptArea,
  ])

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return
    if (blockedReason) {
      // Krea-style: button stays clickable; click surfaces the missing piece
      // instead of silently doing nothing.
      toast.info(blockedReason.message)
      if (blockedReason.focusPrompt === 'now') {
        focusStudioPrompt()
      } else if (blockedReason.focusPrompt === 'nextFrame') {
        requestAnimationFrame(() => {
          focusStudioPrompt()
        })
      }
      return
    }
    await executeGenerate()
  }, [blockedReason, isGenerating, executeGenerate])

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
        focusStudioPrompt()
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
    ? state.audioKind === AUDIO_KIND.SFX
      ? tStudio('sfxPlaceholder')
      : tStudio('audioPlaceholder')
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

      {isPanel ? (
        <PromptInput
          ref={composerContainerRef}
          id="studio-prompt"
          isLoading={isGenerating}
          value={state.prompt}
          onValueChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
          maxHeight="14rem"
          onSubmit={handleGenerate}
          onDragEnter={handlePromptDragEnter}
          onDragOver={handlePromptDragOver}
          onDragLeave={handlePromptDragLeave}
          onDrop={handlePromptDrop}
          role="group"
          disabled={isGenerating}
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-3 rounded-none border-0 bg-transparent p-0 shadow-none outline-none',
            imageUpload.isDragging &&
              'rounded-xl ring-2 ring-primary/35 ring-offset-2 ring-offset-background',
          )}
        >
          {/* 提示词 —— 参数栏里它是一块独立的输入区，不再和发送键挤一行 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {tForm('promptLabel')}
            </span>
            <div className="studio-composer rounded-xl border border-border/60 px-2 py-1.5">
              <ImageAttachmentPreviewStrip
                entries={imageUpload.referenceEntries}
                previewAlt={tImageChip('label')}
                previewLabel={(index) =>
                  tImageChip('previewReferenceImage', { index })
                }
                previewDescription={tImageChip('previewReferenceDescription')}
                previewCloseLabel={tImageChip('closeReferencePreview')}
                removeLabel={(index) =>
                  tImageChip('removeReferenceImage', { index })
                }
                onRemove={imageUpload.removeReferenceImage}
                overLimitTooltip={tImageChip('disabledOverLimit')}
                unsupportedTooltip={tImageChip('disabledUnsupported')}
                variant="composer"
                dragType={STUDIO_REFERENCE_DRAG_TYPE}
              />
              <PromptInputTextarea
                id={STUDIO_PROMPT_TEXTAREA_ID}
                aria-label={tForm('promptLabel')}
                placeholder={placeholder}
                onPaste={handlePromptPaste}
                className="min-h-20 px-1 py-1 font-sans text-sm leading-5 disabled:opacity-100"
              />
            </div>
            {isImagePromptOverLimit && (
              <span className="text-2xs tabular-nums text-destructive">
                {`${imagePromptLength}/${imagePromptMaxChars}`}
              </span>
            )}
          </div>

          {/* 往提示词里加东西的两个动作：模板 / 参考图。紧贴输入框，不进「参数」。
              ⚠ 必须裹 Toolbar.Root —— 这几颗 chip 底下是 Radix `Toolbar.Button`，
              没有 roving-focus context 会直接抛 `RovingFocusGroupItem must be used
              within RovingFocusGroup`。dock 那边由 StudioToolbar 提供，参数栏得自己给。 */}
          <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
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
            <ReferenceImageChip disabled={isGenerating} />
            {/* 助手在 lg 以上由右上角的 StudioAssistantFab 承担（owner
                2026-08-14），这里只留小屏那份 —— 不是重复：dock 是 lg:flex，
                小屏的抽屉宿主就长在这颗丸里面，删了小屏就没有助手入口了。 */}
            <span className="contents lg:hidden">
              <StudioEnhanceButton disabled={isGenerating} />
            </span>
          </Toolbar.Root>

          {/* 负面提示词 —— 折叠行 + 内容预览，与 LoRA 工作台同一形态（那边是这个
              字段在本项目里的既有落点）。
              ⭐ 2026-08-22 补：**图片工作台此前根本没有输入它的地方** ——
              `StudioImageAdvancedParams` 里那个输入框只长在 `panels.advanced`
              对话框里，而该对话框挂在 `StudioBottomDock` → `StudioDockPanelArea`
              这条链上，图片模态走的是 `StudioWorkbenchLayout`，**整条链不挂载**。
              于是命令面板里的「切换高级设置」翻的是一个没人渲染的状态（空开关），
              而生成管线一直在读 `advancedParams.negativePrompt`（worker 侧
              `readStringField(providerInput,'negativePrompt')`）—— 字段活着、门没开。
              ⛔ 没有把整个高级对话框挂过来：那会把 seed 一并放出去，而 owner
              2026-08-22 明确「seed 不介入，只接负面提示词」。
              ⛔ 没有复用 `.lora-reveal`：那是 lora 域皮肤的类，跨域引用会把两个
              域的皮肤绑死；这里用条件渲染，行为一致、无跨域依赖。 */}
          <div
            className="flex flex-col gap-1.5"
            // ⭐ 必须挡住冒泡：`PromptInput` 的根 div 在**容器内任何点击**冒泡上来时
            //   都会 `focusUnlessTouch(textareaRef)` 把焦点抢回主提示词框
            //   （见 `ui/prompt-input.tsx` 的 handleClick）。不挡的话点这里的输入框
            //   会「看着聚焦了、打的字全进主提示词框」—— 2026-08-22 owner 实拍
            //   「甚至无法点击」，我当时误判成自己点偏了。
            //   ⚠ 同文件里 `PromptInputAction` 早就是这么防的，这里照它。
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-expanded={negativePromptExpanded}
              onClick={() => setNegativePromptExpanded((open) => !open)}
              className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left"
            >
              <span className="shrink-0 text-2xs font-medium text-muted-foreground/70">
                {tPromptArea('negativePromptLabel')}
              </span>
              {/* ⚠ 预览只在**收起**时出现：展开后下面的输入框已经把同一句
                  placeholder 写了一遍，两处一模一样的字同屏出现是噪音
                  （「同一句话不许一屏两遍」）。展开时这里只留标签。 */}
              {negativePromptExpanded ? (
                <span className="flex-1" />
              ) : (
                <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground/60">
                  {(state.advancedParams.negativePrompt ?? '').trim() ||
                    tPromptArea('negativePromptPlaceholder')}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast ease-standard',
                  negativePromptExpanded && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
            {negativePromptExpanded ? (
              <textarea
                aria-label={tPromptArea('negativePromptLabel')}
                value={state.advancedParams.negativePrompt ?? ''}
                onChange={(event) =>
                  dispatch({
                    type: 'SET_ADVANCED_PARAMS',
                    // ⚠ 整个对象带过去，只换一个键 —— `SET_ADVANCED_PARAMS` 是
                    //   整体替换，只发 negativePrompt 会把其余参数清空。
                    payload: {
                      ...state.advancedParams,
                      negativePrompt: event.target.value || undefined,
                    },
                  })
                }
                placeholder={tPromptArea('negativePromptPlaceholder')}
                rows={2}
                disabled={isGenerating}
                className="w-full resize-none rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
              />
            ) : null}
          </div>

          {/* 模型 —— 这一轮的名单。行不是丸：行能装下单价，缺价一眼看得出来。
              主模型 + 额外模型都在这里，选择器是多选的（三栏居中 modal，不受
              这 288px 的栏宽约束）。 */}
          {state.workflowMode === 'quick' && (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center text-2xs font-medium text-muted-foreground/70">
                {tForm('modelLabel')}
                {runModels.length > 1 ? (
                  <span className="ml-auto font-normal tabular-nums">
                    {t('modelCountSelected', { count: runModels.length })}
                  </span>
                ) : null}
              </span>
              {runModels.map((option) => (
                <div
                  key={option.optionId}
                  className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background pl-2.5 pr-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {getTranslatedModelLabel(tModels, option.modelId)}
                  </span>
                  {/* 每一行都能删，包括最后一条 —— 删空了就回到「请先选择模型」，
                      那本来就是个合法状态（发送时会拦并提示）。留一条删不掉的
                      行反而让「怎么换掉它」没有出口。 */}
                  <button
                    type="button"
                    onClick={() => handleRemoveRunModel(option.optionId)}
                    aria-label={t('modelRemove')}
                    className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              <MainModelPicker
                modality="image"
                layout="columns"
                // ⚠ 恒为 null：这里是纯粹的「添加」入口，不是「当前选中什么」的
                // 显示位。传选中值会让触发器和名单第一行写着同一个名字（真机
                // 抓到：名单 `FLUX LoRA` + 触发器 `FLUX LoRA ⌄`，同一条信息两遍）。
                // 选中状态由名单承担；面板里的勾选走 selectedOptionIds。
                value={null}
                onChange={(option) =>
                  dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
                }
                selectedOptionIds={runModelIds}
                onToggleOption={handleToggleRunModel}
                onRequestSetup={handleOpenQuickSetup}
                triggerEmptyLabel={
                  runModels.length > 0 ? t('modelAdd') : t('noModelHint')
                }
                searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
                emptySearchText={tForm('modelSelector.emptySearch')}
                className="w-full justify-start border-dashed"
              />
            </div>
          )}

          {/* 规格 —— 比例 / 清晰度 / 张数。回答「下一版长什么样」 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {t('specLabel')}
            </span>
            <StudioSpecPopover disabled={isGenerating} />
          </div>

          {/* 成本 + 生成 —— 一起沉到参数栏底部（`mt-auto` 挂在这层，不挂按钮，
              否则成本行会被留在上面、跟它解释的那个按钮隔开半栏）。 */}
          <div className="mt-auto flex shrink-0 flex-col gap-2">
            <StudioCostPreview
              models={runModels}
              perModelCount={state.imageBatchCount}
            />
            {/* 生成 —— 按钮上写清这一次会出几张 */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                void handleGenerate()
              }}
              disabled={isGenerating || isImagePromptOverLimit}
              aria-label={t('generate')}
              aria-busy={isGenerating}
              aria-disabled={!canGenerate}
              className={cn(
                'flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-sm',
                'transition-[background-color,transform,box-shadow] duration-fast ease-standard',
                'hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                // 挡住时降到次级填充。现在按钮上写着缺什么，就没有「点一下才知道」
                // 这层信息了，所以不必再用满强度的实心黑去引诱点击 —— 整屏唯一的
                // 最高强调留给真正能出图的那一刻。文字仍用 foreground 满强度：
                // 降的是底不是字，`muted-foreground` 落在浅底上过不了对比度。
                !isGenerating &&
                  blockedReason &&
                  'bg-muted text-foreground shadow-none hover:shadow-none',
                (isGenerating || isImagePromptOverLimit) &&
                  'cursor-not-allowed bg-muted text-muted-foreground shadow-none hover:shadow-none',
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {elapsedSeconds > 0
                    ? `${t('generating')} ${elapsedSeconds}s`
                    : t('generating')}
                </>
              ) : (
                // 缺什么就写在按钮上。按钮**保持可点**（Krea 式，点了还会 toast
                // 并把焦点送到该补的地方），但没必要让人点一下才知道缺模型 ——
                // 「模型：请先选择模型」就在同一栏上面两行，按钮再说一句
                // 「生成 1 张」等于跟旁边的事实对着干。
                (blockedReason?.message ??
                t('generateCount', {
                  count: Math.max(1, runModels.length) * state.imageBatchCount,
                }))
              )}
            </button>
          </div>
        </PromptInput>
      ) : (
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
              'group/input-group relative mx-auto w-full max-w-7xl 2xl:max-w-[88rem] rounded-none border-0 bg-transparent p-0 shadow-none outline-none [--studio-prompt-max-h:160px] md:[--studio-prompt-max-h:320px]',
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
                  animate={{
                    height: 'auto',
                    opacity: 1,
                    y: 0,
                    marginBottom: 8,
                  }}
                  exit={{ height: 0, opacity: 0, y: 6, marginBottom: 0 }}
                  transition={motionTransition('slow', reducedMotion)}
                >
                  <div className="studio-dock-control-row flex flex-col gap-2 px-1 md:flex-row md:items-center md:gap-3">
                    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
                      {isAudioMode && <StudioAudioKindSwitcher />}
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
                          // dock 是整宽容器，装得下三栏并列；画布节点上的 composer
                          // 丸装不下，那边保持默认的 drill。见 layout 的 prop 注释。
                          layout="columns"
                          triggerEmptyLabel={t('noModelHint')}
                          searchPlaceholder={tForm(
                            'modelSelector.searchPlaceholder',
                          )}
                          emptySearchText={tForm('modelSelector.emptySearch')}
                          filterOption={filterVideoModelByMode}
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
                previewLabel={(index) =>
                  tImageChip('previewReferenceImage', { index })
                }
                previewDescription={tImageChip('previewReferenceDescription')}
                previewCloseLabel={tImageChip('closeReferencePreview')}
                removeLabel={(index) =>
                  tImageChip('removeReferenceImage', { index })
                }
                onRemove={imageUpload.removeReferenceImage}
                overLimitTooltip={tImageChip('disabledOverLimit')}
                unsupportedTooltip={tImageChip('disabledUnsupported')}
                variant="composer"
                dragType={STUDIO_REFERENCE_DRAG_TYPE}
              />
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
                    disabled={
                      isGenerating ||
                      isAudioPromptOverLimit ||
                      isImagePromptOverLimit
                    }
                    aria-label={t('generate')}
                    aria-busy={isGenerating}
                    aria-disabled={!canGenerate}
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white shadow-sm transition-[background-color,transform,box-shadow]',
                      'hover:bg-neutral-800 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400',
                      (isGenerating ||
                        isAudioPromptOverLimit ||
                        isImagePromptOverLimit) &&
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
                          <Spinner size="md" />
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
            {isAudioMode && state.audioKind !== AUDIO_KIND.SFX && (
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
            {isImagePromptOverLimit && (
              <div className="flex justify-end px-3 pt-1 text-2xs tabular-nums text-destructive">
                {`${imagePromptLength}/${imagePromptMaxChars}`}
              </div>
            )}
          </PromptInput>
        </div>
      )}
    </>
  )
})
