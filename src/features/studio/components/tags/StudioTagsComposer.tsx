'use client'

import { useCallback, useId, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { EASE_STANDARD, LIQUID_TIMING } from '@/constants/motion'
import {
  NOVELAI_OPUS_FREE_LIMITS,
  getNovelAiCharacterLayoutMode,
  getNovelAiOpusCost,
  getNovelAiPreciseReferenceAnlasCost,
  resolveNovelAiDimensions,
} from '@/constants/novelai'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { useRegisterTagsLibraryPick } from '@/contexts/studio-library-pick'
import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { NovelAiTagModelSchema } from '@/types/novelai-tags'
import type { StudioModelOption } from '@/types/model-option'
import type { TagChip } from '@/types/tag-composer'
import { useComposerSubmit } from '@/hooks/use-composer-submit'
import { openImageRecipePicker } from '@/hooks/use-image-recipe-import'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { useTagLookupAdder } from '@/hooks/use-tag-lookup-adder'
import { useReferenceReceiverNotice } from '@/hooks/use-reference-receiver-notice'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { useStudioCharacterOutlet } from '@/features/studio/hooks/use-studio-character-outlet'
import { useStudioShortcuts } from '@/features/studio/hooks/use-studio-shortcuts'
import { useTagTargetFlash } from '@/hooks/use-tag-target-flash'
import { useTagCarryTranslation } from '@/hooks/use-tag-carry-translation'
import { useTagPromptBlocks } from '@/hooks/use-tag-prompt-blocks'
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
  Blocks,
  ChevronDown,
  FileText,
  Grid2x2,
  PenTool,
  Plus,
  ScanText,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from '@/components/icons'
import { STUDIO_TEMPLATES_PANEL_ID } from '@/constants/studio'
import { Button } from '@/components/ui/button'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import {
  StudioChipLookProvider,
  studioOutlineChipClass,
  studioOutlineChipSetClass,
  useStudioChipClasses,
} from '@/components/ui/chip'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolPopoverBaseClass,
  studioToolPopoverMaxHeightClass,
  studioToolPopoverPaddingClass,
  studioToolPopoverWidthClass,
  studioToolSurfaceMobileClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { StudioCostPreview } from '@/features/studio/components/StudioCostPreview'
import { StudioSpecChip } from '@/features/studio/components/StudioSpecChip'
import {
  StudioMobileAddSheet,
  type StudioMobileAddRow,
} from '@/features/studio/components/StudioMobileAddSheet'
import { StudioDialectJumpHint } from './StudioDialectJumpHint'
import {
  StudioTagCharacterExtras,
  StudioTagCountHint,
  StudioTagSceneTexts,
} from './StudioTagCast'
import { StudioTagCarryNote } from './StudioTagCarryNote'
import { StudioTagTextField } from './StudioTagTextField'
import { StudioTagPresetNote } from './StudioTagPresetNote'
import { StudioTagsControlColumn } from './StudioTagsControlColumn'
import { StudioTagsDesktopEditor } from './StudioTagsDesktopEditor'
import { StudioTagActiveBlocksBar } from './StudioTagBlocksPanel'
import { StudioNovelAiReferenceSection } from './StudioNovelAiReferenceSection'
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
  compact = false,
  onExpand,
  onCollapse,
  onEditImage,
}: {
  onOpenPanel: (panel: TagWorkbenchPanel | null) => void
  /** 舞台上此刻开着哪块面板（模板那颗 chip 要画「开着」、再点一下收起）。 */
  activePanel?: TagWorkbenchPanel | null
  mobile?: boolean
  /**
   * 手机收起态：编辑区缩成一行摘要（这一页的标签），只剩摘要 + 工具行，
   * 舞台上的图 / 查资料把屏幕让出来（owner 2026-10-15「看图片作为重点」）。
   */
  compact?: boolean
  /** 点摘要 —— 宿主展开输入框并把焦点交给标签输入。 */
  onExpand?: () => void
  /** 手机展开态右上角显式收起（避免软键盘弹起后上方舞台窄缝难盲点）。 */
  onCollapse?: () => void
  /** 工具行「改图」（owner 11-04，与图片台同一颗）。不给 = 不画。 */
  onEditImage?: () => void
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
  const tRecipe = useTranslations('ImageRecipeImport')
  const tImageEdit = useTranslations('StudioImageEdit')
  const tStudio = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tModels = useTranslations('Models')
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
  /**
   * 第 9f 步 9f-2c：桌面标签台开着就登记那一份「加进来」—— 从左栏打开标签库时顶上写
   * 「选给 标签 台」、详情能加到整体 / 角色 N。
   */
  const lookupAdder = useTagLookupAdder(t('dialect.tags'))
  useRegisterTagsLibraryPick(mobile ? null : lookupAdder)
  // 查资料在舞台出图那块打开（10-25 用户定：桌面也一样，⛔ 跳去标签库）。
  const openLookup = () =>
    onOpenPanel(activePanel === 'catalog' ? null : 'catalog')
  // 收藏（11-18 工作台里开库）：盖在舞台上，点一下加、再点拿掉；再点这颗收起。
  const openFavorites = () =>
    onOpenPanel(activePanel === 'favorites' ? null : 'favorites')
  // 积木（5B-3 方案 A）：右侧舞台展开编排，左栏只留一行极简启用胶囊带。
  const openBlocks = () =>
    onOpenPanel(activePanel === 'blocks' ? null : 'blocks')
  const { activeBlocks } = useTagPromptBlocks()
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

  const referenceStatus = (
    <>
      {referenceNotice ? (
        <p className="text-2xs text-muted-foreground">{referenceNotice}</p>
      ) : null}
      {imageUpload.isUploading ? (
        <div
          role="status"
          className="flex items-center gap-2 text-2sm text-muted-foreground"
        >
          <Spinner aria-hidden="true" className="size-4 shrink-0" />
          {tImageUpload('uploading')}
        </div>
      ) : null}
    </>
  )

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
    {
      key: 'favorites',
      icon: <Star className="size-4" />,
      label: t('favoritesPanel.title'),
      onSelect: () => onOpenPanel('favorites'),
    },
    {
      key: 'blocks',
      icon: <Blocks className="size-4" />,
      label: t('blocksPanel.title'),
      onSelect: () => onOpenPanel('blocks'),
    },
    {
      key: 'recipe-import',
      icon: <ScanText className="size-4" />,
      label: tRecipe('button'),
      onSelect: openImageRecipePicker,
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
      <div
        className={cn('flex min-h-0 flex-col gap-2', !mobile && 'flex-1 gap-3')}
      >
        {mobile && compact ? (
          <button
            type="button"
            onClick={onExpand}
            aria-label={t('compactExpand')}
            // 摘要直接写在输入框白卡上，和图片台手机那行提示词同一副（字 16 / 行高 24、
            // 占位 `ink-3`）：⛔ 卡里再套一块灰底框（ui-spec §9「填字框」——嵌在输入框里的
            // 提示词外观由宿主出）。命中区仍是整行 44 高。
            className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl text-left text-base leading-6 focus-visible:outline-none focus-visible:shadow-focus"
          >
            {characters.mode ? (
              <span className="shrink-0 text-md font-semibold">
                {activeIndex === null
                  ? t('wholeTab')
                  : t('workbench.characterNumber', { number: activeIndex + 1 })}
              </span>
            ) : null}
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                positive.length === 0 && 'text-muted-foreground',
              )}
            >
              {positive.length > 0
                ? positive.map((chip) => chip.text).join(', ')
                : t('placeholder')}
            </span>
            {imageUpload.referenceEntries.length +
              (state.advancedParams.novelAi?.preciseReferences?.length ?? 0) >
            0 ? (
              <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                {t('compactReferences', {
                  count:
                    imageUpload.referenceEntries.length +
                    (state.advancedParams.novelAi?.preciseReferences?.length ??
                      0),
                })}
              </span>
            ) : null}
          </button>
        ) : mobile ? (
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain">
            {/* 编辑谁 + 右端显式收起键（手机展开态）。 */}
            {characters.mode || onCollapse ? (
              <div className="flex shrink-0 items-center gap-2">
                {characters.mode ? (
                  <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
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
                        isGenerating ||
                        characters.characters.length >= characters.max
                      }
                      onClick={() => characters.add()}
                      // 与 PC 同一档（owner 2026-10-04：手机上那颗 44 高的黑丸太重）；触屏命中区
                      // 由 `touch-target-y` 补到 44，⛔ 不把丸画大。
                      className={cn(
                        studioOutlineChipClass,
                        'touch-target-y shrink-0 border-dashed px-2.5 text-muted-foreground',
                      )}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      {t('addCharacter')}
                    </button>
                    {activeIndex !== null ? (
                      <span className="flex shrink-0 items-center gap-1.5">
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
                            'touch-target-y grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                          )}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="flex-1" />
                )}
                {onCollapse ? (
                  <button
                    type="button"
                    onClick={onCollapse}
                    aria-label={t('compactCollapse')}
                    title={t('compactCollapse')}
                    className="touch-target grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground active:bg-accent focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </button>
                ) : null}
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
              <div
                data-assistant-field="prompt"
                className="flex flex-col gap-1.5"
              >
                {activeIndex === null ? (
                  <StudioTagActiveBlocksBar
                    target="positive"
                    position="prefix"
                    variant="inline"
                    disabled={isGenerating}
                    onOpenBlocks={openBlocks}
                  />
                ) : null}
                <StudioTagTextField
                  variant="composer"
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
                        reason={carry.reason}
                        onRetry={carry.retry}
                      />
                    ) : undefined
                  }
                />
                {activeIndex === null ? (
                  <StudioTagActiveBlocksBar
                    target="positive"
                    position="suffix"
                    variant="inline"
                    disabled={isGenerating}
                    onOpenBlocks={openBlocks}
                  />
                ) : null}
                {activeIndex === null ? (
                  <StudioTagPresetNote
                    polarity="positive"
                    disabled={isGenerating}
                  />
                ) : null}
              </div>
              {characters.mode ? (
                <StudioTagCountHint
                  activeIndex={activeIndex}
                  mobile
                  disabled={isGenerating || characterDisabled}
                />
              ) : null}
              {/* 额度那一句挂在这一行右端（手机工具行只剩一行，放不下它）。 */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={negativeOpen}
                  aria-controls={negativeOpen ? negativeId : undefined}
                  onClick={() => setNegativeOpen((open) => !open)}
                  className="flex min-h-11 items-center gap-2 rounded-md text-2sm text-muted-foreground focus-visible:outline-none focus-visible:shadow-focus"
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
              {negativeOpen ? (
                <div
                  ref={revealNegative}
                  id={negativeId}
                  data-assistant-field="negativePrompt"
                  className="flex flex-col gap-1.5"
                >
                  {activeIndex === null ? (
                    <StudioTagActiveBlocksBar
                      target="negative"
                      position="prefix"
                      variant="inline"
                      disabled={isGenerating}
                      onOpenBlocks={openBlocks}
                    />
                  ) : null}
                  <StudioTagTextField
                    variant="composer"
                    modelId={tagModelId}
                    label={t('negativeLabel')}
                    note={t('negativeNote')}
                    polarity="negative"
                    chips={negative}
                    disabled={isGenerating || characterDisabled}
                    onChange={(chips) => setChips('negative', chips)}
                  />
                  {activeIndex === null ? (
                    <StudioTagActiveBlocksBar
                      target="negative"
                      position="suffix"
                      variant="inline"
                      disabled={isGenerating}
                      onOpenBlocks={openBlocks}
                    />
                  ) : null}
                  {activeIndex === null ? (
                    <StudioTagPresetNote
                      polarity="negative"
                      disabled={isGenerating}
                    />
                  ) : null}
                </div>
              ) : null}
              {characters.mode ? (
                activeIndex !== null ? (
                  <StudioTagCharacterExtras
                    index={activeIndex}
                    mobile
                    disabled={isGenerating || characterDisabled}
                  />
                ) : (
                  <StudioTagSceneTexts mobile disabled={isGenerating} />
                )
              ) : null}
            </motion.div>
            <StudioNovelAiReferenceSection compact disabled={isGenerating} />
            {referenceStatus}
          </div>
        ) : (
          <StudioTagsDesktopEditor
            tagModelId={tagModelId}
            disabled={isGenerating}
            onOpenBlocks={openBlocks}
            carry={
              <StudioTagCarryNote
                status={carry.status}
                reason={carry.reason}
                onRetry={carry.retry}
              />
            }
            resourceBar={
              <Toolbar.Root
                aria-label={t('dialect.tags')}
                className="grid min-w-0 grid-cols-4 gap-1.5"
              >
                <Toolbar.Button
                  type="button"
                  disabled={isGenerating}
                  aria-label={tTemplates('templatePicker')}
                  title={tTemplates('templatePicker')}
                  aria-expanded={activePanel === 'templates'}
                  aria-controls={
                    activePanel === 'templates'
                      ? STUDIO_TEMPLATES_PANEL_ID
                      : undefined
                  }
                  onClick={() =>
                    onOpenPanel(
                      activePanel === 'templates' ? null : 'templates',
                    )
                  }
                  className={cn(
                    'touch-target-y inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-2xs font-semibold whitespace-nowrap transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45',
                    activePanel === 'templates'
                      ? 'border-foreground/20 bg-muted text-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted/70',
                  )}
                >
                  <FileText className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {tTemplates('templatePicker')}
                  </span>
                </Toolbar.Button>
                <Toolbar.Button
                  type="button"
                  aria-label={t('workbench.lookup')}
                  title={t('workbench.lookup')}
                  aria-pressed={activePanel === 'catalog'}
                  onClick={openLookup}
                  className={cn(
                    'touch-target-y inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-2xs font-semibold whitespace-nowrap transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
                    activePanel === 'catalog'
                      ? 'border-foreground/20 bg-muted text-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted/70',
                  )}
                >
                  <Search className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t('workbench.lookup')}</span>
                </Toolbar.Button>
                <Toolbar.Button
                  type="button"
                  aria-label={t('favoritesPanel.title')}
                  title={t('favoritesPanel.title')}
                  aria-pressed={activePanel === 'favorites'}
                  onClick={openFavorites}
                  className={cn(
                    'touch-target-y inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-2xs font-semibold whitespace-nowrap transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
                    activePanel === 'favorites'
                      ? 'border-foreground/20 bg-muted text-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted/70',
                  )}
                >
                  <Star className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t('favoritesPanel.title')}</span>
                </Toolbar.Button>
                <Toolbar.Button
                  type="button"
                  aria-label={t('blocksPanel.title')}
                  title={t('blocksPanel.title')}
                  aria-pressed={activePanel === 'blocks'}
                  onClick={openBlocks}
                  className={cn(
                    'touch-target-y inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 text-2xs font-semibold whitespace-nowrap transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
                    activePanel === 'blocks' || activeBlocks.length > 0
                      ? 'border-foreground/20 bg-muted text-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted/70',
                  )}
                >
                  <Blocks className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {activeBlocks.length > 0
                      ? `${t('blocksPanel.shortTitle')} · ${activeBlocks.length}`
                      : t('blocksPanel.shortTitle')}
                  </span>
                </Toolbar.Button>
              </Toolbar.Root>
            }
            secondaryActions={
              <>
                <button
                  type="button"
                  aria-label={tRecipe('button')}
                  title={tRecipe('button')}
                  disabled={isGenerating}
                  onClick={openImageRecipePicker}
                  className="touch-target-y inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-2xs font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45"
                >
                  <ScanText className="size-3.5 shrink-0" aria-hidden />
                  <span>{tRecipe('button')}</span>
                </button>
                {onEditImage ? (
                  <button
                    type="button"
                    aria-label={tImageEdit('toolChip')}
                    title={tImageEdit('toolChip')}
                    disabled={isGenerating}
                    onClick={onEditImage}
                    className="touch-target-y inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-2xs font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-45"
                  >
                    <PenTool className="size-3.5 shrink-0" aria-hidden />
                    <span>{tImageEdit('toolChip')}</span>
                  </button>
                ) : null}
                {characters.mode ? (
                  <button
                    type="button"
                    aria-label={t('workbench.composition')}
                    title={t('workbench.composition')}
                    aria-pressed={activePanel === 'composition'}
                    onClick={() =>
                      onOpenPanel(
                        activePanel === 'composition' ? null : 'composition',
                      )
                    }
                    className={cn(
                      'touch-target-y inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-2xs font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
                      activePanel === 'composition'
                        ? 'bg-muted font-semibold text-foreground'
                        : 'text-muted-foreground hover:tint-hover hover:text-foreground',
                    )}
                  >
                    <Grid2x2 className="size-3.5 shrink-0" aria-hidden />
                    <span>{t('workbench.compositionShort')}</span>
                  </button>
                ) : null}
              </>
            }
          >
            {/* 统一参考区：双槽底图重绘 + 多图精确参考 */}
            <StudioNovelAiReferenceSection disabled={isGenerating} />
            {referenceStatus}
          </StudioTagsDesktopEditor>
        )}

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
                    className="h-8 max-w-40 gap-1 border-transparent bg-transparent pr-2 pl-2.5 hover:border-transparent active:bg-muted data-[active=true]:bg-muted"
                  />
                </span>
                <span data-assistant-field="specs" className="shrink-0">
                  {/* 与图片台手机同一颗：只写比例，张数在生成键角标上。 */}
                  <StudioSpecChip
                    disabled={isGenerating}
                    triggerClassName="border-transparent px-2.5 hover:border-transparent active:bg-muted"
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
          /* 图一方案 A 紧凑 2 行吸底操作区：模型+规格一行 · 采样/步数与额度一行 · 全宽生成大按钮 */
          <StudioChipLookProvider value="outline">
            <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span data-assistant-field="model" className="min-w-0 flex-1">
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
                    className={cn(
                      'h-8 w-full max-w-none justify-between',
                      runModels.length > 0 && studioOutlineChipSetClass,
                    )}
                  />
                </span>
                <span data-assistant-field="specs" className="shrink-0">
                  <StudioSpecChip
                    disabled={isGenerating}
                    showCount
                    popoverAlign="end"
                  />
                </span>
              </div>

              <div className="flex min-w-0 items-center justify-between gap-2">
                <TagCapabilityChip
                  runModels={runModels}
                  disabled={isGenerating}
                />
                {hintVisible && blockedReason ? (
                  <span
                    aria-live="polite"
                    className="min-w-0 truncate text-2xs text-muted-foreground"
                  >
                    {blockedReason.message}
                  </span>
                ) : (
                  <TagQuotaLine runModels={runModels} />
                )}
              </div>

              <div className="flex items-center gap-2">
                <StudioGenerateButton
                  variant="block"
                  className="h-10 flex-1"
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
                />
                {isGenerating ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={cancelAllRunItems}
                    className="h-10 shrink-0 rounded-full px-3.5 text-2sm font-semibold"
                  >
                    {tCancel('cancelAll')}
                  </Button>
                ) : null}
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
          {/* 手机只留图标（名字在 aria-label 里），把那一行让给模型名（2026-11-12 英文实测）。 */}
          {mobile ? null : (
            <span className="truncate">
              {otherSet > 0 ? `${summary} +${otherSet}` : summary}
            </span>
          )}
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
            <h2 className="text-md font-semibold">{t('mobileParameters')}</h2>
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
  // 角色主图走精确参考也算「挂了图」：每张 +5 Anlas，Opus 免费不再适用（11-17）。
  const characterOutlet = useStudioCharacterOutlet()
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
              : characters.activeCardIds.length > 0
                ? undefined
                : false,
          preview: state.advancedParams.preview,
          outputFormat: state.advancedParams.outputFormat,
        }}
      />
    )
  }
  const { width, height } = resolveNovelAiDimensions({
    aspectRatio: state.aspectRatio,
    novelAiWidth: state.advancedParams.novelAiWidth,
    novelAiHeight: state.advancedParams.novelAiHeight,
  })
  const preciseReferenceCount =
    (state.advancedParams.novelAi?.preciseReferences?.length ?? 0) +
    characterOutlet.novelAiPreciseReferenceCount
  // 官方判据：文生图 · 单张 · ≤1024² · ≤28 步才免；挂底图（图生图 / 重绘）或精确
  // 参考一律按 Anlas 计；V5 免 Anlas 但计入用量条。
  const cost = getNovelAiOpusCost({
    width,
    height,
    steps: state.advancedParams.steps ?? NOVELAI_OPUS_FREE_LIMITS.maxSteps,
    imageCount: state.imageBatchCount,
    hasReferenceImage: imageUpload.referenceImages.length > 0,
    preciseReferenceCount,
    modelIds: runModels
      .filter((model) => getNovelAiCharacterLayoutMode(model.modelId))
      .map((model) => model.modelId),
  })
  const preciseAnlasCost = getNovelAiPreciseReferenceAnlasCost(
    preciseReferenceCount,
  )
  const message = {
    free: ['opusFree', 'opusFreeShort'],
    usageLimited: ['opusUsageLimited', 'opusUsageLimitedShort'],
    metered: ['opusMetered', 'opusMeteredShort'],
  } as const
  return (
    <span
      title={t(message[cost][0])}
      className={cn(
        'whitespace-nowrap text-2xs tabular-nums',
        preciseAnlasCost > 0
          ? 'font-mono font-semibold text-foreground'
          : 'text-muted-foreground',
      )}
    >
      {preciseAnlasCost > 0
        ? t('opusPreciseAnlasShort', { anlas: preciseAnlasCost })
        : t(message[cost][1])}
    </span>
  )
}
