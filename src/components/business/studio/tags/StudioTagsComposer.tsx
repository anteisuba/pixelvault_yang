'use client'

import { useCallback, useId, useMemo, useState } from 'react'
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
import { useTagTargetFlash } from '@/hooks/use-tag-target-flash'
import { useTagCarryTranslation } from '@/hooks/use-tag-carry-translation'
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
  ChevronDown,
  FileText,
  Grid2x2,
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
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { StudioTemplatesChip } from '@/components/business/studio/templates/StudioTemplatesChip'
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioSpecChip } from '@/components/business/studio/StudioSpecChip'
import {
  StudioMobileAddSheet,
  type StudioMobileAddRow,
} from '@/components/business/studio/StudioMobileAddSheet'
import { StudioDialectJumpHint } from './StudioDialectJumpHint'
import {
  StudioTagCharacterExtras,
  StudioTagCountHint,
  StudioTagSceneTexts,
} from './StudioTagCast'
import { StudioTagCarryNote } from './StudioTagCarryNote'
import { StudioTagChipField } from './StudioTagChipField'
import { StudioTagsControlColumn } from './StudioTagsControlColumn'
import type { TagWorkbenchPanel } from './StudioTagsWorkbench'

/** 分页里「整体」那一格的值（角色页用下标）。 */
const WHOLE = 'whole'

/**
 * 标签台共用的底部输入框；手机默认折叠负向，工具分两行。
 *
 * - 第一行：**整体 / 角色 1 / 角色 2 …** 分页 +「加人」—— 同一对正负两栏，换页只换
 *   编辑的是谁；正在编辑的角色与角色构图面板里点中的那一位是同一份状态
 *   （`activeTagCharacterIndex`）。
 * - 正向 · 负向（UC）两栏，行内排，⛔ 不再各套一个框。角色页下面是「互动」
 *   「台词」两行，整体页下面是「画面文字」（`StudioTagCast`，2026-10-07 C）；
 *   人数提示挂在正向栏正下方。
 * - 工具行：左 = 参考图 · 模板 · 查资料 · 角色构图（查资料与构图在舞台上开面板）；
 *   右 = 模型 · 规格 · 专属 · 额度 · 圆键。⛔ 没有「画风串」：2026-09-27 取消，画师词
 *   就是普通标签，画风在查资料的「画风」页里挑。
 *
 * `StudioTagsPromptArea` 是手机定位外壳，生成动作只由这里挂载。
 */
