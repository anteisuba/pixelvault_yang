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
import { toast } from 'sonner'
import {
  ChevronDown,
  FileAudio2,
  FileText,
  Loader2,
  Music2,
  Plus,
  X,
} from 'lucide-react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { useLocale, useTranslations } from 'next-intl'

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
import { VIDEO_UNIT_PRICE_BASE_RESOLUTION } from '@/constants/models/unit-prices'
import { isVideoResolution } from '@/constants/video-options'
import {
  getVideoModelParameterOptions,
  getVideoModelSendContract,
} from '@/constants/video-model-send-plan'
import { PLATFORM_GENERATION_GUARD, VIDEO_GENERATION } from '@/constants/config'
import type { AspectRatio } from '@/constants/config'
import { clampVideoSpecToModel } from '@/lib/studio/clamp-video-spec'
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
// 参数栏直接组合这几颗 —— 它们本来就是独立组件，不用经过一层横向工具条
// （`StudioToolbarPanels` / `StudioToolbar` 已随 dock 一起退役）。
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioEnhanceButton } from '@/components/business/studio/StudioEnhanceButton'
import { StudioCardsButton } from '@/components/business/studio/StudioCardsButton'
import { StudioCardSection } from '@/components/business/studio/StudioCardSection'
// 规格三档（比例 · 清晰度 · 张数）在参数栏里收进一个触发器 —— 只服务图片；
// 视频的比例仍是自己那颗独立 chip，切片 B 再合。
import { StudioSpecPopover } from '@/components/business/studio/StudioSpecPopover'
import { StudioVideoSpecPopover } from '@/components/business/studio/StudioVideoSpecPopover'
import { StudioVideoModeToggle } from '@/components/business/studio/StudioVideoModeToggle'
import { StudioSfxSpecPopover } from '@/components/business/studio/StudioSfxSpecPopover'
import { StudioMusicSpecPopover } from '@/components/business/studio/StudioMusicSpecPopover'
import { StudioAudioSpeechParams } from '@/components/business/studio/StudioAudioSpeechParams'
import {
  StudioCostPreview,
  type CostPreviewBasis,
} from '@/components/business/studio/StudioCostPreview'
import { StudioAudioKindSwitcher } from '@/components/business/studio/StudioAudioKindSwitcher'
import { StudioOperatorChangeRail } from '@/components/business/studio/assistant-operator'
import {
  claimOperatorGeneration,
  setOperatorPrimed,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'
import { composeCharacterInjection } from '@/lib/character-card-injection'
import { hasPlaceholders } from '@/lib/prompt-placeholders'
import { resolveInlineAudioReference } from '@/lib/studio/audio-reference'
import type {
  InspirationRecord,
  OutputType as RecipeOutputType,
  RecipeRecord,
} from '@/types'
import { PromptInput, PromptInputTextarea } from '@/components/ui/prompt-input'
import { QuickSetupDialog } from '@/components/business/studio-shared/setup/QuickSetupDialog'

/**
 * 模态专属那几颗丸的样式 —— 从退役的 `StudioToolbarPanels` 原样搬过来，
 * 好让切片 A 是一次纯搬迁：形态换成 `ParamIdiom` 里的「触发器 + 浮层」
 * 是切片 B / D 的事，那时这两个常量会一起消失。
 */
const modalityPillClass =
  'flex h-9 items-center gap-2 rounded-lg border border-border/60 px-3 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:border-primary/25 hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
const modalityPillActiveClass = 'border-primary/30 bg-primary/10 text-primary'

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
 * StudioPromptArea — 工作台左侧参数栏的全部内容：提示词 → 加料 chip →
 * 模态专属参数 → 模型 → 规格 → 成本 + 生成。
 *
 * ⚠ 曾有 `layout: 'dock' | 'panel'` 两套排布，2026-08-23 切片 A **删掉了 dock**
 * 那支 —— 三个模态统一走 `StudioWorkbenchLayout`，纵向 canvas + 底部丸整条路
 * （`StudioFlowLayout` / `StudioBottomDock` / `StudioToolbarPanels` /
 * `StudioToolbar`）一并退役，不留兼容层。
 *
 * 提示词输入与 `executeGenerate` 绑在一起，是这个组件不能按「参数 / 动作」
 * 拆开的唯一原因。
 */
export const StudioPromptArea = memo(function StudioPromptArea() {
  const { state, dispatch } = useStudioForm()
  const { styles, characters, backgrounds, imageUpload, projects } =
    useStudioData()
  const { isGenerating, generate, elapsedSeconds, canQueueMoreVideo } =
    useStudioGen()
  const t = useTranslations('StudioV2')
  const tV3 = useTranslations('StudioV3')
  const tForm = useTranslations('StudioForm')
  const tPromptArea = useTranslations('StudioPromptArea')
  const tImageChip = useTranslations('ImageChip')
  const tModels = useTranslations('Models')
  // 模态专属那几颗丸的文案 —— 命名空间沿用 dock 时期的，文案一个字没改
  const tBar = useTranslations('StudioToolbar')
  const tScript = useTranslations('VideoScript')
  const tVideoAudio = useTranslations('StudioVideoAudio')
  const tVideo = useTranslations('VideoGenerate')
  const locale = useLocale()
  /**
   * 助手「预填好的生成键」（owner 拍板：**钱是唯一硬闸**，助手只能把参数铺好，
   * 扣扳机的永远是用户）。只读一个布尔 —— 价钱由上面那行既有的
   * `StudioCostPreview` 报，⛔ 不在这里另算一个数（两处算价必然分叉）。
   */
  const { primed: isOperatorPrimed } = useStudioOperatorState()

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
  /**
   * 图片提示词的上限 —— **只认模型自己声明的那个数**（owner 2026-08-24）。
   *
   * ⚠ 这里以前是 `?? CARD_RECIPE.FREE_PROMPT_MAX_LENGTH`，也就是模型没声明就
   * 兜到 **2000**。那个 2000 的主人是**卡片配方**（`CreateCardRecipeSchema` 里
   * 「动作 / 姿势」那个输入框），被借来当了 quick 模式的默认上限 —— 于是一串
   * 正常的风格标签就能顶到 `2932/2000` 并把生成按钮锁死，而真正的请求边界
   * （`StudioGenerateSchema` 的 `FREE_PROMPT_ABSOLUTE_MAX_LENGTH`）是 **32000**。
   * 常量注释本来就写着「per-model gates decide the real quick-mode cap」。
   *
   * ⭐ 与音频那两层同构（`resolveAudioTextLimit`）：**declared** 是厂商声明的
   * 上限，没声明就没有 —— 给未知模型编一个保守数正是音频侧早就修掉的病
   * （那边的原话：refusing to invent a ceiling is the point）。超出请求边界时
   * 由服务端报错，走既有的错误对话框。
   *
   * card 模式不变：那条 freePrompt 就是卡片配方自己的字段，2000 是它的数。
   */
  const imagePromptMaxChars = !isImageMode
    ? undefined
    : state.workflowMode === 'quick'
      ? getModelById(selectedModel?.modelId ?? '')?.maxPromptChars
      : CARD_RECIPE.FREE_PROMPT_MAX_LENGTH
  const isImagePromptOverLimit =
    imagePromptMaxChars !== undefined && imagePromptLength > imagePromptMaxChars
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
  /**
   * 台账 A ②（owner 2026-08-29 拍板「加，按选中线路的契约判」）：挂了音频参考
   * 但一张图/一段视频都没挂时，有些线路会 400。
   *
   * ⚠ **判据按线路走，不按模型走** —— 同一个 Seedance 2.5，火山/BytePlus 那条
   * 允许纯音频参考（`audioRequiresVisual: false`），fal 那条不允许。所以这里读
   * `getVideoModelSendContract(modelId, adapterType)`，与服务端
   * `video-generation-validation.service.ts` 的同一份契约。
   *
   * ⚠ 服务端那道 400 在派发和扣费**之前**，所以不加这道闸也不会花钱 —— 加它是
   * 为了让用户在点「生成」**之前**就知道差什么，而不是等一次往返换回一句英文。
   * 画布那边同款（`sendPreview.blockers` 的 `audio-requires-visual`）。
   */
  const videoAudioNeedsVisual =
    isVideoMode &&
    state.videoAudioRefs.length > 0 &&
    !hasRefImage &&
    Boolean(
      selectedModel &&
      getVideoModelSendContract(
        selectedModel.modelId,
        selectedModel.adapterType as AI_ADAPTER_TYPES,
      ).slots.audioRequiresVisual,
    )
  const canGenerate =
    (usesStyleCardForModel
      ? !!styles.activeCardId && !!selectedStyleCard?.modelId
      : !!selectedModel?.modelId &&
        (isAudioMode || isVideoMode ? !!trimmedPrompt : hasPromptForImage)) &&
    (!modelRequiresRef || hasRefImage) &&
    !modelRejectsRefImages &&
    !isAudioPromptOverLimit &&
    !isImagePromptOverLimit &&
    !isAudioReferenceIncomplete &&
    !videoAudioNeedsVisual

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
    // 台账 A：音频参考的 URL 清单。面板已按选中端点的槽位上限挡过，这里不再裁。
    const videoAudioUrls = state.videoAudioRefs.map((ref) => ref.url)

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
      /**
       * 台账 A（owner 2026-08-29 拍板）—— **真正的断点就是这两行**。
       *
       * 只加「音频」面板而不改这里等于白做：schema / service / worker 三层早就
       * 收这两个字段，是 `buildVideoInput` 从来不填它们，所以工作台这条路一直
       * 做不出带指定音色的对白视频。
       *
       * ⚠ 两个字段都要送：`audioUrls` 是发给 provider 的音频清单，
       * `audioBindings` 只多带一个 `characterName` —— worker 据此生成
       * `{Name} (@AudioN)` 提示词 token（`workers/execution/src/index.ts`）。
       * 只送前者，多角色对白片里模型拿不到「谁在说话」。
       * ⚠ 容量不在这里裁：服务端按选中端点的契约校验（超槽 400），前端在面板
       * 里就按同一份契约挡住了 —— 这里再裁一刀会让两处的数悄悄分叉。
       */
      /**
       * 原生出声（台账 A「顺带」）。`null` = 用户没设过 → **不发这个字段**，最终
       * 值落到模型目录的 `videoDefaults.generateAudio`（服务端原样透传、worker 兜
       * 底）。发一个 `false` 上去与「没设过」在目录默认为 true 的模型上结果相反，
       * 所以这里必须区分三态，不能 `?? false`。
       */
      ...(state.videoGenerateAudio === null
        ? {}
        : { generateAudio: state.videoGenerateAudio }),
      ...(videoAudioUrls.length > 0
        ? {
            audioUrls: videoAudioUrls,
            audioBindings: state.videoAudioRefs.map((ref) => ({
              url: ref.url,
              ...(ref.ownerName ? { characterName: ref.ownerName } : {}),
            })),
          }
        : {}),
    }
  }, [
    selectedModel,
    state.selectedWorkflowId,
    state.prompt,
    state.aspectRatio,
    state.videoDuration,
    state.videoResolution,
    state.advancedParams.negativePrompt,
    state.videoAudioRefs,
    state.videoGenerateAudio,
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

  /**
   * 视频档的成本预览基准。
   *
   * ⚠ 必须按**真正会发出去的那两个值**算，不是 state 里的原始值 —— 切模型后
   * 残留的时长/分辨率会在出口被夹（见 `buildVideoInput` 的同名逻辑），按未夹的
   * 值报价就是报一个用户根本不会被收的数。两处的夹法写成同一个表达式，好让
   * 它们不一致时一眼看得出来。
   *
   * 契约不支持 duration（`durations` 为空 → 出口发 `'auto'`）时返回 null：
   * 长度未知就算不出总价，隐藏比编一个数诚实。
   */
  const videoCostBasis = useMemo<CostPreviewBasis | null>(() => {
    if (!isVideoMode || !selectedModel) return null

    const { durations, resolutions } = getVideoModelParameterOptions(
      selectedModel.modelId,
      selectedModel.adapterType,
    )
    if (durations.length === 0) return null

    const durationSeconds = durations.includes(state.videoDuration)
      ? state.videoDuration
      : durations.reduce((closest, candidate) =>
          Math.abs(candidate - state.videoDuration) <
          Math.abs(closest - state.videoDuration)
            ? candidate
            : closest,
        )

    // 用户没选档（或选的档被夹掉）时出口发的是 `undefined` —— 服务端走模型
    // 自己的 `videoDefaults.resolution`，所以报价也要按那一档算。
    const picked =
      state.videoResolution && resolutions.includes(state.videoResolution)
        ? state.videoResolution
        : (getModelById(selectedModel.modelId)?.videoDefaults?.resolution ??
          VIDEO_UNIT_PRICE_BASE_RESOLUTION)

    return {
      kind: 'video',
      durationSeconds,
      resolution: isVideoResolution(picked)
        ? picked
        : VIDEO_UNIT_PRICE_BASE_RESOLUTION,
    }
  }, [isVideoMode, selectedModel, state.videoDuration, state.videoResolution])

  /**
   * 视频 / 音频的单选换型号。除了 `SET_OPTION_ID`，还要**把规格收窄到新型号真
   * 支持的档位** —— 否则从 30 秒的型号切到 10 秒的型号，时长仍是 24，服务端按
   * `supportedDurations` 精确比对，「什么都没动只换了个模型」就 400。
   * 收窄规则与判据在 `clampVideoSpecToModel`（纯函数，有单测）。
   */
  const handleSelectSingleModel = useCallback(
    (option: SelectedModelOption) => {
      dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
      if (!isVideoMode) return

      const next = getVideoModelParameterOptions(
        option.modelId,
        option.adapterType,
      )
      const patch = clampVideoSpecToModel({
        durations: next.durations,
        resolutions: next.resolutions,
        aspectRatios: next.aspectRatios,
        current: {
          duration: state.videoDuration,
          resolution: state.videoResolution,
          aspectRatio: state.aspectRatio,
        },
        fallbackAspectRatio: VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
      })
      if (patch.duration !== undefined) {
        dispatch({ type: 'SET_VIDEO_DURATION', payload: patch.duration })
      }
      if (patch.resolution !== undefined) {
        dispatch({ type: 'SET_VIDEO_RESOLUTION', payload: patch.resolution })
      }
      if (patch.aspectRatio !== undefined) {
        dispatch({
          type: 'SET_ASPECT_RATIO',
          payload: patch.aspectRatio as AspectRatio,
        })
      }
    },
    [
      dispatch,
      isVideoMode,
      state.aspectRatio,
      state.videoDuration,
      state.videoResolution,
    ],
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
      const isMusic = state.audioKind === AUDIO_KIND.MUSIC
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
          // ⚠ 音效与音乐**共用**这一个字段，但取值来自各自的 state：音效 0.5–30 秒、
          //   音乐 5–600 秒。语音没有时长可言（由正文长度决定），传 undefined。
          durationSeconds: isSfx
            ? state.audioSfxDurationSeconds
            : isMusic
              ? state.audioMusicDurationSeconds
              : undefined,
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
    state.audioMusicDurationSeconds,
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
    // ⚠ 队列闸排在 `canGenerate` 之前：表单本身完全合法，挡住它的是「已经有 4 条
    //   在跑」。放在后面就永远轮不到 —— `canGenerate` 为真时这个函数直接返回 null。
    if (isVideoMode && !canQueueMoreVideo) {
      return {
        message: tPromptArea('blocked.videoQueueFull', {
          max: PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER,
        }),
      }
    }
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
    if (isImagePromptOverLimit && imagePromptMaxChars !== undefined) {
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
    if (videoAudioNeedsVisual) {
      return {
        message: tPromptArea('blocked.videoAudioNeedsVisual'),
        focusPrompt: 'nextFrame',
      }
    }
    return null
  }, [
    canGenerate,
    canQueueMoreVideo,
    usesStyleCardForModel,
    styles.activeCardId,
    selectedModel?.modelId,
    modelRequiresRef,
    hasRefImage,
    modelRejectsRefImages,
    videoAudioNeedsVisual,
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

      {/* 占位符填空 —— 灵感提示词里带 `{{...}}` 时弹它。
          ⚠ 原来只长在已删除的 dock 分支里：`handleApplyInspiration` 一直在
          `setPlaceholderDialog({open:true})`，但参数栏没有渲染它 —— 又一个
          「状态活着、门没开」。挂在 fragment 根上（Dialog，无布局足迹）。 */}
      <PlaceholderFillDialog
        open={placeholderDialog.open}
        onOpenChange={(open) =>
          setPlaceholderDialog((prev) => ({ ...prev, open }))
        }
        prompt={placeholderDialog.prompt}
        onApply={applyInspirationPrompt}
      />

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
        {/* 图片用途 —— **栏首第一决策**（切片 B）。它决定这一次发哪个端点，
            也决定下面「首帧 / 内容参考」那条输入轨叫什么名字、放得下几张；
            排在提示词之后就等于让人先写完再回头改前提。
            ⚠ 只在目录里真有 ≥2 档模型时渲染（组件自己判），少于 2 档没得选。 */}
        {isVideoMode ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {tBar('videoMode')}
            </span>
            <StudioVideoModeToggle disabled={isGenerating} />
          </div>
        ) : null}

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
          {/* 音频的字数 / 分钟数 / 上限 —— 从 dock 搬进来（切片 A）。音效那一档
              的提示词是「音效描述」，没有朗读时长可估，所以不印。 */}
          {isAudioMode && state.audioKind !== AUDIO_KIND.SFX && (
            <span
              className={cn(
                'text-2xs tabular-nums',
                isAudioPromptOverLimit
                  ? 'text-destructive'
                  : isAudioPromptNearLimit
                    ? 'text-amber-600'
                    : 'text-muted-foreground/70',
              )}
            >
              {audioPromptMeta}
            </span>
          )}
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
          {/* ⚠ 音频没有参考图这回事 —— dock 时代它的工具条里本来就没有这颗
              （`StudioToolbarPanels` 的音频分支只有 助手 / 音色 / 克隆 / 转脚本）。
              参数栏这一行是三模态共用的，不加这个闸就等于给语音凭空多一个
              点了没用的入口。音频要传的是**参考音频**，在音色面板里。 */}
          {!isAudioMode ? <ReferenceImageChip disabled={isGenerating} /> : null}
          {/* 卡片入口 —— 切片 A 从退役的 `StudioToolbar` 搬过来的唯一一颗。
              其余四颗（助手 / 参考图 / 比例 / 张数）参数栏本来就有：比例与张数
              在「规格」浮层里，参考图就在左边，助手是右上角浮标。
              ⚠ 不搬这一颗的话，卡片工作流在工作台里**没有任何入口** ——
              `workflowMode` 从 localStorage 恢复成 `card` 时，模型名单被
              `workflowMode === 'quick'` 挡掉，而卡片选择器又不在，整栏是死的。 */}
          {isImageMode ? <StudioCardsButton disabled={isGenerating} /> : null}
          {/* 助手在 lg 以上由右上角的 StudioAssistantFab 承担（owner
                2026-08-14），这里只留小屏那份 —— 不是重复：小屏没有浮标，
                抽屉宿主就长在这颗丸里面，删了小屏就没有助手入口了。 */}
          <span className="contents lg:hidden">
            <StudioEnhanceButton disabled={isGenerating} />
          </span>
        </Toolbar.Root>

        {/* 助手改了哪些字段（✦ 归属标记）+ 覆写用的就地确认条 —— 紧贴提示词框，
            因为它们说的就是这一栏正在发生的事（owner 拍板：覆写确认是「字段上的
            小条，不弹窗」，且改动必须看得见来源；详见 `StudioOperatorChangeRail`）。
            ⚠ 助手没改过东西、也没在问话时它整颗不渲染，不占位。 */}
        <StudioOperatorChangeRail />

        {/* 卡片工作流的下拉组 —— 原来长在 `StudioBottomDock` 里，随 dock 一起
            退役，改挂这里。条件与旧版逐字一致（音频没有卡片）。 */}
        {state.workflowMode === 'card' && !isAudioMode ? (
          <StudioCardSection />
        ) : null}

        {/* ── 模态专属的「另一条线」────────────────────────────────────
            视频只剩「剧本」（分镜编排那条线，切片 C 才给它形态）；音频那排
            仍是切片 A 原样搬来的丸，按 `ParamIdiom` 重排是切片 D 的事。
            ⚠ 规格类的参数不在这里：视频的时长 / 分辨率 / 比例已并进下面的
            「规格」浮层，反向提示词并进折叠行 —— 参数区回答「下一版长什么样」，
            这一行回答「我现在要做什么」。 */}
        {isVideoMode ? (
          <>
            <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: 'TOGGLE_PANEL', payload: 'script' })
                }
                disabled={isGenerating}
                className={cn(
                  modalityPillClass,
                  state.panels.script && modalityPillActiveClass,
                )}
              >
                <FileText className="size-4" />
                {tScript('panelTitle')}
              </button>
              {/*
                台账 A（owner 2026-08-29）：**挂音频参考的入口**。此前这一行只有
                「剧本」一颗丸，整个工作台找不到任何挂音频的地方 —— 而「全能参考」
                那一档选得到、Seedance 2.5 的音频槽有 10 个、后端三层全通。
                ⚠ 挂了几条要显示出来：不显示的话，用户切走再回来根本不知道这次
                请求还带着音频（图片参考那颗丸同款处理）。
              */}
              <button
                type="button"
                onClick={() =>
                  dispatch({ type: 'TOGGLE_PANEL', payload: 'videoAudio' })
                }
                disabled={isGenerating}
                className={cn(
                  modalityPillClass,
                  state.panels.videoAudio && modalityPillActiveClass,
                )}
              >
                <Music2 className="size-4" />
                {tVideoAudio('pill')}
                {state.videoAudioRefs.length > 0 ? (
                  <span className="tabular-nums">
                    {state.videoAudioRefs.length}
                  </span>
                ) : null}
              </button>
            </Toolbar.Root>
          </>
        ) : null}

        {isAudioMode ? (
          <>
            <StudioAudioKindSwitcher />
            {/* ⚠ 音色 / 克隆 / 音频转脚本**只属于语音档**。今天工具条只判了音效
                一个分支，于是切到「音乐」显示的仍是这三颗 —— 对一段配乐来说
                「换音色」「克隆」都没有意义（Main 板 E7）。判据改成正列语音，
                新增档位默认不继承语音的栏位。 */}
            {state.audioKind === AUDIO_KIND.SPEECH ? (
              <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
                <>
                  {/* ⚠ 音色**不在这一行** —— 它已经是下面「音色」那一栏（形态 3
                      的行），在这里再放一颗丸就是同一条信息一屏两遍。留在这行的
                      两颗是**动作**不是参数：克隆一个新音色、把一段音频转成稿子。 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (state.panels.voiceSelector) {
                        dispatch({
                          type: 'CLOSE_PANEL',
                          payload: 'voiceSelector',
                        })
                      }
                      dispatch({
                        type: 'TOGGLE_PANEL',
                        payload: 'voiceTrainer',
                      })
                    }}
                    disabled={isGenerating}
                    className={cn(
                      modalityPillClass,
                      state.panels.voiceTrainer && modalityPillActiveClass,
                    )}
                  >
                    <Plus className="size-4" />
                    {tBar('clone')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (state.panels.voiceSelector) {
                        dispatch({
                          type: 'CLOSE_PANEL',
                          payload: 'voiceSelector',
                        })
                      }
                      if (state.panels.voiceTrainer) {
                        dispatch({
                          type: 'CLOSE_PANEL',
                          payload: 'voiceTrainer',
                        })
                      }
                      dispatch({
                        type: 'TOGGLE_PANEL',
                        payload: 'audioTranscribe',
                      })
                    }}
                    disabled={isGenerating}
                    className={cn(
                      modalityPillClass,
                      state.panels.audioTranscribe && modalityPillActiveClass,
                    )}
                  >
                    <FileAudio2 className="size-4" />
                    {tBar('transcribe')}
                  </button>
                </>
              </Toolbar.Root>
            ) : null}
          </>
        ) : null}

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
              域的皮肤绑死；这里用条件渲染，行为一致、无跨域依赖。
              ⚠ 图片 + 视频共用这一条：两边写的是**同一个字段**
              （`advancedParams.negativePrompt`），视频那份原本长在「视频设置」
              对话框里，切片 B 把对话框整个退役了，字段的家从此只有这一个。
              音频没有这个字段，所以不渲染。 */}
        {!isAudioMode ? (
          <div
            className="flex flex-col"
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
              aria-controls="studio-negative-prompt-input"
              onClick={() => setNegativePromptExpanded((open) => !open)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-[7px] text-left transition-colors duration-fast ease-standard hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background coarse:min-h-11"
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
            <div
              aria-hidden={!negativePromptExpanded}
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-base ease-standard motion-reduce:transition-none',
                negativePromptExpanded
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div
                className="min-h-0 overflow-hidden"
                inert={!negativePromptExpanded}
              >
                <div className="pt-1.5">
                  <textarea
                    id="studio-negative-prompt-input"
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
                    className="h-[46px] w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-2xs outline-none transition-colors duration-fast ease-standard placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* 模型（视频 / 音频）—— **单选**。这两个模态没有对比路径：
            `generate()` 里视频那支直接 `generateVideo`（恒 `mode:'single'`），
            音频只有音效档有 `variantCount`。给它们一份多选名单会画出一个
            发不出去的矩阵。⚠ 视频还要按「用途」收窄端点（`filterOption`），
            与工具条上的分段控件同一个源。 */}
        {state.workflowMode === 'quick' && !isImageMode && (
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {tForm('modelLabel')}
            </span>
            <MainModelPicker
              modality={isAudioMode ? 'audio' : 'video'}
              layout="columns"
              value={state.selectedOptionId ?? null}
              onChange={handleSelectSingleModel}
              onRequestSetup={handleOpenQuickSetup}
              triggerEmptyLabel={t('noModelHint')}
              searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
              emptySearchText={tForm('modelSelector.emptySearch')}
              filterOption={filterVideoModelByMode}
              className="w-full justify-start"
            />
          </div>
        )}

        {/* 模型（图片）—— 这一轮的名单。行不是丸：行能装下单价，缺价一眼看得出来。
              主模型 + 额外模型都在这里，选择器是多选的（三栏居中 modal，不受
              这 288px 的栏宽约束）。 */}
        {state.workflowMode === 'quick' && isImageMode && (
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

        {/* 规格 —— 回答「下一版长什么样」。同一个形态、两套数据：
            图片 = 比例 · 清晰度 · 每模型几张；视频 = 时长 · 分辨率 · 比例。
            ⚠ 两颗**不能合成一颗**：数据源完全不同（图片读能力表的
            `resolutionOptions` + `IMAGE_BATCH_COUNTS`，视频读
            `getVideoModelParameterOptions` 实算的档位），合起来会变成一个
            满是 `isVideoMode ?` 的分支堆。共用的是形态与药丸样式，不是组件。
            音频没有规格这一说（时长/变体归音效自己的浮层，切片 D）。 */}
        {isImageMode ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {t('specLabel')}
            </span>
            <StudioSpecPopover disabled={isGenerating} />
          </div>
        ) : null}
        {isVideoMode ? (
          <StudioVideoSpecPopover disabled={isGenerating} />
        ) : null}
        {isAudioMode && state.audioKind === AUDIO_KIND.SFX ? (
          <StudioSfxSpecPopover disabled={isGenerating} />
        ) : null}
        {/* 音乐档补上它唯一缺的那一栏。⚠ 这不是新功能：适配器早就读
            `durationSeconds`，只是没人传，于是所有音乐都是兜底的 30 秒。 */}
        {isAudioMode && state.audioKind === AUDIO_KIND.MUSIC ? (
          <StudioMusicSpecPopover disabled={isGenerating} />
        ) : null}
        {/* 语音档的音色 / 朗读 / 高级 —— 原来长在音色库弹层的侧栏里，也就是说
            要调个语速得先打开音色库。切片 D 把「怎么念」搬进栏，「谁来念」留在
            面板。 */}
        {isAudioMode && state.audioKind === AUDIO_KIND.SPEECH ? (
          <StudioAudioSpeechParams disabled={isGenerating} />
        ) : null}

        {/* 成本 + 生成 —— 一起沉到参数栏底部（`mt-auto` 挂在这层，不挂按钮，
              否则成本行会被留在上面、跟它解释的那个按钮隔开半栏）。 */}
        <div className="mt-auto flex shrink-0 flex-col gap-2">
          {/* 成本预览覆盖图片与视频。音频还没有：单价表里一条音频条目都没有，
              按既有规矩缺价留空，不填猜的数。
              ⚠ 视频恒单条 —— 传的是 `selectedModel` 而不是 `runModels`（那份
              是图片矩阵的名单，视频模式下本来就是空的）。 */}
          {isImageMode ? (
            <StudioCostPreview
              models={runModels}
              basis={{ kind: 'image', perModelCount: state.imageBatchCount }}
            />
          ) : null}
          {isVideoMode && selectedModel && videoCostBasis ? (
            <StudioCostPreview
              models={[selectedModel]}
              basis={videoCostBasis}
            />
          ) : null}
          {/* 生成 —— 按钮上写清这一次会出几张 */}
          <button
            type="button"
            data-operator-primed={isOperatorPrimed ? 'true' : undefined}
            onClick={(event) => {
              event.stopPropagation()
              /**
               * ⭐ 归属追踪（P3-C，拍板 4「自动只看它自己备的那次」）：**只有
               * primed 态下真的打出去的那一枪**才领票。用户自己配好表单点的那些
               * 一律不领 —— 于是助手根本拿不到它们的结果图，「不打扰」在结构上
               * 成立，不靠模型自觉。
               * ⚠ 三个前提与下面 `handleGenerate` 自己的守卫**逐条一致**：
               *   被 `blockedReason` 挡下的那一次只弹 toast、什么都没生成，
               *   在那里领票会让这张票飘到用户接下来自己发的那一枪上。
               */
              if (isOperatorPrimed && !isGenerating && !blockedReason) {
                claimOperatorGeneration()
              }
              // 助手预填的那一枪打出去了 —— primed 是「等你来点」，点完就该灭
              // （owner 拍板：钱是唯一硬闸）。
              // ⛔ 助手在服务端一条能创建 generation 的工具都没有：扣扳机的
              //    永远是这一下点击。
              setOperatorPrimed(false)
              void handleGenerate()
            }}
            disabled={
              isGenerating || isImagePromptOverLimit || isAudioPromptOverLimit
            }
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
              (isGenerating ||
                isImagePromptOverLimit ||
                isAudioPromptOverLimit) &&
                'cursor-not-allowed bg-muted text-muted-foreground shadow-none hover:shadow-none',
              // 助手把表单配好了、价钱就在上面那行 —— 这一圈是「等你来点」。
              // ⚠ 只加一圈 ring，**不改按钮的文案与行为**：钱闸是这一下点击，
              //   把它做得更像「已经在跑」只会让人以为不用点了。
              isOperatorPrimed &&
                !isGenerating &&
                !blockedReason &&
                'ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
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
              // ⚠ 只有图片按「模型数 × 张数」报数。视频恒出 1 条、语音恒出 1 条，
              //   给它们印一个乘法结果等于承诺一个发不出去的矩阵。
              (blockedReason?.message ??
              (isVideoMode
                ? `${tVideo('generateButton')} · ${state.videoDuration}s`
                : isAudioMode
                  ? t('generate')
                  : t('generateCount', {
                      count:
                        Math.max(1, runModels.length) * state.imageBatchCount,
                    })))
            )}
          </button>
        </div>
      </PromptInput>
    </>
  )
})
