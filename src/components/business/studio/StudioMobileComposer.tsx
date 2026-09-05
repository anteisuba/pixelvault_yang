'use client'

import { memo, useState } from 'react'
import {
  ArrowUp,
  ChevronDown,
  FileText,
  Loader2,
  Music2,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { useTranslations } from 'next-intl'

import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import {
  STUDIO_MOBILE_COMPOSER_CLASS,
  STUDIO_MOBILE_COMPOSER_VIDEO_CLASS,
  STUDIO_MOBILE_PROMPT_MAX_HEIGHT,
  STUDIO_PROMPT_SCROLL_ANCHOR_ID,
} from '@/constants/studio-mobile'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'
import { PromptInput, PromptInputTextarea } from '@/components/ui/prompt-input'
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioEnhanceButton } from '@/components/business/studio/StudioEnhanceButton'
import { StudioMobileModelSheet } from '@/components/business/studio/StudioMobileModelSheet'
import { StudioMobileSpecSheet } from '@/components/business/studio/StudioMobileSpecSheet'
import { useStudioSpecSummary } from '@/components/business/studio/StudioSpecFields'
import { useStudioVideoSpec } from '@/components/business/studio/StudioVideoSpecFields'
import { studioChipActiveClass } from '@/components/business/studio-shared/primitives/tool-surface'

/**
 * chip 行的丸样式 —— 32px 高（需求卡表 5），命中区靠 `touch-target-y` 补到 44。
 * ⚠ 只撑纵向：横向相邻的 chip 若也外扩会互相重叠，那是把「点不中」换成「点错」。
 */
const chipClass = cn(
  'touch-target-y flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
  'transition-colors duration-fast ease-standard active:bg-muted/60',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
  'disabled:pointer-events-none disabled:opacity-50',
)

/**
 * StudioMobileComposer —— `/studio/image` 与 `/studio/video` 移动端（`<1024`）
 * 底部固定 composer。
 *
 * 施工基准：`docs/references/pages/studio-image-mobile-request.md`（图片，owner
 * 2026-09-03 方向 A「画布优先」）+ `studio-video-mobile-request.md`（视频，同日
 * 拍板）。两行：
 *   1. 横向可滚的 chip 行
 *      · 图片：模型 ▾（多选名单）/ 规格（`1:1 · ×1`）▾ / ＋参考图 / ✨ 优化
 *      · 视频：模型 ▾（单选）/ 规格（`5s · 720p · 16:9`）▾ / 🔊 出声 /
 *              ＋参考图 / ♪ 音频参考 / 剧本
 *   2. 单行自增高提示词 + 黑色生成键（图片 44×44 方形 `↑`；视频带时长 `↑ 5s`）
 *   视频档在两行之间多一行 mono 费用（`≈ $0.12 · 5s × $0.024/s`）。
 *
 * ⭐ **一个组件按模态分支，不是两份平行实现**（需求卡备注第 1 条）。分叉的代价
 * 在图片那轮已经付过一次：禁用判据、chip 值、按钮文案各写一遍必然漂。
 *
 * ⚠ 生成键与桌面参数栏那颗**共用** `useStudioGenerateAction`：禁用判据、toast
 * 文案、请求组装只有一份实现。该 hook 内含 `REQUEST_GENERATE` 的执行端副作用，
 * 所以本组件与 `StudioPromptArea` **二选一渲染**（`StudioWorkbenchLayout` 按
 * `useIsMobile()` 分），不是 CSS 隐藏 —— 两个都挂 = 一次请求发两遍。
 *
 * ⚠ `id` 顶的是 `#studio-prompt` 这条既有滚动锚点（`StudioWorkspaceUI` 的
 * prefill / node handoff 两处、以及 skip-link 都指着它）。桌面由
 * `StudioPromptArea` 的 `PromptInput` 顶，两者永不同时挂载。
 */
