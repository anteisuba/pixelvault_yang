'use client'

import { memo, useEffect, useState, type CSSProperties } from 'react'
import {
  BookmarkPlus,
  Bot,
  Download,
  GripHorizontal,
  ImagePlus,
  Maximize2,
  PenTool,
  Pin,
  RotateCcw,
  Share2,
  Sparkles,
  X,
} from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'

import { useStudioGen, useStudioForm } from '@/contexts/studio-context'
import { useAskAssistantAboutImage } from '@/hooks/use-ask-assistant-about-image'
import { useIsMobile } from '@/hooks/use-mobile'
import { AudioPlayer } from '@/components/ui/audio-player'
import VideoPlayer from '@/components/business/VideoPlayer'
import { subscribeStudioResultDetail } from '@/lib/studio-result-detail'
import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import { StudioEmptyState } from '@/components/business/studio/StudioEmptyState'
import { StudioGeneratingProgress } from '@/components/business/studio-shared'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { downloadRemoteAsset } from '@/lib/api-client/generation'
import { getGenerationAudioSegments } from '@/lib/generation-media'
import { resolveGeneratingStageKey } from '@/lib/generation-progress'
import { getTranslatedModelLabel } from '@/lib/model-options'
import type { GenerationRecord } from '@/types'
import { useStudioDraggable } from '@/hooks/use-studio-draggable'
import { formatDuration } from '@/lib/video-utils'

interface GenerationPreviewProps {
  generation: GenerationRecord | null
  isLatestResult?: boolean
  onUseAsReference?: (url: string) => void
  onRemix?: (generation: GenerationRecord) => void
  onEdit?: (generation: GenerationRecord) => void
  onSaveRecipe?: (generation: GenerationRecord) => void
  onRetry?: () => void
  /**
   * The stage has a definite height (desktop bottom-composer layout): the art
   * box of a generation with no result yet follows it instead of the viewport,
   * so its whole edge — where the progress line runs — stays on screen.
   */
  fillStage?: boolean
}

/**
 * Pull a usable, non-negative seed off a GenerationRecord. The top-level
 * `seed` field is a union (bigint from DB, string after JSON round-trip,
 * number from the in-memory layer) so we coerce defensively; snapshot
 * is the fallback. Returns null when no valid seed is present —
 * old generations / random-seeded runs.
 */
function extractSeedFromGeneration(gen: GenerationRecord): number | null {
  const raw = gen.seed
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) return n
  }
  // BigInt literal `0n` requires ES2020+; project target is older, so
  // use the constructor form which works on every target.
  if (
    typeof raw === 'bigint' &&
    raw >= BigInt(0) &&
    raw <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(raw)
  }
  if (typeof gen.snapshot === 'object' && gen.snapshot !== null) {
    const snapSeed = (gen.snapshot as { seed?: unknown }).seed
    if (
      typeof snapSeed === 'number' &&
      Number.isFinite(snapSeed) &&
      snapSeed >= 0
    ) {
      return snapSeed
    }
  }
  return null
}

/** The proportions (width / height) a `studio-fit-box` keeps; see globals.css. */
function fitRatioStyle(ratio: number): CSSProperties {
  return { '--studio-fit-ratio': ratio } as CSSProperties
}

