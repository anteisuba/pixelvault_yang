'use client'

import { memo, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUp,
  ChevronDown,
  FileText,
  RotateCw,
  UserRound,
} from '@/components/icons'
import { useTranslations } from 'next-intl'

import {
  STUDIO_PROMPT_TEXTAREA_ID,
  STUDIO_REFERENCE_DRAG_TYPE,
} from '@/constants/studio'
import {
  STUDIO_MOBILE_COMPOSER_CLASS,
  STUDIO_MOBILE_COMPOSER_VIDEO_CLASS,
  STUDIO_MOBILE_PROMPT_MAX_HEIGHT,
  STUDIO_PROMPT_SCROLL_ANCHOR_ID,
} from '@/constants/studio-mobile'
import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { useStudioVideoAssets } from '@/hooks/use-studio-video-assets'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import { PromptInput, PromptInputTextarea } from '@/components/ui/prompt-input'
import { Spinner } from '@/components/ui/spinner'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { StudioReferencePromptInput } from './StudioReferencePromptInput'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioCardPicker } from '@/components/business/studio/StudioCardPicker'
import {
  StudioMobileAddSheet,
  type StudioMobileAddRow,
} from '@/components/business/studio/StudioMobileAddSheet'
import { StudioMobileModelSheet } from '@/components/business/studio/StudioMobileModelSheet'
import { StudioModelCapabilityChips } from '@/components/business/studio/StudioModelCapabilityChips'
import { StudioSpecChip } from '@/components/business/studio/StudioSpecChip'
import { StudioVideoAssetRail } from '@/components/business/studio-shared/chrome/StudioVideoAssetRail'

/**
 * 输入框卡里那一行的幽灵丸（模型 / 规格）—— ⛔ 不画边：卡自己有边，框里再套一圈
 * 描边就是「框里套框」。32px 高，命中区由 `.studio-mobile-chip-row` 补到 44。
 */
const ghostChipClass = cn(
  'flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-2sm font-medium text-foreground',
  'transition-colors duration-fast ease-standard active:bg-muted',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50',
)
/** 规格那颗是共用的 `SpecChip`，只在这里把它的描边收掉（闪烁提示的底色照旧）。 */
const specGhostClass =
  'border-transparent px-2.5 font-medium hover:border-transparent active:bg-muted'
/** 模型参数那颗是共用的单颗专属 chip，同样收成幽灵丸。 */
const capabilityGhostClass =
  'h-8 gap-1 px-2.5 text-2sm text-foreground hover:bg-transparent active:bg-muted'

/**
 * StudioMobileComposer —— `/studio/image` 与 `/studio/video` 移动端（`<1024`）
 * 底部固定 composer。
 *
 * 形态（owner 2026-10-02 选「Claude 式最简」，替掉 09-03 方向 A 的四行叠法）：
 * 一张输入框卡 = 挂着的素材（有才出现）· 提示词整宽 · 一行
 * `＋ · 模型 ▾ · 规格 ▾ · 专属 ……… 生成`。参考图 / 模板 / 角色（视频：素材 / 剧本 /
 * 模板）收进「＋」（`StudioMobileAddSheet`）；模型参数（专属）在规格旁边（owner
 * 2026-10-03）；写法切换挪到舞台左上角（`StudioWorkspaceUI` 的 `header`，与标签台
 * 手机同一位置）。视频档在卡上方多一行
 * mono 费用（`≈ $0.12 · 5s × $0.024/s`）。
 *
 * ⭐ **一个组件按模态分支，不是两份平行实现**（需求卡备注第 1 条）。分叉的代价
 * 在图片那轮已经付过一次：禁用判据、chip 值、按钮文案各写一遍必然漂。
 *
 * ⚠ 生成键与桌面参数栏那颗**共用** `useStudioGenerateAction`：禁用判据、toast
 * 文案、请求组装只有一份实现。该 hook 内含 `REQUEST_GENERATE` 的执行端副作用，
 * 所以本组件与 `StudioPromptArea` **二选一渲染**（`StudioWorkbenchLayout` 按
 * `useIsMobile()` 分），不是 CSS 隐藏 —— 两个都挂 = 一次请求发两遍。视频素材那一份
 * （`useStudioVideoAssets`）同理：桌面由 `StudioPromptArea` 持有，手机由这里持有。
 *
 * ⚠ `id` 顶的是 `#studio-prompt` 这条既有滚动锚点（`StudioWorkspaceUI` 的
 * prefill / node handoff 两处、以及 skip-link 都指着它）。桌面由
 * `StudioPromptArea` 的 `PromptInput` 顶，两者永不同时挂载。
 */