export const StudioMobileComposer = memo(function StudioMobileComposer() {
  const { state, dispatch } = useStudioForm()
  const { lastGeneration } = useStudioGen()
  const t = useTranslations('StudioMobile')
  const tModels = useTranslations('Models')
  const tV2 = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tVideo = useTranslations('VideoGenerate')
  const tVideoAudio = useTranslations('StudioVideoAudio')
  const tScript = useTranslations('VideoScript')
  const {
    selectedModel,
    runModels,
    runModelIds,
    filterVideoModelByMode,
    handleSelectSingleModel,
    handleToggleRunModel,
    handleRemoveRunModel,
    blockedReason,
    handleGenerate,
    isGenerating,
    isImagePromptOverLimit,
    videoCostBasis,
  } = useStudioGenerateAction()
  const { short: imageSpecSummary } = useStudioSpecSummary()
  const {
    summary: videoSpecSummary,
    supportsGenerateAudio,
    generateAudioValue,
    isEmpty: videoSpecIsEmpty,
  } = useStudioVideoSpec()
  const [modelSheetOpen, setModelSheetOpen] = useState(false)
  const [specSheetOpen, setSpecSheetOpen] = useState(false)

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
  const specSummary = isVideo ? videoSpecSummary : imageSpecSummary
  /** 这一枪总共出几张 = 模型数 × 每模型张数（与桌面按钮上那个数同一个算式）。 */
  const totalOutputCount = Math.max(1, runModels.length) * state.imageBatchCount
  const hasResult = Boolean(lastGeneration?.url)
  // ⚠ 只有「正在跑」与「字数超限」是真禁用（与桌面那颗逐条一致）。缺模型 / 空
  // 提示词走 `aria-disabled` + 点击弹 toast —— 真 `disabled` 的按钮收不到点击，
  // 用户就只剩「点了没反应」这一种反馈。
  const hardDisabled = isGenerating || isImagePromptOverLimit
  // ⚠ 方形键上印不下长文案，所以「缺什么 / 这一枪出几张」全部只从无障碍名与
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

  return (
    <div
      id={STUDIO_PROMPT_SCROLL_ANCHOR_ID}
      className={cn(
        STUDIO_MOBILE_COMPOSER_CLASS,
        isVideo && STUDIO_MOBILE_COMPOSER_VIDEO_CLASS,
        'keyboard-aware-bottom-padding fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 border-t border-border/60 bg-background px-3 pt-2 shadow-lg',
      )}
    >
      {/* 第 1 行 —— 横向可滚，永不换行（换行会让 composer 高度跳，舞台跟着抖）。
          ⚠ 必须裹 Toolbar.Root：`ReferenceImageChip` / `StudioEnhanceButton`
          底下是 Radix `Toolbar.Button`，没有 roving-focus context 会直接抛。 */}
      <Toolbar.Root className="studio-mobile-chip-row flex min-w-0 items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setModelSheetOpen(true)}
          aria-label={tForm('modelLabel')}
          aria-haspopup="dialog"
          data-testid="studio-mobile-model-chip"
          className={chipClass}
        >
          <span className="max-w-32 truncate">{modelChipLabel}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
        {/* ⚠ 视频档没选模型时**整颗不渲染**（与桌面 `StudioVideoSpecPopover` 的
            第 3 条判据同一条）：档位全部实算自型号，没有型号就没有答案，留一颗
            只剩箭头的空丸是纯噪音 —— 真机 375 上量到过这一版。 */}
        {isVideo && videoSpecIsEmpty ? null : (
          <button
            type="button"
            onClick={() => setSpecSheetOpen(true)}
            aria-label={tV2('specLabel')}
            aria-haspopup="dialog"
            data-testid="studio-mobile-spec-chip"
            className={chipClass}
          >
            <span className="tabular-nums">{specSummary}</span>
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          </button>
        )}
        {/* 出声 —— 与规格 sheet 里那颗开关**镜像同一个 state**，不是第二个真相。
            ⚠ 只在选中端点的契约暴露 `generateAudio` 时才渲染：画一颗发不出去的
            开关比没有更糟（同 `StudioVideoSpecFields` 的判据）。 */}
        {isVideo && supportsGenerateAudio ? (
          <button
            type="button"
            role="switch"
            aria-checked={generateAudioValue}
            aria-label={tVideo('generateAudioLabel')}
            onClick={() =>
              dispatch({
                type: 'SET_VIDEO_GENERATE_AUDIO',
                payload: !generateAudioValue,
              })
            }
            data-testid="studio-mobile-audio-chip"
            className={cn(
              chipClass,
              generateAudioValue && studioChipActiveClass,
            )}
          >
            {generateAudioValue ? (
              <Volume2 className="size-3.5 shrink-0" />
            ) : (
              <VolumeX className="size-3.5 shrink-0" />
            )}
            {tVideo('generateAudioLabel')}
          </button>
        ) : null}
        {/* 参考图沿用既有那颗 —— 它自带移动端抽屉宿主，这里不重造。 */}
        <ReferenceImageChip disabled={isGenerating} />
        {isVideo ? (
          <>
            {/* 音频参考 / 剧本 —— 点开的是**既有**面板（`panels.videoAudio` /
                `panels.script`，宿主是 `StudioDockPanelArea`），移动端只是多一个
                入口，不新增 state 源。 */}
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'videoAudio' })
              }
              disabled={isGenerating}
              aria-label={tVideoAudio('pill')}
              data-testid="studio-mobile-audio-ref-chip"
              className={cn(
                chipClass,
                state.panels.videoAudio && studioChipActiveClass,
              )}
            >
              <Music2 className="size-3.5 shrink-0" />
              {tVideoAudio('pill')}
              {state.videoAudioRefs.length > 0 ? (
                <span className="tabular-nums">
                  {state.videoAudioRefs.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'TOGGLE_PANEL', payload: 'script' })
              }
              disabled={isGenerating}
              aria-label={tScript('panelTitle')}
              data-testid="studio-mobile-script-chip"
              className={cn(
                chipClass,
                state.panels.script && studioChipActiveClass,
              )}
            >
              <FileText className="size-3.5 shrink-0" />
              {tScript('panelTitle')}
            </button>
          </>
        ) : null}
        <StudioEnhanceButton disabled={isGenerating} />
      </Toolbar.Root>

      {/* 费用行（视频档）—— 一行 mono，说清「多少钱 + 怎么算出来的」。
          ⚠ 与桌面参数栏底部那一叠共用 `StudioCostPreview`，不在这里另算一个数。 */}
      {isVideo && selectedModel && videoCostBasis ? (
        <StudioCostPreview
          models={[selectedModel]}
          basis={videoCostBasis}
          variant="line"
        />
      ) : null}

      {/* 第 2 行 —— 提示词 + 生成 */}
      <PromptInput
        isLoading={isGenerating}
        value={state.prompt}
        onValueChange={(v) => dispatch({ type: 'SET_PROMPT', payload: v })}
        maxHeight={STUDIO_MOBILE_PROMPT_MAX_HEIGHT}
        onSubmit={handleGenerate}
        role="group"
        className="flex items-end gap-2 rounded-none border-0 bg-transparent p-0 shadow-none"
      >
        {/* ⚠ 纵向内边距归 `PromptInputTextarea` 自己（它带 `min-h-[44px] py-2`）——
            外框再补一层 py 会让这一行变成 58px，composer 高度直接破 120。 */}
        <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl border border-border/60 px-3">
          <PromptInputTextarea
            id={STUDIO_PROMPT_TEXTAREA_ID}
            aria-label={tForm('promptLabel')}
            placeholder={
              isVideo ? t('promptPlaceholderVideo') : t('promptPlaceholder')
            }
            // ⚠ 纵向内边距必须是 0，`min-h` 也要清掉：`react-textarea-autosize`
            //   在 `box-sizing: border-box` 下把内边距算进两遍（一行的空输入框
            //   量到 60px 而不是 40px），再叠上组件自带的 `min-h-[44px]`，
            //   这一行会顶到 62px，composer 直接破 120。44px 的命中区由外框的
            //   `min-h-11` 给，输入框只负责按行数自增高（最多 3 行后内部滚动）。
            // ⚠ `text-base`（16px）在 <768 是硬要求，不是排版偏好：iOS Safari 对
            //    小于 16px 的可聚焦输入框会**自动放大整页**，聚焦一次版式就散了。
            //    修法是把字号抬到 16 而不是 `maximum-scale`（那会连带禁掉用户
            //    自己的缩放）。桌面照旧 14px。
            className="min-h-0 p-0 font-sans text-base leading-5 md:text-sm"
          />
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
            'relative flex h-11 shrink-0 items-center justify-center gap-1 rounded-xl bg-primary text-primary-foreground shadow-sm',
            // 图片是 44×44 方形；视频那颗要装下时长，所以按内容伸缩。
            isVideo ? 'px-3 text-sm font-medium tabular-nums' : 'w-11',
            'transition-[background-color,transform] duration-fast ease-standard active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            // 挡住时降到次级填充 —— 与桌面那颗同一条规矩：降的是底不是字。
            !isGenerating &&
              blockedReason &&
              'bg-muted text-foreground shadow-none',
            hardDisabled && 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          {isGenerating ? (
            <Loader2 className="size-5 animate-spin" />
          ) : hasResult ? (
            <RotateCw className="size-5" />
          ) : (
            <ArrowUp className="size-5" />
          )}
          {/* 视频：按钮上带这一枪的时长（`↑ 5s`）。图片：这一枪出几张 —— 只在
              >1 时出现，数字长在角标上而不是按钮文字里，方形键的尺寸才不会随
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
        filterOption={filterVideoModelByMode}
      />
      <StudioMobileSpecSheet
        open={specSheetOpen}
        onOpenChange={setSpecSheetOpen}
        mode={isVideo ? 'video' : 'image'}
      />
    </div>
  )
})