export const GenerationPreview = memo(function GenerationPreview({
  generation,
  onUseAsReference,
  onRemix,
  onEdit,
  onSaveRecipe,
  onRetry,
  fillStage = false,
}: GenerationPreviewProps) {
  const {
    error: runError,
    isGenerating,
    elapsedSeconds,
    activeRun,
    cancelRunItem,
  } = useStudioGen()
  const { state, dispatch } = useStudioForm()
  // A video's failure is said on its queue line (reason + retry this one,
  // video workbench A ③), so the stage lays no second one over the last video.
  const error = state.outputType === 'video' ? null : runError
  const t = useTranslations('StudioV3')
  const tCancel = useTranslations('GenerationCancel')
  const tModels = useTranslations('Models')
  const tMobile = useTranslations('StudioMobile')
  const isMobile = useIsMobile()
  // §3.0b 第 4 条：把这张结果图作为附件引用进助手对话（不自动发送、不自动喂图）。
  const askAssistantAboutImage = useAskAssistantAboutImage()
  const [detailOpen, setDetailOpen] = useState(false)
  /**
   * 台账 L：生成完成 toast 上的「查看作品」打开的就是下面这个浮层，不再整页
   * 跳去 `/gallery/<id>`（那条路必然 404 且会清空整个工作台，理由见
   * `lib/studio-result-detail.ts`）。只认**当前正在展示的那一次生成**——
   * 队列里别的结果不该把这个浮层劫走。
   */
  useEffect(
    () =>
      subscribeStudioResultDetail((generationId) => {
        if (generationId !== generation?.id) return
        setDetailOpen(true)
      }),
    [generation?.id],
  )
  const [toolDrawerOpen, setToolDrawerOpen] = useState(false)
  // 单条批次时取当前 pending 项的 `executionStage`（runner 冷启动排队 /
  // GPU 出图中）压过按已用时长猜的阶段词，见 `resolveGeneratingStageKey`。
  const activeGenerateItem =
    activeRun?.mode === 'single' ? activeRun.items[0] : undefined
  const activeExecutionStage =
    activeGenerateItem && 'executionStage' in activeGenerateItem
      ? activeGenerateItem.executionStage
      : undefined
  const generatingStageKey = resolveGeneratingStageKey(
    elapsedSeconds,
    activeExecutionStage,
  )
  const generatingStageLabel = t(
    `generatingOverlayStages.${generatingStageKey}` as const,
  )

  // 舞台新生成那一行参数 — "{elapsed}s · {模型显示名} · {比例}"（加载态 A）。
  // activeRun 与 isGenerating 在同一次同步 setState 批次里落地，故 isGenerating
  // 为 true 时 activeRun 必然已可用；items[0] 兜底 selectedItemId 尚未命中的边界。
  const activeRunModelId =
    activeRun?.items.find((item) => item.id === activeRun.selectedItemId)
      ?.modelId ?? activeRun?.items[0]?.modelId
  const activeRunModelLabel = activeRunModelId
    ? getTranslatedModelLabel(tModels, activeRunModelId)
    : null
  const generatingParamsLine = activeRunModelLabel
    ? `${Math.floor(elapsedSeconds)}s · ${activeRunModelLabel} · ${state.aspectRatio}`
    : undefined

  // ── Completion beat: keep the progress chrome mounted a beat past
  // isGenerating→false so StudioGeneratingProgress can play its close→hold→
  // fade sequence over the freshly-revealed media (docs/references/loading.md).
  // Adjust-state-during-render (not useEffect) per the "you might not need
  // an effect" pattern — reacting to a prop transition, not synchronizing
  // with an external system, so react-hooks/set-state-in-effect stays clean.
  const [completingGenerationId, setCompletingGenerationId] = useState<
    string | null
  >(null)
  // The closed line starts to fade: the veil lifts and the new media comes out
  // of its blur on the same beat (加载态 A motion table「出图」).
  const [completionReleased, setCompletionReleased] = useState(false)
  const [prevIsGenerating, setPrevIsGenerating] = useState(isGenerating)
  if (isGenerating !== prevIsGenerating) {
    setPrevIsGenerating(isGenerating)
    if (prevIsGenerating && !isGenerating && generation && !error) {
      setCompletingGenerationId(generation.id)
      setCompletionReleased(false)
    }
  }
  const isCompletingThisGeneration =
    completingGenerationId !== null && completingGenerationId === generation?.id
  const completionHolding = isCompletingThisGeneration && !completionReleased
  // A redo that failed: the old media stays under the veil and the stopped
  // line says why in place, like a canvas card (⛔ red box, ⛔ error dialog).
  const failed = !isGenerating && error !== null
  const showGeneratingOverlay =
    isGenerating || isCompletingThisGeneration || failed
  // Audio / video frames keep a hairline edge of their own: they hand it to the
  // line while it runs (⛔ a second frame next to the line) and take it back
  // under the fading line, like a canvas card's hairline.
  const edgeBusy = isGenerating || failed || completionHolding
  const failure = failed
    ? {
        message: error,
        retryLabel: t('retry'),
        ...(onRetry ? { onRetry } : {}),
      }
    : null

  const dragRef = useStudioDraggable({
    url: generation?.url ?? undefined,
    generationId: generation?.id ?? '',
    outputType: 'IMAGE',
  })
  // The image frame takes the image's own proportions, so a redo's line runs
  // on the image's edge (⛔ a frame wider than the image): the natural size once
  // loaded, the record's size until then.
  const [loadedRatio, setLoadedRatio] = useState<{
    id: string
    ratio: number
  } | null>(null)
  const imageRatio =
    generation && loadedRatio?.id === generation.id
      ? loadedRatio.ratio
      : generation && generation.width > 0 && generation.height > 0
        ? generation.width / generation.height
        : 1

  // ── Empty state ───────────────────────────────────────────────────
  if (!generation && !isGenerating && !error) {
    if (
      state.outputType === 'image' ||
      state.outputType === 'video' ||
      state.outputType === 'audio'
    ) {
      // 起手势空态（外边距归 StudioWorkbenchLayout 单层管理，这里不再加 wrapper）。
      return (
        <StudioEmptyState
          key={state.outputType}
          mode={state.outputType}
          onRemix={onRemix}
        />
      )
    }

    return (
      <div className="flex flex-col items-center justify-center rounded-2xl px-3 py-7 sm:px-6 sm:py-16">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 sm:size-10">
          <Sparkles className="size-4 text-primary/60 sm:size-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground sm:mt-4">
          {t('emptyStateTitle')}
        </p>
        <p className="mt-1 text-center text-sm leading-6 text-muted-foreground">
          {t('emptyStateHint')}
        </p>
      </div>
    )
  }

  // ── No result yet: generating, or it failed (加载态 A) ─────────────
  // One branch for both, so the same progress element stays mounted when the
  // job fails and the line stops grey where it was. The art box is plain —
  // the line on its edge is its only frame (⛔ dashed outer card, ⛔ shimmer).
  const previewItem = activeRun?.items.find(
    (item) => item.status === 'generating' && item.previewUrl,
  )
  const previewUrl =
    previewItem?.status === 'generating' ? previewItem.previewUrl : undefined
  if (!generation) {
    const requestedRatio = (() => {
      switch (state.aspectRatio) {
        case '16:9':
          return 16 / 9
        case '9:16':
          return 9 / 16
        case '4:3':
          return 4 / 3
        case '3:4':
          return 3 / 4
        default:
          return 1
      }
    })()

    return (
      // The art box has the requested proportions. On a stage with its own
      // height it is as large as the stage allows (`studio-fit-box`); elsewhere
      // the height is capped by the viewport and the width follows the ratio,
      // `maxWidth: 100%` letterboxing wide ratios into the column.
      <div
        className={cn(
          'flex w-full items-center justify-center',
          fillStage
            ? 'studio-fit-area min-h-0 flex-1'
            : 'mx-auto max-w-7xl 2xl:max-w-[88rem]',
        )}
        style={
          fillStage
            ? undefined
            : { height: isMobile ? 'min(45vh, 360px)' : 'min(72vh, 760px)' }
        }
        // The failure announces itself (role="alert"); a live region around it
        // would read it twice.
        aria-live={failure ? undefined : 'polite'}
      >
        <div
          className={cn(
            'relative overflow-hidden rounded-xl bg-card',
            fillStage ? 'studio-fit-box' : 'h-full',
          )}
          style={
            fillStage
              ? fitRatioStyle(requestedRatio)
              : { aspectRatio: requestedRatio, maxWidth: '100%' }
          }
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={generatingStageLabel}
              className="absolute inset-0 size-full object-contain"
            />
          ) : null}
          <StudioGeneratingProgress
            elapsedSeconds={elapsedSeconds}
            stageLabel={generatingStageLabel}
            paramsLine={generatingParamsLine}
            variant="full"
            cornerRadiusVar="--radius-xl"
            failure={failure}
          />
          {isGenerating &&
            activeRun?.mode === 'single' &&
            activeRun.items[0] && (
              <button
                type="button"
                onClick={() => cancelRunItem(activeRun.items[0].id)}
                data-testid="generation-preview-cancel"
                className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-background/85 text-muted-foreground backdrop-blur-sm transition-colors duration-fast ease-standard hover:text-foreground"
              >
                <X className="size-4" />
                <span className="sr-only">{tCancel('cancel')}</span>
              </button>
            )}
        </div>
      </div>
    )
  }

  // ── Has generation: two-column layout (image + right toolbar) ─────
  const canUseAsReference =
    generation.outputType === 'IMAGE' && typeof onUseAsReference === 'function'
  const audioSegments = getGenerationAudioSegments(generation)

  const handleDownload = async () => {
    if (!generation.url) return
    const ext =
      generation.outputType === 'VIDEO'
        ? 'mp4'
        : generation.outputType === 'AUDIO'
          ? 'mp3'
          : 'png'
    const result = await downloadRemoteAsset(
      generation.url,
      `pixelvault-${generation.id}.${ext}`,
    )
    if (!result.success) {
      window.open(generation.url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleShare = async () => {
    if (!generation.url) return
    try {
      await navigator.clipboard.writeText(generation.url)
    } catch {
      // Fallback: ignore
    }
  }

  // Phase 1B: "Lock seed" — copies the current generation's seed into
  // FormContext.advancedParams.seed. Once locked, the next Generate
  // tap reuses this seed even if the user tweaks the prompt, which is
  // the canonical "stable composition, tweak one tag" workflow. We
  // intentionally do NOT auto-trigger generate — the value of locking
  // shows up the moment the user changes a token and clicks Generate
  // themselves; surprise-generating wastes credits.
  const lockableSeed = generation ? extractSeedFromGeneration(generation) : null
  // Plain handler (not useCallback) because we're already past the
  // component's null-early-return; the React Hooks rule forbids hooks
  // beyond that point. renderTools is recreated each render anyway so
  // memoisation here would be a no-op.
  const handleLockSeed = () => {
    if (lockableSeed === null) return
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, seed: lockableSeed },
    })
    toast.success(t('seedLockedToast', { seed: lockableSeed }))
  }

  // ── Over media that is already there: redo, the closing beat, or a failure.
  // The old media stays under a veil while the line runs on the box's edge;
  // when the new one arrives the line closes and holds, then the veil lifts as
  // the line fades (motion table「重画已有图」).
  const renderGeneratingOverlay = (radius: 'xl' | '2xl') =>
    showGeneratingOverlay ? (
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-10 overflow-hidden',
          radius === 'xl' ? 'rounded-xl' : 'rounded-2xl',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 bg-background/60 transition-opacity duration-base ease-linear motion-reduce:transition-none',
            isCompletingThisGeneration && !completionHolding && 'opacity-0',
          )}
        />
        <StudioGeneratingProgress
          elapsedSeconds={elapsedSeconds}
          stageLabel={generatingStageLabel}
          variant="compact"
          cornerRadiusVar={radius === 'xl' ? '--radius-xl' : '--radius-2xl'}
          isCompleting={isCompletingThisGeneration}
          onEdgeRelease={() => setCompletionReleased(true)}
          onCompleteAnimationDone={() => setCompletingGenerationId(null)}
          failure={failure}
        />
      </div>
    ) : null

  // ── Shared image container ────────────────────────────────────────
  // The frame is the image's own box — no card around it (the stage's frame
  // has no edge of its own; 加载态 A). On a stage with its own height it is as
  // large as the stage allows; elsewhere it hugs the image, capped by the
  // viewport.
  const imageFrame = (
    <TransformWrapper
      minScale={1}
      maxScale={5}
      doubleClick={{ mode: 'toggle', step: 2 }}
      wheel={{ step: 0.1 }}
      panning={{ velocityDisabled: true }}
      disabled={isGenerating}
    >
      <div
        ref={dragRef}
        className={cn(
          'group relative overflow-hidden rounded-xl',
          fillStage ? 'studio-fit-box' : 'mx-auto w-fit max-w-full',
        )}
        style={fillStage ? fitRatioStyle(imageRatio) : undefined}
      >
        <TransformComponent
          {...(fillStage
            ? { wrapperClass: '!size-full', contentClass: '!size-full' }
            : {})}
        >
          {/* Bare <img> — the gallery ImageCard wraps the image in a card with
              date, prompt, metadata footer. Inside Studio the prompt already
              lives in the input below, so the footer is redundant noise AND
              its layout pushes the image past max-h, cropping it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={generation.id}
            src={isGenerating && previewUrl ? previewUrl : generation.url}
            alt={generation.prompt ?? ''}
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (naturalWidth > 0 && naturalHeight > 0) {
                setLoadedRatio({
                  id: generation.id,
                  ratio: naturalWidth / naturalHeight,
                })
              }
            }}
            className={cn(
              'studio-generation-image block transition-[filter] duration-slow ease-standard motion-reduce:transition-none',
              fillStage
                ? 'size-full object-cover'
                : cn(
                    'max-w-full object-contain',
                    isMobile ? 'max-h-[45vh]' : 'max-h-[72vh]',
                  ),
              // The new image waits under the blur until the closed line lets go.
              completionHolding && 'motion-safe:blur-sm',
            )}
          />
        </TransformComponent>

        {/* Drag hint — desktop only */}
        {!isMobile &&
          !showGeneratingOverlay &&
          generation.outputType === 'IMAGE' && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-2xs text-muted-foreground backdrop-blur-sm">
                <GripHorizontal className="size-3" />
                {t('dragHint')}
              </span>
            </div>
          )}

        {renderGeneratingOverlay('xl')}
      </div>
    </TransformWrapper>
  )
  const imageContainer = fillStage ? (
    <div className="studio-fit-area flex min-h-0 flex-1 items-center justify-center">
      {imageFrame}
    </div>
  ) : (
    imageFrame
  )

  // ── Audio container ───────────────────────────────────────────────
  const audioContainer = (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-dashed bg-muted/10 transition-colors duration-base ease-linear',
        edgeBusy ? 'border-transparent' : 'border-border/60',
      )}
    >
      <div className="flex flex-col items-center justify-center gap-4 py-12 sm:py-16">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Download className="size-7 text-primary/60" />
        </div>
        <div className="w-full max-w-md px-6">
          <AudioPlayer src={generation.url} segments={audioSegments} />
        </div>
        {generation.duration && (
          <p className="text-xs text-muted-foreground">
            {formatDuration(generation.duration)}
          </p>
        )}
      </div>

      {renderGeneratingOverlay('2xl')}
    </div>
  )

  // ── Video container ───────────────────────────────────────────────
  /**
   * 播放器上那枚 pill —— `模型 · 5s · 720p`。三段全部读**这一条记录自己**的字段
   * （`model` / `duration` / `height`），一个都不猜：分辨率印的是实到的高度，
   * 不是请求里那一档（素材域记过「库里 width/height 是请求值不是实到值」，所以
   * 这里只在真有值时印）。
   */
  const videoBadgeParts = [
    generation.model
      ? getTranslatedModelLabel(tModels, generation.model)
      : null,
    generation.duration ? `${Math.round(generation.duration)}s` : null,
    // 「p」说的是短边：竖屏片子的高是长边。
    generation.height
      ? `${Math.min(generation.width || generation.height, generation.height)}p`
      : null,
  ].filter((part): part is string => Boolean(part))

  const videoContainer = (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-muted/10 p-2 transition-colors duration-base ease-linear',
        edgeBusy ? 'border-transparent' : 'border-border/60',
      )}
    >
      <VideoPlayer
        src={generation.url ?? ''}
        className="rounded-xl"
        fit="contain"
      />
      {videoBadgeParts.length > 0 && !showGeneratingOverlay ? (
        <span
          data-testid="studio-video-result-badge"
          // ⚠ `right-4` + `w-fit` + `truncate` 一起给：型号名可以很长，而 9:16 的
          //    播放器只有 200 出头的宽 —— 不封边它会横着捅出画面。
          className="pointer-events-none absolute inset-x-4 top-4 w-fit max-w-full truncate rounded-full bg-background/85 px-2.5 py-1 font-mono text-2xs tabular-nums text-foreground shadow-sm backdrop-blur-sm"
        >
          {videoBadgeParts.join(' · ')}
        </span>
      ) : null}

      {renderGeneratingOverlay('2xl')}
    </div>
  )

  const isAudio = generation.outputType === 'AUDIO'
  const isVideo = generation.outputType === 'VIDEO'
  const previewContent = isAudio
    ? audioContainer
    : isVideo
      ? videoContainer
      : imageContainer

  // ── Tool actions renderer ──────────────────────────────────────────
  const renderTools = (variant: 'icon' | 'grid') => (
    <>
      <CanvasToolButton
        icon={Download}
        label={t('toolDownload')}
        onClick={handleDownload}
        variant={variant}
      />
      <CanvasToolButton
        icon={Maximize2}
        label={t('toolViewOriginal')}
        onClick={() => setDetailOpen(true)}
        variant={variant}
      />
      <CanvasToolButton
        icon={Share2}
        label={t('toolShare')}
        onClick={handleShare}
        variant={variant}
      />
      {onRemix && generation && (
        <CanvasToolButton
          icon={RotateCcw}
          label={t('toolRemix')}
          onClick={() => onRemix(generation)}
          variant={variant}
        />
      )}
      {onEdit && generation && generation.outputType === 'IMAGE' && (
        <CanvasToolButton
          icon={PenTool}
          label={t('toolEdit')}
          onClick={() => onEdit(generation)}
          variant={variant}
        />
      )}
      {/* §3.0b 第 4 条「引用对象扩展到生成图」：点一下把这张图挂进助手输入区。
          ⚠ 只给 IMAGE —— 视频/音频的像素级引用要另一条能力（且 vision 借路只
          吃图），在这里放一个点了会失败的按钮比没有更糟。 */}
      {generation && generation.outputType === 'IMAGE' && generation.url ? (
        <CanvasToolButton
          icon={Bot}
          label={t('toolAskAssistant')}
          onClick={() => askAssistantAboutImage(generation.url)}
          variant={variant}
        />
      ) : null}
      {onSaveRecipe && generation && (
        <CanvasToolButton
          icon={BookmarkPlus}
          label={t('toolSaveRecipe')}
          onClick={() => onSaveRecipe(generation)}
          variant={variant}
        />
      )}
      {canUseAsReference && (
        <CanvasToolButton
          icon={ImagePlus}
          label={t('useAsReference')}
          onClick={() => onUseAsReference?.(generation.url)}
          variant={variant}
        />
      )}
      {/* Phase 1B: Lock-seed surfaces only on image generations that
          actually have a non-random seed to copy. Hidden on
          video/audio (those modes don't share AdvancedParams.seed
          semantics) and on legacy generations missing the seed. */}
      {generation &&
      generation.outputType === 'IMAGE' &&
      lockableSeed !== null ? (
        <CanvasToolButton
          icon={Pin}
          label={t('toolLockSeed')}
          onClick={handleLockSeed}
          variant={variant}
        />
      ) : null}
    </>
  )

  // ── Mobile layout: full-width media + peek row + meta + drawer ────
  if (isMobile) {
    /**
     * 动作行的格子 —— **图上标下、等宽、永不换行**。
     *
     * ⚠ 之前是「图标 + 长文案挤一行」，「查看原图」「AI 编辑」在 375 上各折成
     * 两行，于是这一行的格子高度参差不齐。移动端用短标签（原图 / 编辑），且
     * `whitespace-nowrap` + `basis-0` 保证等宽 —— 折行不是被容忍的降级，它会让
     * 整行读起来像坏掉了。
     * ⛔ 视频没有「编辑」也没有「用作参考」（后者本来就只在抽屉里、且 IMAGE 限定）。
     */
    const peekActions = [
      {
        key: 'download',
        icon: Download,
        label: tMobile('actionDownload'),
        onClick: handleDownload,
      },
      {
        key: 'original',
        icon: Maximize2,
        label: tMobile('actionOriginal'),
        onClick: () => setDetailOpen(true),
      },
      {
        key: 'share',
        icon: Share2,
        label: tMobile('actionShare'),
        onClick: handleShare,
      },
      ...(onRemix
        ? [
            {
              key: 'remix',
              icon: RotateCcw,
              label: tMobile('actionRemix'),
              onClick: () => onRemix(generation),
            },
          ]
        : []),
      ...(onEdit && generation.outputType === 'IMAGE'
        ? [
            {
              key: 'edit',
              icon: PenTool,
              label: tMobile('actionEdit'),
              onClick: () => onEdit(generation),
            },
          ]
        : []),
      {
        key: 'more',
        icon: Sparkles,
        label: tMobile('actionMore'),
        onClick: () => setToolDrawerOpen(true),
      },
    ]

    /**
     * mono 元信息行 —— **只印这条记录上真有的字段**。
     *
     * ⛔ 「用时」与「费用」不在 `GenerationRecord` 上（前者从没落库，后者扣费在
     * 服务端的 credit policy 里），所以这里不印 —— 编一个数比不印更糟。
     */
    const metaParts = [
      lockableSeed !== null ? `seed ${lockableSeed}` : null,
      generation.width && generation.height
        ? `${generation.width}×${generation.height}`
        : null,
      generation.duration ? `${Math.round(generation.duration)}s` : null,
    ].filter((part): part is string => Boolean(part))

    return (
      <>
        <div className="space-y-2">
          {previewContent}

          {/* Peek action row — always visible */}
          {!isGenerating && (
            <>
              <div
                data-testid="studio-mobile-action-row"
                className="flex items-stretch gap-1"
              >
                {peekActions.map(({ key, icon: Icon, label, onClick }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={onClick}
                    className="flex min-h-11 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-border/40 bg-background/80 px-1 py-1.5 text-2xs whitespace-nowrap transition-colors active:scale-95"
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
              {metaParts.length > 0 ? (
                <p
                  data-testid="studio-mobile-result-meta"
                  className="truncate font-mono text-2xs tabular-nums text-muted-foreground"
                >
                  {metaParts.join(' · ')}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Tool drawer — swipe up for full tools */}
        <Drawer open={toolDrawerOpen} onOpenChange={setToolDrawerOpen}>
          <DrawerContent
            className="max-h-[70vh]"
            style={{
              maxHeight:
                'min(70vh, calc(100svh - var(--keyboard-inset, 0px) - 0.75rem))',
            }}
          >
            <DrawerHeader>
              <DrawerTitle className="text-base">
                {t('toolDrawerTitle')}
              </DrawerTitle>
            </DrawerHeader>
            <div className="grid grid-cols-4 gap-3 px-4 pb-6">
              {renderTools('grid')}
            </div>
          </DrawerContent>
        </Drawer>

        <ImageDetailModal
          generation={generation}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          showVisibility
        />
      </>
    )
  }

  // ── Desktop layout: image + right tool column ─────────────────────
  return (
    <>
      <div className={cn('flex gap-3', fillStage && 'min-h-0 flex-1')}>
        <div
          className={cn('min-w-0 flex-1', fillStage && 'flex min-h-0 flex-col')}
        >
          {previewContent}
        </div>

        {/* Right: tool buttons column */}
        <div className="shrink-0 flex flex-col gap-1.5">
          {renderTools('icon')}
        </div>
      </div>

      <ImageDetailModal
        generation={generation}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        showVisibility
      />
    </>
  )
})

// ── Canvas Tool Button ──────────────────────────────────────────────

function CanvasToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = 'icon',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  disabled?: boolean
  variant?: 'icon' | 'grid'
}) {
  if (variant === 'grid') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'flex flex-col items-center gap-1.5 rounded-xl border border-border/40 bg-background/80 px-2 py-3 transition-all',
          disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-95',
        )}
      >
        <Icon className="size-5" />
        <span className="text-2xs leading-tight">{label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group/btn relative flex size-9 items-center justify-center rounded-lg border border-border/40 bg-background/80 transition-all',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-95',
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <Icon className="size-4" />
      {/* Tooltip */}
      <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-foreground/90 px-2 py-1 text-2xs text-background opacity-0 transition-opacity group-hover/btn:opacity-100">
        {label}
      </span>
    </button>
  )
}