export const StudioMobileComposer = memo(function StudioMobileComposer({
  templates,
  overlay,
}: {
  /**
   * 「模板」开合舞台上那块面板（owner 2026-09-26 模板 C，画板「模板 C · 手机」）；
   * `restoring` = 刚撤销了一次套用，提示词框从 40% 淡回来。
   */
  templates: { open: boolean; onToggle: () => void; restoring?: boolean }
  /** 浮在输入条上沿的东西（套用模板后的「已套用 · 撤销」）。 */
  overlay?: ReactNode
}) {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, characters } = useStudioData()
  const { lastGeneration } = useStudioGen()
  const t = useTranslations('StudioMobile')
  const tModels = useTranslations('Models')
  const tV2 = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tImageChip = useTranslations('ImageChip')
  const tImageUpload = useTranslations('ImageUpload')
  const tTemplates = useTranslations('PromptLibrary')
  const tScript = useTranslations('VideoScript')
  const {
    selectedModel,
    runModels,
    runModelIds,
    filterVideoModelOption,
    handleSelectSingleModel,
    handleToggleRunModel,
    handleRemoveRunModel,
    blockedReason,
    handleGenerate,
    isGenerating,
    isImagePromptOverLimit,
    videoCostBasis,
  } = useStudioGenerateAction()
  const videoAssets = useStudioVideoAssets()
  const [modelSheetOpen, setModelSheetOpen] = useState(false)

  const composerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const composer = composerRef.current
    const layout = composer?.closest<HTMLElement>('.studio-layout-v2')
    if (!composer || !layout) return
    const update = () =>
      layout.style.setProperty(
        '--studio-mobile-composer-height',
        `${Math.ceil(composer.getBoundingClientRect().height)}px`,
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(composer)
    return () => {
      observer.disconnect()
      layout.style.removeProperty('--studio-mobile-composer-height')
    }
  }, [])

  const isVideo = state.outputType === 'video'

  const labelOf = (option: (typeof runModels)[number]) =>
    option.displayLabel ?? getTranslatedModelLabel(tModels, option.modelId)
  /**
   * 图片档 chip 上写的是这一轮的**名单**，不是「当前选中那一个」——
   * 图片本来就支持多模型 × 每模型 N 张。折成一个名字会让用户在手机上看不出
   * 自己正要跑几路。视频档恒单条，写的就是那一个型号名。
   */
  const modelChipLabel = isVideo
    ? (selectedModel?.displayLabel ??
      (selectedModel
        ? getTranslatedModelLabel(tModels, selectedModel.modelId)
        : t('modelChipEmpty')))
    : runModels.length === 0
      ? t('modelChipEmpty')
      : runModels.length === 1
        ? labelOf(runModels[0])
        : t('modelChipMulti', { count: runModels.length })
  /** 这一枪总共出几张 = 模型数 × 每模型张数（与桌面按钮上那个数同一个算式）。 */
  const totalOutputCount = Math.max(1, runModels.length) * state.imageBatchCount
  const hasResult = Boolean(lastGeneration?.url)
  // ⚠ 只有「正在跑」与「字数超限」是真禁用（与桌面那颗逐条一致）。缺模型 / 空
  // 提示词走 `aria-disabled` + 点击弹 toast —— 真 `disabled` 的按钮收不到点击，
  // 用户就只剩「点了没反应」这一种反馈。
  const hardDisabled = isGenerating || isImagePromptOverLimit
  // ⚠ 圆键上印不下长文案，所以「缺什么 / 这一枪出几张」全部只从无障碍名与
  //   toast 出去；数量在按钮上是一枚角标，不是文字。
  const generateLabel = blockedReason
    ? blockedReason.message
    : isVideo
      ? hasResult
        ? t('regenerate')
        : t('generate')
      : totalOutputCount > 1
        ? tV2('generateCount', { count: totalOutputCount })
        : hasResult
          ? t('regenerate')
          : t('generate')

  const cardCount = characters.activeCardIds.length
  const openTemplates = () => {
    if (!templates.open) templates.onToggle()
  }
  // 「＋」下半截：模板（开舞台面板）· 角色（抽屉里推进一页）；视频：模板 · 剧本。
  const addRows: StudioMobileAddRow[] = [
    {
      key: 'templates',
      icon: <FileText className="size-4" />,
      label: tTemplates('templatePicker'),
      onSelect: openTemplates,
    },
    isVideo
      ? {
          key: 'script',
          icon: <FileText className="size-4" />,
          label: tScript('panelTitle'),
          onSelect: () => dispatch({ type: 'OPEN_PANEL', payload: 'script' }),
        }
      : {
          key: 'characters',
          icon: <UserRound className="size-4" />,
          label: tV2('characters'),
          detail: cardCount > 0 ? String(cardCount) : undefined,
          page: <StudioCardPicker />,
        },
  ]

  return (
    <div
      ref={composerRef}
      id={STUDIO_PROMPT_SCROLL_ANCHOR_ID}
      className={cn(
        STUDIO_MOBILE_COMPOSER_CLASS,
        isVideo && STUDIO_MOBILE_COMPOSER_VIDEO_CLASS,
        // 与 PC 一样上下两张卡（owner 2026-10-04）：底部一条地台灰，里面浮一张白卡。
        'keyboard-aware-bottom-padding fixed inset-x-0 bottom-0 z-40 flex flex-col gap-1.5 bg-surface-workbench px-2.5 pt-2.5',
      )}
    >
      {overlay}
      {/* 费用行（视频档）—— 一行 mono，说清「多少钱 + 怎么算出来的」。
          ⚠ 与桌面参数栏底部那一叠共用 `StudioCostPreview`，不在这里另算一个数。 */}
      {isVideo && selectedModel && videoCostBasis ? (
        <StudioCostPreview
          models={[selectedModel]}
          basis={videoCostBasis}
          variant="line"
        />
      ) : null}

      <PromptInput
        isLoading={isGenerating}
        value={state.prompt}
        onValueChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
        maxHeight={STUDIO_MOBILE_PROMPT_MAX_HEIGHT}
        onSubmit={handleGenerate}
        role="group"
        className="flex flex-col gap-1.5 rounded-2xl border-0 bg-card px-3 pt-2.5 pb-2 shadow-float"
      >
        {/* 挂着的素材 —— 有才出现（与桌面输入框卡同一颗）：图片档是参考图条，
            视频档是素材排（图 · 参考视频 · 音频，首 / 尾帧角标、这一枪怎么发）。 */}
        {isVideo ? (
          <StudioVideoAssetRail assets={videoAssets} disabled={isGenerating} />
        ) : (
          <>
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
            {imageUpload.isUploading ? (
              <div
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Spinner aria-hidden="true" className="size-4 shrink-0" />
                {tImageUpload('uploading')}
              </div>
            ) : null}
          </>
        )}

        {/* 提示词 —— 整宽，最多 3 行后在框内滚。 */}
        <div
          className={cn(
            'flex min-h-8 min-w-0 items-center',
            templates.restoring &&
              'animate-in fade-in-40 duration-base ease-standard motion-reduce:animate-none',
          )}
        >
          {!isVideo ? (
            <StudioReferencePromptInput
              placeholder={t('promptPlaceholder')}
              disabled={isGenerating}
              onSubmit={handleGenerate}
              className="max-h-24 min-h-6 w-full overflow-y-auto py-1 font-sans text-base leading-6 md:text-sm"
            />
          ) : (
            <PromptInputTextarea
              id={STUDIO_PROMPT_TEXTAREA_ID}
              aria-label={tForm('promptLabel')}
              placeholder={t('promptPlaceholderVideo')}
              // ⚠ 纵向内边距必须是 0，`min-h` 也要清掉：`react-textarea-autosize`
              //   在 `box-sizing: border-box` 下把内边距算进两遍（一行的空输入框
              //   量到 60px 而不是 40px），再叠上组件自带的 `min-h-[44px]`，
              //   这一行会顶到 62px。行高由外框的 `min-h-8` 兜，输入框只负责按
              //   行数自增高（最多 3 行后内部滚动）。
              // ⚠ `text-base`（16px）在 <768 是硬要求，不是排版偏好：iOS Safari 对
              //    小于 16px 的可聚焦输入框会**自动放大整页**，聚焦一次版式就散了。
              //    修法是把字号抬到 16 而不是 `maximum-scale`（那会连带禁掉用户
              //    自己的缩放）。桌面照旧 14px。
              className="min-h-0 p-0 font-sans text-base leading-6 md:text-sm"
            />
          )}
        </div>

        {/* ＋ · 模型 · 规格 · 专属 ……… 生成。
            ⚠ 整行挡住冒泡：`PromptInput` 的点击会把焦点送进提示词（窄视口 + 鼠标时
            不跳过），弹层刚开就被抢走焦点会当场收起。 */}
        <div
          className="flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="studio-mobile-chip-row flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <StudioMobileAddSheet
              disabled={isGenerating}
              rows={addRows}
              hasHiddenSetting={!isVideo && cardCount > 0}
              {...(isVideo ? { videoAssets } : {})}
            />
            <button
              type="button"
              onClick={() => setModelSheetOpen(true)}
              aria-label={tForm('modelLabel')}
              aria-haspopup="dialog"
              data-testid="studio-mobile-model-chip"
              className={ghostChipClass}
            >
              <span className="max-w-32 truncate">{modelChipLabel}</span>
              <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            </button>
            {/* 规格 —— 与桌面**同一颗** chip（D2 ④，第 12 项）：触屏上它自己就是
                底部抽屉（视频的原生出声开关也在里面）。档位全部实算自型号，没有任何
                一档可调时它自己不渲染。 */}
            <StudioSpecChip
              disabled={isGenerating}
              triggerClassName={specGhostClass}
            />
            {/* 模型参数（专属）—— 规格旁边一颗（owner 2026-10-03），与桌面工具行
                同一颗 chip、同一个弹层；这一轮没有可调项时整颗不渲染。视频档的专属
                在规格抽屉里，不挂这颗。 */}
            {!isVideo ? (
              <StudioModelCapabilityChips
                variant="single"
                disabled={isGenerating}
                triggerClassName={capabilityGhostClass}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={hardDisabled}
            aria-label={generateLabel}
            aria-busy={isGenerating}
            aria-disabled={Boolean(blockedReason) || hardDisabled}
            data-testid="studio-mobile-generate"
            className={cn(
              'touch-target-y relative flex h-9 shrink-0 items-center justify-center gap-1 rounded-full bg-primary text-primary-foreground',
              // 图片是 36 圆键；视频那颗要装下时长，所以按内容伸缩。
              isVideo ? 'px-3 text-sm font-medium tabular-nums' : 'w-9',
              'transition-[background-color,transform] duration-fast ease-standard active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              // 挡住时降到次级填充 —— 与桌面那颗同一条规矩：降的是底不是字。
              !isGenerating && blockedReason && 'bg-muted text-foreground',
              hardDisabled &&
                'cursor-not-allowed bg-muted text-muted-foreground',
            )}
          >
            {isGenerating ? (
              <Spinner className="size-4" />
            ) : hasResult ? (
              <RotateCw className="size-4" />
            ) : (
              <ArrowUp className="size-4" />
            )}
            {/* 视频：按钮上带这一枪的时长（`↑ 5s`）。图片：这一枪出几张 —— 只在
                >1 时出现，数字长在角标上而不是按钮文字里，圆键的尺寸才不会随
                张数跳。 */}
            {isVideo ? (
              <span data-testid="studio-mobile-generate-duration">
                {`${state.videoDuration}s`}
              </span>
            ) : totalOutputCount > 1 && !isGenerating ? (
              <span
                aria-hidden
                data-testid="studio-mobile-generate-count"
                className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-2xs font-semibold leading-none text-background ring-1 ring-background"
              >
                {totalOutputCount}
              </span>
            ) : null}
          </button>
        </div>
      </PromptInput>

      <StudioMobileModelSheet
        open={modelSheetOpen}
        onOpenChange={setModelSheetOpen}
        mode={isVideo ? 'video' : 'image'}
        runModels={runModels}
        runModelIds={runModelIds}
        onToggle={handleToggleRunModel}
        onRemove={handleRemoveRunModel}
        selectedOptionId={state.selectedOptionId ?? null}
        onSelectSingle={handleSelectSingleModel}
        filterOption={filterVideoModelOption}
      />
    </div>
  )
})