export function StudioTagsComposer({
  onOpenPanel,
  activePanel = null,
  mobile = false,
}: {
  onOpenPanel: (panel: TagWorkbenchPanel | null) => void
  /** 舞台上此刻开着哪块面板（模板那颗 chip 要画「开着」、再点一下收起）。 */
  activePanel?: TagWorkbenchPanel | null
  mobile?: boolean
}) {
  const [negativeOpen, setNegativeOpen] = useState(false)
  const negativeId = useId()
  const revealNegative = useCallback(
    (node: HTMLDivElement | null) => {
      if (mobile && node) node.scrollIntoView({ block: 'nearest' })
    },
    [mobile],
  )
  const t = useTranslations('StudioTags')
  const tTemplates = useTranslations('PromptLibrary')
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
    runModels,
    filterModelByDialect,
    handleReplaceRunModel,
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
  /** 查资料刚往哪一位角色里加了标签（那一页亮个小点）。 */
  const flashing = useTagTargetFlash()
  const referenceNotice = useReferenceReceiverNotice(
    runModels,
    imageUpload.referenceEntries.length,
  )

  const tagModelId = runModels.find(
    (model) => NovelAiTagModelSchema.safeParse(model.modelId).success,
  )?.modelId
  const carry = useTagCarryTranslation(tagModelId)
  const imageCount = Math.max(1, runModels.length) * state.imageBatchCount
  const modelSummary = runModels[0]
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

  // 手机「＋」下半截：模板 · 查资料 ·（角色构图）。
  const addRows: StudioMobileAddRow[] = [
    {
      key: 'templates',
      icon: <FileText className="size-4" />,
      label: tTemplates('templatePicker'),
      onSelect: () => onOpenPanel('templates'),
    },
    {
      key: 'catalog',
      icon: <Search className="size-4" />,
      label: t('workbench.lookup'),
      onSelect: () => onOpenPanel('catalog'),
    },
    ...(characters.mode
      ? [
          {
            key: 'composition',
            icon: <Grid2x2 className="size-4" />,
            label: t('workbench.composition'),
            onSelect: () => onOpenPanel('composition'),
          },
        ]
      : []),
  ]

  return (
    <>
      {/* `@container/tagrow`：工具行 chip 按这一台自己的门槛收成图标（见
          `studioOutlineChipCompactClass`）。 */}
      <div
        className={cn(
          'flex min-h-0 flex-col gap-2',
          !mobile && '@container/tagrow gap-2.5',
        )}
      >
        <div
          className={
            mobile
              ? 'flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain'
              : 'contents'
          }
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
            <div
              className={cn(
                'flex items-center gap-2',
                mobile ? 'shrink-0 overflow-x-auto' : 'flex-wrap',
              )}
            >
              <LiquidSegmented
                ariaLabel={t('characterTitle')}
                size="sm"
                disabled={isGenerating}
                value={activeIndex === null ? WHOLE : String(activeIndex)}
                items={[
                  { value: WHOLE, label: t('wholeTab') },
                  ...characters.characters.map((_, index) => ({
                    value: String(index),
                    label: t('workbench.characterNumber', {
                      number: index + 1,
                    }),
                    indicator: flashing === index,
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
                // 与 PC 同一档（owner 2026-10-04：手机上那颗 44 高的黑丸太重）；触屏命中区
                // 由 `touch-target-y` 补到 44，⛔ 不把丸画大。
                className={cn(
                  studioOutlineChipClass,
                  'touch-target-y h-7 border-dashed px-2.5 text-muted-foreground',
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
                    className={cn(
                      'touch-target-y grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    )}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              ) : null}
              <span
                className={cn(
                  'ml-auto text-2xs text-muted-foreground',
                  mobile && 'hidden',
                )}
              >
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
                variant={mobile ? 'composer' : 'inline'}
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
                status={
                  activeIndex === null ? (
                    <StudioTagCarryNote
                      status={carry.status}
                      onRetry={carry.retry}
                    />
                  ) : undefined
                }
              />
            </div>
            {characters.mode ? (
              <StudioTagCountHint
                activeIndex={activeIndex}
                mobile={mobile}
                disabled={isGenerating || characterDisabled}
              />
            ) : null}
            {mobile ? (
              // 额度那一句挂在这一行右端（手机工具行只剩一行，放不下它）。
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={negativeOpen}
                  aria-controls={negativeOpen ? negativeId : undefined}
                  onClick={() => setNegativeOpen((open) => !open)}
                  className="flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      'size-4 transition-transform duration-fast motion-reduce:transition-none',
                      negativeOpen && 'rotate-180',
                    )}
                  />
                  {t('negativeLabel')}
                  {negative.length > 0 ? (
                    <span className="tabular-nums">{negative.length}</span>
                  ) : null}
                </button>
                <TagQuotaLine runModels={runModels} />
              </div>
            ) : null}
            {!mobile || negativeOpen ? (
              <div
                ref={revealNegative}
                id={negativeId}
                data-assistant-field="negativePrompt"
              >
                <StudioTagChipField
                  variant={mobile ? 'composer' : 'inline'}
                  modelId={tagModelId}
                  label={t('negativeLabel')}
                  note={t('negativeNote')}
                  polarity="negative"
                  chips={negative}
                  disabled={isGenerating || characterDisabled}
                  onChange={(chips) => setChips('negative', chips)}
                />
              </div>
            ) : null}
            {characters.mode ? (
              activeIndex !== null ? (
                <StudioTagCharacterExtras
                  index={activeIndex}
                  mobile={mobile}
                  disabled={isGenerating || characterDisabled}
                />
              ) : (
                <StudioTagSceneTexts mobile={mobile} disabled={isGenerating} />
              )
            ) : null}
          </motion.div>
        </div>

        {mobile ? (
          // 手机一行（owner 2026-10-04「和图片台一样」）：＋（图像 · 模板 · 查资料 ·
          // 角色构图 · 画中文字）· 模型 · 规格 · 参数 ……… 生成；无边幽灵丸，模型只写一行。
          <div className="flex shrink-0 flex-col gap-1 pb-2">
            {hintVisible && blockedReason ? (
              <span
                aria-live="polite"
                className="text-2xs text-muted-foreground"
              >
                {blockedReason.message}
              </span>
            ) : null}
            <div className="flex min-w-0 items-center gap-2">
              <div className="studio-mobile-chip-row flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                <StudioMobileAddSheet disabled={isGenerating} rows={addRows} />
                <span
                  data-assistant-field="model"
                  className="flex min-w-0 shrink"
                >
                  {/* 这一台只能单选（owner 2026-09-27）：点一行 = 换成它，弹层随即收起。 */}
                  <MainModelPicker
                    modality="image"
                    memoryScope="image-tags"
                    value={runModels[0]?.optionId ?? null}
                    onChange={handleReplaceRunModel}
                    filterOption={filterModelByDialect}
                    renderSearchFallback={(query, close) => (
                      <StudioDialectJumpHint query={query} close={close} />
                    )}
                    triggerEmptyLabel={modelSummary}
                    searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
                    emptySearchText={tForm('modelSelector.emptySearch')}
                    popoverSide="top"
                    popoverAlign="start"
                    contentClassName="w-80"
                    disabled={isGenerating}
                    triggerVariantOnly
                    className="h-8 max-w-40 gap-1 border-transparent bg-transparent pr-2 pl-2.5 font-medium hover:border-transparent active:bg-muted data-[active=true]:bg-muted"
                  />
                </span>
                <span data-assistant-field="specs" className="shrink-0">
                  {/* 与图片台手机同一颗：只写比例，张数在生成键角标上。 */}
                  <StudioSpecChip
                    disabled={isGenerating}
                    triggerClassName="border-transparent px-2.5 font-medium hover:border-transparent active:bg-muted"
                    popoverAlign="end"
                  />
                </span>
                <TagCapabilityChip
                  mobile
                  runModels={runModels}
                  disabled={isGenerating}
                />
              </div>
              <StudioGenerateButton
                variant="round"
                className="size-9"
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
        ) : (
          <StudioChipLookProvider value="outline">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <Toolbar.Root className="flex flex-wrap items-center gap-1.5">
                <ReferenceImageChip disabled={isGenerating} />
                <StudioTemplatesChip
                  open={activePanel === 'templates'}
                  disabled={isGenerating}
                  onToggle={() =>
                    onOpenPanel(
                      activePanel === 'templates' ? null : 'templates',
                    )
                  }
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
                  {/* 这一台只能单选（owner 2026-09-27）：点一行 = 换成它，弹层随即收起。 */}
                  <MainModelPicker
                    modality="image"
                    memoryScope="image-tags"
                    value={runModels[0]?.optionId ?? null}
                    onChange={handleReplaceRunModel}
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
                    // ⚠ 单选 chip 写「型号名 · 版本」，宽屏用它自己的 240（⛔ 压到 192 把名字挤成
                    //   「Novel… Diffusion V5 …」）；输入框 / 标签行变窄时才收到 144，保证工具行一行不折。
                    className={cn(
                      'h-8 font-medium @max-4xl/composer:max-w-36 @max-6xl/tagrow:max-w-36',
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
        )}
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
  mobile = false,
}: {
  runModels: readonly StudioModelOption[]
  disabled: boolean
  mobile?: boolean
}) {
  const t = useTranslations('StudioTags')
  const tCapability = useTranslations('StudioCapabilityChips')
  const tAdvanced = useTranslations('AdvancedSettings')
  const { state } = useStudioForm()
  const { imageUpload } = useStudioData()
  const chipClasses = useStudioChipClasses()
  const popoverMotion = useStudioChipPopoverMotion({
    side: 'top',
    align: 'end',
    sideOffset: 8,
  })

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
          title={mobile ? t('parameters') : tCapability('singleChipLabel')}
          aria-label={mobile ? t('parameters') : undefined}
          className={cn(
            chipClasses.trigger,
            'max-w-64',
            // 手机：与图片台「专属」同一副无边幽灵丸。
            mobile &&
              'h-8 gap-1 border-transparent px-2.5 hover:border-transparent active:bg-muted',
            anySet && chipClasses.set,
            'data-[state=open]:border-foreground data-[state=open]:ring-3 data-[state=open]:ring-muted',
          )}
        >
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            {mobile
              ? t('parameters')
              : otherSet > 0
                ? `${summary} +${otherSet}`
                : summary}
          </span>
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        style={popoverMotion.style}
        label={mobile ? t('parameters') : tCapability('singleChipLabel')}
        align="end"
        side="top"
        sideOffset={8}
        className={cn(
          studioToolPopoverBaseClass,
          studioToolPopoverWidthClass.action,
          studioToolPopoverPaddingClass.small,
          studioToolPopoverMaxHeightClass,
          'overflow-y-auto overscroll-contain',
          popoverMotion.className,
        )}
        mobileClassName={studioToolSurfaceMobileClass.action}
      >
        <div className="flex flex-col gap-4">
          {mobile ? (
            <h2 className="text-base font-medium">{t('mobileParameters')}</h2>
          ) : null}
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
  const { imageUpload, characters } = useStudioData()
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
          hasReferenceImage:
            imageUpload.referenceImages.length > 0
              ? true
              : characters.activeCardIds.length > 0 ||
                  state.workflowMode === 'card'
                ? undefined
                : false,
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
