'use client'

import {
  memo,
  useCallback,
  useRef,
  useEffect,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import { ChevronDown, FileAudio2, FileText, Plus, X } from '@/components/icons'
import * as Toolbar from '@radix-ui/react-toolbar'
import { useTranslations } from 'next-intl'

import {
  STUDIO_PROMPT_TEXTAREA_ID,
  STUDIO_REFERENCE_DRAG_TYPE,
} from '@/constants/studio'
import {
  SAMPLE_PROMPT_KEYS,
  SAMPLE_PROMPT_STORAGE_KEY,
} from '@/constants/sample-prompts'
import { AUDIO_KIND } from '@/constants/audio-options'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import {
  STUDIO_TOOL_PANEL_NAMES,
  useStudioForm,
  useStudioData,
} from '@/contexts/studio-context'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { useStudioPromptTemplates } from '@/hooks/use-studio-prompt-templates'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { useStudioVideoAssets } from '@/hooks/use-studio-video-assets'
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
import { StudioInpaintMaskChip } from '@/components/business/studio/StudioInpaintMaskChip'
import { StudioVideoAssetRail } from '@/components/business/studio-shared/chrome/StudioVideoAssetRail'
import { StudioEnhanceButton } from '@/components/business/studio/StudioEnhanceButton'
import { StudioCardsButton } from '@/components/business/studio/StudioCardsButton'
import { StudioCardSection } from '@/components/business/studio/StudioCardSection'
// 规格收成**一颗 chip**（D2 ④，第 12 项）：图片与视频共用同一颗，档位各自从能力表
// 派生；张数 / 声音在它底部的「更多」折叠区里。
import { StudioSpecChip } from '@/components/business/studio/StudioSpecChip'
import { StudioModelCapabilityChips } from '@/components/business/studio/StudioModelCapabilityChips'
import { StudioDialectHeader } from '@/components/business/studio/tags/StudioDialectHeader'
import { StudioDialectJumpHint } from '@/components/business/studio/tags/StudioDialectJumpHint'
import { StudioSfxSpecPopover } from '@/components/business/studio/StudioSfxSpecPopover'
import { StudioMusicSpecPopover } from '@/components/business/studio/StudioMusicSpecPopover'
import { StudioAudioSpeechParams } from '@/components/business/studio/StudioAudioSpeechParams'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioAudioKindSwitcher } from '@/components/business/studio/StudioAudioKindSwitcher'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { cn } from '@/lib/utils'
import { PromptInput, PromptInputTextarea } from '@/components/ui/prompt-input'
import { Spinner } from '@/components/ui/spinner'
import { StudioReferencePromptInput } from './StudioReferencePromptInput'
import { StudioVideoPromptInput } from './StudioVideoPromptInput'
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
  const { imageUpload } = useStudioData()
  const t = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tPromptArea = useTranslations('StudioPromptArea')
  const tImageChip = useTranslations('ImageChip')
  const tImageUpload = useTranslations('ImageUpload')
  const tModels = useTranslations('Models')
  // 模态专属那几颗丸的文案 —— 命名空间沿用 dock 时期的，文案一个字没改
  const tBar = useTranslations('StudioToolbar')
  const tScript = useTranslations('VideoScript')
  const tVideo = useTranslations('VideoGenerate')
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

  const isAudioMode = state.outputType === 'audio'
  const isVideoMode = state.outputType === 'video'
  /**
   * 视频档的负面提示词行**按这一枪实际跑的端点**显隐（owner 09-24 视频画板 ③）：
   * 大多数视频模型没有这个字段，写了会被静默丢掉 —— 那一行就不该出现。
   */
  const videoAssets = useStudioVideoAssets()
  const videoTakesNegative = Boolean(
    videoAssets.send &&
    getVideoModelSendContract(videoAssets.send.modelId).parameters
      .negativePrompt,
  )

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
    filterVideoModelOption,
    filterModelByDialect,
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

  const [negativePromptExpanded, setNegativePromptExpanded] = useState(false)
  const {
    currentTemplateOutputType,
    currentTemplateParams,
    handleApplyRecipe,
    handleApplyInspiration,
    placeholderDialog,
    setPlaceholderDialog,
    applyInspirationPrompt,
  } = useStudioPromptTemplates(modelOptions)

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
    (event: ClipboardEvent<HTMLElement>) => {
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

      {/* 两台之间那扇门的**这一侧**。⚠ 与标签台挂的是同一颗组件、同一个位置
          （参数列的第一行）—— 只装一边它就不是门，是单向阀。
          ⛔ 只给图片档：视频与音频没有方言这一说。 */}
      {isImageMode ? <StudioDialectHeader disabled={isGenerating} /> : null}

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
        {/* 素材轨 —— **栏首**（owner 09-24 视频画板 ①）：图、视频、音频一条轨，
            按类型编号（图片1 · 视频1 · 音频1），首 / 尾帧是图片上的角标。这一枪怎么发
            由挂了什么推出来，写在轨下面一行灰字 —— ⛔ 没有模式分段。 */}
        {isVideoMode ? <StudioVideoAssetRail disabled={isGenerating} /> : null}

        {/* 提示词 —— 参数栏里它是一块独立的输入区，不再和发送键挤一行 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-2xs font-medium text-muted-foreground/70">
            {tForm('promptLabel')}
          </span>
          <div className="studio-composer rounded-xl border border-border/60 px-2 py-1.5">
            {/* ⚠ 视频档的参考图在素材轨上（带编号与角标），⛔ 不在这里再画一条。 */}
            {isVideoMode ? null : (
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
            )}
            {imageUpload.isUploading && (
              <div
                role="status"
                className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground"
              >
                <Spinner aria-hidden="true" className="size-4 shrink-0" />
                {tImageUpload('uploading')}
              </div>
            )}
            {isImageMode ? (
              <StudioReferencePromptInput
                placeholder={placeholder}
                disabled={isGenerating}
                onPaste={handlePromptPaste}
                onSubmit={handleGenerate}
                className="min-h-20 max-h-56 overflow-y-auto px-1 py-1 font-sans text-base leading-6 md:text-sm"
              />
            ) : isVideoMode ? (
              // 视频档：正文里的素材编号按模型写法渲染成缩略图胶囊。
              <StudioVideoPromptInput
                placeholder={placeholder}
                disabled={isGenerating}
                onPaste={handlePromptPaste}
                onSubmit={handleGenerate}
                className="min-h-20 max-h-56 overflow-y-auto px-1 py-1 font-sans text-base leading-6 md:text-sm"
              />
            ) : (
              <PromptInputTextarea
                id={STUDIO_PROMPT_TEXTAREA_ID}
                aria-label={tForm('promptLabel')}
                placeholder={placeholder}
                onPaste={handlePromptPaste}
                // ⚠ `text-base` 在 <768 是硬要求：iOS Safari 对小于 16px 的可聚焦
                //    输入框会自动放大整页。桌面照旧 14px。
                className="min-h-20 px-1 py-1 font-sans text-base leading-5 disabled:opacity-100 md:text-sm"
              />
            )}
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
        {!isAudioMode && (!isVideoMode || videoTakesNegative) ? (
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

        {/* 往提示词里加东西的两个动作：模板 / 参考图。紧贴输入框，不进「参数」。
              ⚠ 必须裹 Toolbar.Root —— 这几颗 chip 底下是 Radix `Toolbar.Button`，
              没有 roving-focus context 会直接抛 `RovingFocusGroupItem must be used
              within RovingFocusGroup`。dock 那边由 StudioToolbar 提供，参数栏得自己给。 */}
        <Toolbar.Root
          className={cn(
            isVideoMode
              ? 'grid grid-cols-2 gap-2 [&>button]:w-full [&>button]:justify-start'
              : 'flex flex-wrap items-center gap-1.5',
          )}
        >
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
          {/* ⚠ 视频档这颗**不渲染**（owner 09-24 视频画板 ④）：图片进素材轨的「＋」，
              带编号与首尾帧角标。留着它等于同一件事两个入口。 */}
          {isImageMode ? <ReferenceImageChip disabled={isGenerating} /> : null}
          {/* 遮罩重绘挨着参考图 —— 它改的就是那张图。能力表没声明 `inpaint`
              的模型下它整颗不渲染（判据在组件里，⛔ 这里不写模型名）。 */}
          {isImageMode ? (
            <StudioInpaintMaskChip disabled={isGenerating} />
          ) : null}
          {/* 卡片入口 —— 切片 A 从退役的 `StudioToolbar` 搬过来的唯一一颗。
              其余四颗（助手 / 参考图 / 比例 / 张数）参数栏本来就有：比例与张数
              在「规格」浮层里，参考图就在左边，助手是右上角浮标。
              ⚠ 不搬这一颗的话，卡片工作流在工作台里**没有任何入口** ——
              `workflowMode` 从 localStorage 恢复成 `card` 时，模型名单被
              `workflowMode === 'quick'` 挡掉，而卡片选择器又不在，整栏是死的。 */}
          {isImageMode ? <StudioCardsButton disabled={isGenerating} /> : null}
          {/* 视频档：「模板 · 剧本」一行两颗（owner 09-24 视频画板 ④）。音频参考
              进了素材轨的「＋」，⛔ 不再单独一颗。 */}
          {isVideoMode ? (
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'script' })
              }
              disabled={isGenerating}
              // 与「模板」那颗同一种幽灵样式 —— 两颗并排，⛔ 一颗带框一颗不带。
              className={cn(
                'flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50',
                state.panels.script && 'bg-muted/55 text-foreground',
              )}
            >
              <FileText className="size-4" />
              {tScript('panelTitle')}
            </button>
          ) : null}
          {/* 助手在 lg 以上由右上角的 StudioAssistantFab 承担（owner
                2026-08-14），这里只留小屏那份 —— 不是重复：小屏没有浮标，
                抽屉宿主就长在这颗丸里面，删了小屏就没有助手入口了。 */}
          <span className="contents lg:hidden">
            <StudioEnhanceButton disabled={isGenerating} />
          </span>
        </Toolbar.Root>

        {/* 卡片工作流的下拉组 —— 原来长在 `StudioBottomDock` 里，随 dock 一起
            退役，改挂这里。条件与旧版逐字一致（音频没有卡片）。 */}
        {state.workflowMode === 'card' && !isAudioMode ? (
          <StudioCardSection />
        ) : null}

        {isAudioMode ? (
          <>
            <StudioAudioKindSwitcher />
            {/* ⚠ 音色 / 克隆 / 音频转脚本**只属于语音档**。今天工具条只判了音效
                一个分支，于是切到「音乐」显示的仍是这三颗 —— 对一段配乐来说
                「换音色」「克隆」都没有意义（Main 板 E7）。判据改成正列语音，
                新增档位默认不继承语音的栏位。 */}
            {state.audioKind === AUDIO_KIND.SPEECH ? (
              <Toolbar.Root
                className={cn(
                  isVideoMode
                    ? 'grid grid-cols-2 gap-2 [&>button]:w-full [&>button]:justify-start'
                    : 'flex flex-wrap items-center gap-1.5',
                )}
              >
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

        {/* 模型（视频 / 音频）—— **单选**。这两个模态没有对比路径：
            `generate()` 里视频那支直接 `generateVideo`（恒 `mode:'single'`），
            音频只有音效档有 `variantCount`。给它们一份多选名单会画出一个
            发不出去的矩阵。⚠ 视频还要按「用途」收窄端点（`filterOption`），
            与工具条上的分段控件同一个源。 */}
        {state.workflowMode === 'quick' && !isImageMode && (
          // `data-assistant-field` = 助手改到这一格时闪一次（进度表 21）。
          <div className="flex flex-col gap-1.5" data-assistant-field="model">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {tForm('modelLabel')}
            </span>
            <MainModelPicker
              modality={isAudioMode ? 'audio' : 'video'}
              value={state.selectedOptionId ?? null}
              onChange={handleSelectSingleModel}
              onRequestSetup={handleOpenQuickSetup}
              triggerEmptyLabel={t('noModelHint')}
              searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
              emptySearchText={tForm('modelSelector.emptySearch')}
              filterOption={filterVideoModelOption}
              className="w-full justify-start"
              // 与图片那颗同一个宽度与对齐（22f47e25 只修了图片档）。
              popoverAlign="start"
              contentClassName="w-80"
            />
          </div>
        )}

        {/* 模型（图片）—— 这一轮的名单。行不是丸：行能装下单价，缺价一眼看得出来。
              主模型 + 额外模型都在这里，选择器是多选的（三栏居中 modal，不受
              这 288px 的栏宽约束）。 */}
        {state.workflowMode === 'quick' && isImageMode && (
          <div className="flex flex-col gap-1.5" data-assistant-field="model">
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
              // 名单只列自然语言方言的型号（D10 ② Q3）；真搜到标签模型时
              // 底下给一行「带你去标签台」，⛔ 不把它混进名单。
              filterOption={filterModelByDialect}
              renderSearchFallback={(query, close) => (
                <StudioDialectJumpHint query={query} close={close} />
              )}
              onRequestSetup={handleOpenQuickSetup}
              triggerEmptyLabel={
                runModels.length > 0 ? t('modelAdd') : t('noModelHint')
              }
              searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
              emptySearchText={tForm('modelSelector.emptySearch')}
              popoverAlign="start"
              contentClassName="w-80"
              className="w-full justify-start border-dashed"
            />
          </div>
        )}

        {/* 规格 —— 回答「下一版长什么样」。**一颗 chip**（D2 ④ Q4 = A，第 12 项）：
            chip 上是全量摘要「比例 · 清晰度（· 时长）」，点开一个弹层分段，
            张数 / 声音收进底部「更多」。图片与视频共用同一颗组件，档位各自从
            能力表派生 —— ⛔ 不再是两颗形态相同、数据两套的浮层。
            音频没有规格这一说（时长/变体归音效自己的浮层，切片 D）。 */}
        {isImageMode || isVideoMode ? (
          <div className="flex flex-col gap-1.5" data-assistant-field="specs">
            <span className="text-2xs font-medium text-muted-foreground/70">
              {t('specLabel')}
            </span>
            <StudioSpecChip
              disabled={isGenerating}
              triggerClassName="h-9 w-full justify-start"
            />
          </div>
        ) : null}
        {/* 专属区 —— 通用区之下一条虚线，之下是「专属 · <模型名>」+ chip 行
            （D2 ④ 能力驱动表单）。名单只从 `provider-capabilities` 派生，
            ⛔ 这里不写模型名；没有专属能力的模型整段不渲染。 */}
        {isImageMode ? (
          <StudioModelCapabilityChips disabled={isGenerating} />
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
              basis={{
                kind: 'image',
                perModelCount: state.imageBatchCount,
                aspectRatio: state.aspectRatio,
                resolution: state.advancedParams.resolution,
                quality: state.advancedParams.quality,
                preview: state.advancedParams.preview,
              }}
            />
          ) : null}
          {isVideoMode && selectedModel && videoCostBasis ? (
            <StudioCostPreview
              models={[selectedModel]}
              basis={videoCostBasis}
            />
          ) : null}
          {/* 生成 —— 按钮上写清这一次会出几张。三个模态与标签台同一颗
              （`StudioGenerateButton`），⛔ 别在宿主里各写一份三态。 */}
          <StudioGenerateButton
            ariaLabel={t('generate')}
            isGenerating={isGenerating}
            elapsedSeconds={elapsedSeconds}
            canGenerate={canGenerate}
            disabled={
              isGenerating || isImagePromptOverLimit || isAudioPromptOverLimit
            }
            blockedMessage={blockedReason?.message}
            busyLabel={t('generating')}
            /* ⚠ 只有图片按「模型数 × 张数」报数。视频恒出 1 条、语音恒出 1 条，
               给它们印一个乘法结果等于承诺一个发不出去的矩阵。 */
            label={
              isVideoMode
                ? `${tVideo('generateButton')} · ${state.videoDuration}s`
                : isAudioMode
                  ? t('generate')
                  : t('generateCount', {
                      count:
                        Math.max(1, runModels.length) * state.imageBatchCount,
                    })
            }
            onGenerate={() => {
              void handleGenerate()
            }}
          />
        </div>
      </PromptInput>
    </>
  )
})
