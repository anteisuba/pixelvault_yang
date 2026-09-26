'use client'

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { EASE_STANDARD, LIQUID_TIMING } from '@/constants/motion'
import {
  getNovelAiCharacterLayoutMode,
  getNovelAiImageDimensions,
  isWithinNovelAiOpusFreeTier,
} from '@/constants/novelai'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { getProviderLabel } from '@/constants/providers'
import { STUDIO_REFERENCE_DRAG_TYPE } from '@/constants/studio'
import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { NovelAiTagModelSchema } from '@/types/novelai-tags'
import type { StudioModelOption } from '@/types/model-option'
import type { TagChip } from '@/types/tag-composer'
import { useComposerSubmit } from '@/hooks/use-composer-submit'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { useReferenceReceiverNotice } from '@/hooks/use-reference-receiver-notice'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { useStudioShortcuts } from '@/hooks/use-studio-shortcuts'
import { useStudioPromptTemplates } from '@/hooks/use-studio-prompt-templates'
import {
  getCapabilityChipValue,
  isCapabilityChipSet,
  isCapabilityChipVisible,
} from '@/lib/model-capability-chips'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { getTagWorkbenchControls } from '@/lib/tag-workbench-controls'
import { cn } from '@/lib/utils'
import {
  Grid2x2,
  PencilLine,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from '@/components/icons'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import {
  LiquidPopoverLayer,
  useLiquidPopover,
} from '@/components/business/studio-shared/primitives/liquid-popover'
import {
  StudioChipLookProvider,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioOutlineChipClass,
  studioOutlineChipCompactClass,
  studioOutlineChipCompactLabelClass,
  studioOutlineChipSetClass,
  studioToolPopoverBaseClass,
  studioToolPopoverMaxHeightClass,
  studioToolPopoverPaddingClass,
  studioToolPopoverWidthClass,
  studioToolSurfaceMobileClass,
  useStudioChipClasses,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { PromptTemplatePicker } from '@/components/business/studio/PromptTemplatePicker'
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioSpecChip } from '@/components/business/studio/StudioSpecChip'
import { StudioDialectJumpHint } from './StudioDialectJumpHint'
import { StudioTagChipField } from './StudioTagChipField'
import { StudioTagsControlColumn } from './StudioTagsControlColumn'
import type { TagWorkbenchPanel } from './StudioTagsWorkbench'

/** 分页里「整体」那一格的值（角色页用下标）。 */
const WHOLE = 'whole'

/**
 * 标签台桌面的底部输入框（owner 2026-09-26 可点原型，与自然语言台同一副骨架）：
 *
 * - 第一行：**整体 / 角色 1 / 角色 2 …** 分页 +「加人」—— 同一对正负两栏，换页只换
 *   编辑的是谁；正在编辑的角色与角色构图面板里点中的那一位是同一份状态
 *   （`activeTagCharacterIndex`）。
 * - 正向 · 负向（UC）两栏，行内排，⛔ 不再各套一个框。
 * - 画风与画师串：一排开关，「提示词块」进舞台面板编辑。
 * - 工具行：左 = 参考图 · 查角色资料 · 角色构图（后两个在舞台上开面板）；
 *   右 = 模型 · 规格 · 专属 · 额度 · 圆键。
 *
 * ⚠ 与参数栏那一版（`StudioTagsPromptArea`）**二选一挂载**：两边都调
 * `useStudioGenerateAction`，同时挂会让一次请求发两遍。
 */
export function StudioTagsComposer({
  onOpenPanel,
}: {
  onOpenPanel: (panel: TagWorkbenchPanel) => void
}) {
  const t = useTranslations('StudioTags')
  const tStudio = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tModels = useTranslations('Models')
  const tImageChip = useTranslations('ImageChip')
  const tImageUpload = useTranslations('ImageUpload')
  const tCancel = useTranslations('GenerationCancel')
  const reducedMotion = useReducedMotion()
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const { cancelAllRunItems } = useStudioGen()
  const {
    selectedModel,
    modelOptions,
    runModels,
    runModelIds,
    filterModelByDialect,
    handleToggleRunModel,
    canGenerate,
    blockedReason,
    handleGenerate,
    isGenerating,
    elapsedSeconds,
    isImagePromptOverLimit,
  } = useStudioGenerateAction()
  const { hintVisible, submit } = useComposerSubmit(canGenerate, handleGenerate)
  useStudioShortcuts({ onGenerate: submit })
  const characters = useNovelAiCharacters()
  const {
    currentTemplateOutputType,
    currentTemplateParams,
    currentTemplatePrompt,
    handleApplyTagTemplate,
  } = useStudioPromptTemplates(modelOptions)
  const referenceNotice = useReferenceReceiverNotice(
    runModels,
    imageUpload.referenceEntries.length,
  )

  const tagModelId = runModels.find(
    (model) => NovelAiTagModelSchema.safeParse(model.modelId).success,
  )?.modelId
  const imageCount = Math.max(1, runModels.length) * state.imageBatchCount
  const modelSummary =
    runModels.length > 1
      ? tStudio('modelCountSelected', { count: runModels.length })
      : runModels[0]
        ? getTranslatedModelLabel(tModels, runModels[0].modelId)
        : tStudio('noModelHint')

  // 正在编辑哪一页：null = 整体，i = 第 i 位角色。
  const activeIndex =
    characters.mode &&
    state.activeTagCharacterIndex !== null &&
    state.activeTagCharacterIndex < characters.characters.length
      ? state.activeTagCharacterIndex
      : null
  const character =
    activeIndex === null ? null : characters.characters[activeIndex]
  const characterDisabled = character?.enabled === false

  const positive: readonly TagChip[] = character
    ? parseTagChips(character.prompt)
    : state.tagChips
  const negative: readonly TagChip[] = character
    ? parseTagChips(character.negativePrompt)
    : state.tagNegativeChips
  const setChips = (polarity: 'positive' | 'negative', chips: TagChip[]) => {
    if (activeIndex === null) {
      dispatch({ type: 'SET_TAG_CHIPS', payload: { polarity, chips } })
      return
    }
    characters.update(
      activeIndex,
      polarity === 'positive'
        ? { prompt: serializeTagChips(chips) }
        : { negativePrompt: serializeTagChips(chips) },
    )
  }

  const blocks = state.tagPromptBlocks ?? []

  return (
    <>
      {/* 工具行 chip 弹层共用的那一块液态形状。 */}
      <LiquidPopoverLayer />
      <div className="flex flex-col gap-2.5">
        <ImageAttachmentPreviewStrip
          entries={imageUpload.referenceEntries}
          previewAlt={tImageChip('label')}
          previewLabel={(index) =>
            tImageChip('previewReferenceImage', { index })
          }
          previewDescription={tImageChip('previewReferenceDescription')}
          previewCloseLabel={tImageChip('closeReferencePreview')}
          removeLabel={(index) => tImageChip('removeReferenceImage', { index })}
          onRemove={imageUpload.removeReferenceImage}
          overLimitTooltip={tImageChip('disabledOverLimit')}
          unsupportedTooltip={tImageChip('disabledUnsupported')}
          variant="composer"
          dragType={STUDIO_REFERENCE_DRAG_TYPE}
        />
        {referenceNotice ? (
          <p className="text-2xs text-muted-foreground">{referenceNotice}</p>
        ) : null}
        {imageUpload.isUploading ? (
          <div
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Spinner aria-hidden="true" className="size-4 shrink-0" />
            {tImageUpload('uploading')}
          </div>
        ) : null}

        {/* 编辑谁 —— 只有支持角色构图的模型才有这一行。 */}
        {characters.mode ? (
          <div className="flex flex-wrap items-center gap-2">
            <LiquidSegmented
              ariaLabel={t('characterTitle')}
              disabled={isGenerating}
              value={activeIndex === null ? WHOLE : String(activeIndex)}
              items={[
                { value: WHOLE, label: t('wholeTab') },
                ...characters.characters.map((_, index) => ({
                  value: String(index),
                  label: t('workbench.characterNumber', { number: index + 1 }),
                })),
              ]}
              onChange={(next) =>
                characters.select(next === WHOLE ? null : Number(next))
              }
            />
            <button
              type="button"
              disabled={
                isGenerating || characters.characters.length >= characters.max
              }
              onClick={characters.add}
              className={cn(
                studioOutlineChipClass,
                'h-7 border-dashed px-2.5 text-muted-foreground',
              )}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('addCharacter')}
            </button>
            {activeIndex !== null ? (
              <span className="flex items-center gap-1.5">
                <Switch
                  aria-label={t('workbench.enableCharacter', {
                    number: activeIndex + 1,
                  })}
                  checked={!characterDisabled}
                  disabled={isGenerating}
                  onCheckedChange={(enabled) =>
                    characters.update(activeIndex, { enabled })
                  }
                />
                <button
                  type="button"
                  disabled={isGenerating}
                  aria-label={t('removeCharacter', {
                    number: activeIndex + 1,
                  })}
                  onClick={() => characters.remove(activeIndex)}
                  className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ) : null}
            <span className="ml-auto text-2xs text-muted-foreground">
              {t(
                characters.mode === 'grid'
                  ? 'characterModeGrid'
                  : 'characterModeFree',
                { max: characters.max },
              )}
              {' · '}
              {t(
                characters.layout?.positioning === 'manual'
                  ? 'workbench.manual'
                  : 'workbench.auto',
              )}
            </span>
          </div>
        ) : null}

        {/* 换页 = 同一对栏换内容：旧的直接让位，新的带一下短模糊进场。 */}
        <motion.div
          key={activeIndex ?? 'whole'}
          initial={
            reducedMotion
              ? false
              : { opacity: 0, filter: `blur(${LIQUID_TIMING.blurPx}px)` }
          }
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{
            delay: LIQUID_TIMING.swapInDelayS,
            duration: LIQUID_TIMING.swapInS,
            ease: EASE_STANDARD,
          }}
          className="flex flex-col gap-1.5"
        >
          <div data-assistant-field="prompt">
            <StudioTagChipField
              variant="inline"
              modelId={tagModelId}
              label={
                activeIndex === null
                  ? t('positiveLabel')
                  : t('characterPositiveLabel', { number: activeIndex + 1 })
              }
              polarity="positive"
              chips={positive}
              disabled={isGenerating || characterDisabled}
              onChange={(chips) => setChips('positive', chips)}
            />
          </div>
          <div data-assistant-field="negativePrompt">
            <StudioTagChipField
              variant="inline"
              modelId={tagModelId}
              label={t('negativeLabel')}
              note={t('negativeNote')}
              polarity="negative"
              chips={negative}
              disabled={isGenerating || characterDisabled}
              onChange={(chips) => setChips('negative', chips)}
            />
          </div>
        </motion.div>

        {/* 画风与画师串 —— 一排开关，编辑进舞台面板。 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-18 shrink-0 text-2xs font-medium text-muted-foreground">
            {t('workbench.blocks')}
          </span>
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              aria-pressed={block.enabled}
              aria-label={t('workbench.enableBlock', { name: block.name })}
              disabled={isGenerating}
              onClick={() =>
                dispatch({
                  type: 'SET_TAG_PROMPT_BLOCKS',
                  payload: blocks.map((item) =>
                    item.id === block.id
                      ? { ...item, enabled: !item.enabled }
                      : item,
                  ),
                })
              }
              className={cn(
                studioOutlineChipClass,
                'h-7 px-2.5 font-normal',
                !block.enabled && 'border-dashed text-muted-foreground',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-2.5 shrink-0 rounded-full border',
                  block.enabled
                    ? 'border-foreground bg-foreground'
                    : 'border-muted-foreground',
                )}
              />
              {block.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onOpenPanel('blocks')}
            className={cn(
              studioOutlineChipClass,
              'h-7 border-dashed px-2.5 text-muted-foreground',
            )}
          >
            <PencilLine className="size-3.5" aria-hidden />
            {t('workbench.editBlocks')}
          </button>
        </div>

        <StudioChipLookProvider value="outline">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
              <ReferenceImageChip disabled={isGenerating} />
              <PromptTemplatePicker
                dialect="tags"
                currentModelId={selectedModel?.modelId}
                currentOutputType={currentTemplateOutputType}
                currentParams={currentTemplateParams}
                currentPrompt={currentTemplatePrompt}
                currentProvider={
                  selectedModel
                    ? getProviderLabel(selectedModel.providerConfig)
                    : undefined
                }
                onApply={handleApplyTagTemplate}
              />
              <Toolbar.Button
                type="button"
                aria-label={t('workbench.lookup')}
                onClick={() => onOpenPanel('catalog')}
                className={cn(
                  studioOutlineChipClass,
                  studioOutlineChipCompactClass,
                )}
              >
                <Search className="size-4" aria-hidden />
                <span className={studioOutlineChipCompactLabelClass}>
                  {t('workbench.lookup')}
                </span>
              </Toolbar.Button>
              {characters.mode ? (
                <Toolbar.Button
                  type="button"
                  aria-label={t('workbench.composition')}
                  onClick={() => onOpenPanel('composition')}
                  className={cn(
                    studioOutlineChipClass,
                    studioOutlineChipCompactClass,
                  )}
                >
                  <Grid2x2 className="size-4" aria-hidden />
                  <span className={studioOutlineChipCompactLabelClass}>
                    {t('workbench.composition')}
                  </span>
                </Toolbar.Button>
              ) : null}
            </Toolbar.Root>
            <span
              aria-live="polite"
              className={cn(
                'text-2xs text-muted-foreground transition-[opacity,transform] duration-base ease-standard motion-reduce:transition-none',
                hintVisible && blockedReason
                  ? 'translate-x-0 opacity-100'
                  : 'pointer-events-none translate-x-2 opacity-0',
              )}
            >
              {hintVisible ? (blockedReason?.message ?? '') : ''}
            </span>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <span data-assistant-field="model">
                <MainModelPicker
                  modality="image"
                  memoryScope="image-tags"
                  value={null}
                  onChange={(option) =>
                    dispatch({
                      type: 'SET_OPTION_ID',
                      payload: option.optionId,
                    })
                  }
                  selectedOptionIds={runModelIds}
                  onToggleOption={handleToggleRunModel}
                  filterOption={filterModelByDialect}
                  renderSearchFallback={(query, close) => (
                    <StudioDialectJumpHint query={query} close={close} />
                  )}
                  triggerEmptyLabel={modelSummary}
                  searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
                  emptySearchText={tForm('modelSelector.emptySearch')}
                  popoverSide="top"
                  popoverAlign="end"
                  contentClassName="w-80"
                  disabled={isGenerating}
                  className={cn(
                    'h-8 max-w-48 font-medium @max-4xl/composer:max-w-36',
                    runModels.length > 0 && studioOutlineChipSetClass,
                    'data-[active=true]:border-foreground data-[active=true]:ring-3 data-[active=true]:ring-muted',
                  )}
                />
              </span>
              <span data-assistant-field="specs">
                <StudioSpecChip
                  disabled={isGenerating}
                  showCount
                  popoverAlign="end"
                />
              </span>
              <TagCapabilityChip
                runModels={runModels}
                disabled={isGenerating}
              />
              <TagQuotaLine runModels={runModels} />
              <StudioGenerateButton
                variant="round"
                count={imageCount}
                ariaLabel={tStudio('generate')}
                isGenerating={isGenerating}
                elapsedSeconds={elapsedSeconds}
                canGenerate={canGenerate}
                disabled={isGenerating || isImagePromptOverLimit}
                blockedMessage={blockedReason?.message}
                busyLabel={tStudio('generating')}
                label={tStudio('generateCount', { count: imageCount })}
                onGenerate={submit}
                onStop={cancelAllRunItems}
                stopLabel={tCancel('cancelAll')}
              />
            </div>
          </div>
        </StudioChipLookProvider>
      </div>
    </>
  )
}

/**
 * 专属 —— 一颗 chip，弹层里是这一轮所有标签模型的能力并集（只对部分模型生效的
 * 那几项照旧注明）。chip 上写 NAI 画板那一句「采样器 · 步数」，其余改过的记 +N。
 */
function TagCapabilityChip({
  runModels,
  disabled,
}: {
  runModels: readonly StudioModelOption[]
  disabled: boolean
}) {
  const t = useTranslations('StudioTags')
  const tCapability = useTranslations('StudioCapabilityChips')
  const tAdvanced = useTranslations('AdvancedSettings')
  const { state } = useStudioForm()
  const { imageUpload } = useStudioData()
  const chipClasses = useStudioChipClasses()
  const {
    attach: liquidRef,
    className: liquidClassName,
    style: liquidStyle,
  } = useLiquidPopover(chipClasses.look === 'outline')

  const controls = useMemo(
    () => getTagWorkbenchControls(runModels),
    [runModels],
  )
  const params = state.advancedParams
  const visible = controls.filter((control) =>
    isCapabilityChipVisible(
      control.chip,
      params,
      imageUpload.referenceImages.length > 0,
    ),
  )
  const takesSeed = runModels.some((model) =>
    getCapabilityConfig(model.adapterType, model.modelId).capabilities.includes(
      'seed',
    ),
  )
  if (visible.length === 0 && !takesSeed) return null

  const sampler = visible.find(
    (control) => control.chip.capability === 'sampler',
  )
  const steps = visible.find((control) => control.chip.capability === 'steps')
  const samplerValue = sampler
    ? String(getCapabilityChipValue(sampler.chip, params))
    : null
  // 画板 A：chip 上只写「Euler a · 28 步」—— 图标已经说了这是专属参数，⛔ 不再
  // 前缀「专属 ·」；采样器有简写就用简写（`samplerShort`），一行才放得下。
  const facts = [
    ...(samplerValue
      ? [
          t.has(`samplerShort.${samplerValue}`)
            ? t(`samplerShort.${samplerValue}`)
            : tAdvanced(`samplerOption.${samplerValue}`),
        ]
      : []),
    ...(steps
      ? [
          t('stepsShort', {
            count: Number(getCapabilityChipValue(steps.chip, params)),
          }),
        ]
      : []),
  ]
  const summary =
    facts.length > 0 ? facts.join(' · ') : tCapability('singleChipLabel')
  const otherSet = visible.filter(
    (control) =>
      control !== sampler &&
      control !== steps &&
      isCapabilityChipSet(control.chip, params),
  ).length
  const anySet =
    params.seed !== undefined ||
    visible.some((control) => isCapabilityChipSet(control.chip, params))

  return (
    <StudioToolSurface>
      <StudioToolSurfaceTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-assistant-field="capabilities"
          title={tCapability('singleChipLabel')}
          className={cn(
            chipClasses.trigger,
            'max-w-64',
            anySet && chipClasses.set,
            'data-[state=open]:border-foreground data-[state=open]:ring-3 data-[state=open]:ring-muted',
          )}
        >
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            {otherSet > 0 ? `${summary} +${otherSet}` : summary}
          </span>
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        ref={liquidRef}
        style={liquidStyle}
        label={tCapability('singleChipLabel')}
        align="end"
        side="top"
        sideOffset={8}
        className={cn(
          studioToolPopoverBaseClass,
          studioToolPopoverWidthClass.action,
          studioToolPopoverPaddingClass.small,
          studioToolPopoverMaxHeightClass,
          'overflow-y-auto overscroll-contain',
          liquidClassName,
        )}
        mobileClassName={studioToolSurfaceMobileClass.action}
      >
        <div className="flex flex-col gap-4">
          <StudioTagsControlColumn placement="popover" compact />
        </div>
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}

/**
 * 额度那一格 —— NAI 报官方写过的 Opus 免费判据（单张 · ≤1024² · ≤28 步），⛔ 不报
 * 一个估出来的 Anlas 数；其余标签模型走共用的价格行。
 */
function TagQuotaLine({
  runModels,
}: {
  runModels: readonly StudioModelOption[]
}) {
  const t = useTranslations('StudioTags')
  const { state } = useStudioForm()
  const novelAi = runModels.some((model) =>
    getNovelAiCharacterLayoutMode(model.modelId),
  )
  if (!novelAi) {
    return (
      <StudioCostPreview
        variant="line"
        models={[...runModels]}
        basis={{
          kind: 'image',
          perModelCount: state.imageBatchCount,
          aspectRatio: state.aspectRatio,
          resolution: state.advancedParams.resolution,
          quality: state.advancedParams.quality,
          preview: state.advancedParams.preview,
        }}
      />
    )
  }
  const { width, height } = getNovelAiImageDimensions(state.aspectRatio)
  const free =
    isWithinNovelAiOpusFreeTier({
      width,
      height,
      steps: state.advancedParams.steps ?? 28,
      imageCount: state.imageBatchCount,
    }) && state.advancedParams.novelAiReferenceMode !== 'precise'
  return (
    <span
      title={t(free ? 'opusFree' : 'opusMetered')}
      className="whitespace-nowrap text-2xs text-muted-foreground"
    >
      {t(free ? 'opusFreeShort' : 'opusMeteredShort')}
    </span>
  )
}
