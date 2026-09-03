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
import { useTranslations } from 'next-intl'

import {
  STUDIO_PROMPT_TEXTAREA_ID,
  STUDIO_REFERENCE_DRAG_TYPE,
} from '@/constants/studio'
import { WORKFLOW_IDS } from '@/constants/workflows'
import {
  SAMPLE_PROMPT_KEYS,
  SAMPLE_PROMPT_STORAGE_KEY,
} from '@/constants/sample-prompts'
import { AUDIO_KIND } from '@/constants/audio-options'
import {
  STUDIO_TOOL_PANEL_NAMES,
  useStudioForm,
  useStudioData,
} from '@/contexts/studio-context'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { modelSupportsLora } from '@/constants/models'
import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
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
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioAudioKindSwitcher } from '@/components/business/studio/StudioAudioKindSwitcher'
import { StudioOperatorChangeRail } from '@/components/business/studio/assistant-operator'
import {
  claimOperatorGeneration,
  setOperatorPrimed,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'
import { hasPlaceholders } from '@/lib/prompt-placeholders'
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
  'touch-target-y flex h-9 items-center gap-2 rounded-lg border border-border/60 px-3 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:border-primary/25 hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
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
  const { styles, imageUpload } = useStudioData()
  const t = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tPromptArea = useTranslations('StudioPromptArea')
  const tImageChip = useTranslations('ImageChip')
  const tModels = useTranslations('Models')
  // 模态专属那几颗丸的文案 —— 命名空间沿用 dock 时期的，文案一个字没改
  const tBar = useTranslations('StudioToolbar')
  const tScript = useTranslations('VideoScript')
  const tVideoAudio = useTranslations('StudioVideoAudio')
  const tVideo = useTranslations('VideoGenerate')
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

  /**
   * 「这一枪能不能打、打出去发什么」整块住在 `useStudioGenerateAction`
   * （2026-09-03 移动端切片抽出）。**移动端底部 composer 的方形生成键调的是同一个
   * hook** —— 禁用判据、toast 文案、请求组装三件事只有一份实现。
   * ⚠ 该 hook 内含 `REQUEST_GENERATE` 的执行端副作用，所以本组件与
   * `StudioMobileComposer` 必须二选一渲染（见 `StudioWorkbenchLayout`）。
   */
  const {
    selectedModel,
    modelOptions,
    runModels,
    runModelIds,
    filterVideoModelByMode,
    handleSelectSingleModel,
    handleToggleRunModel,
    handleRemoveRunModel,
    isImageMode,
    canGenerate,
    blockedReason,
    handleGenerate,
    isGenerating,
    elapsedSeconds,
    imagePromptLength,
    imagePromptMaxChars,
    isImagePromptOverLimit,
    isAudioPromptOverLimit,
    isAudioPromptNearLimit,
    audioPromptMeta,
    videoCostBasis,
  } = useStudioGenerateAction()

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
              // ⚠ `text-base` 在 <768 是硬要求：iOS Safari 对小于 16px 的可聚焦
              //    输入框会自动放大整页。桌面照旧 14px。
              className="min-h-20 px-1 py-1 font-sans text-base leading-5 disabled:opacity-100 md:text-sm"
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
                    ? 'text-status-warning'
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
                    // ⚠ 见提示词框那条：<768 必须 ≥16px，否则 iOS 聚焦即放大。
                    className="h-[46px] w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-base outline-none md:text-2xs transition-colors duration-fast ease-standard placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
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
