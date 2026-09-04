'use client'

import { memo, useEffect, useState } from 'react'
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
} from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { downloadRemoteAsset } from '@/lib/api-client/generation'
import { getGenerationAudioSegments } from '@/lib/generation-media'
import { getGeneratingStageKey } from '@/lib/generation-progress'
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

export const GenerationPreview = memo(function GenerationPreview({
  generation,
  onUseAsReference,
  onRemix,
  onEdit,
  onSaveRecipe,
  onRetry,
}: GenerationPreviewProps) {
  const { error, isGenerating, elapsedSeconds, activeRun, cancelRunItem } =
    useStudioGen()
  const { state, dispatch } = useStudioForm()
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
  const generatingStageKey = getGeneratingStageKey(elapsedSeconds)
  const generatingStageLabel = t(
    `generatingOverlayStages.${generatingStageKey}` as const,
  )

  // 裱框显影参数行 — "{elapsed}s · {模型显示名} · {比例}"（loading-language §2.1）。
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
  // fade sequence over the freshly-revealed media (loading-language §2.3).
  // Adjust-state-during-render (not useEffect) per the "you might not need
  // an effect" pattern — reacting to a prop transition, not synchronizing
  // with an external system, so react-hooks/set-state-in-effect stays clean.
  const [completingGenerationId, setCompletingGenerationId] = useState<
    string | null
  >(null)
  const [prevIsGenerating, setPrevIsGenerating] = useState(isGenerating)
  if (isGenerating !== prevIsGenerating) {
    setPrevIsGenerating(isGenerating)
    if (prevIsGenerating && !isGenerating && generation && !error) {
      setCompletingGenerationId(generation.id)
    }
  }
  const isCompletingThisGeneration =
    completingGenerationId !== null && completingGenerationId === generation?.id
  const showGeneratingOverlay = isGenerating || isCompletingThisGeneration

  const dragRef = useStudioDraggable({
    url: generation?.url ?? undefined,
    generationId: generation?.id ?? '',
    outputType: 'IMAGE',
  })

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

  // ── Generating (no image yet) ─────────────────────────────────────
  if (isGenerating && !generation) {
    // Height-driven sizing keeps the placeholder visually proportional to the
    // requested aspect ratio without ever growing past the viewport. height is
    // explicit so `aspect-ratio` reverses to compute width — guarantees a
    // 9:16 placeholder stays a tall narrow card, not a full-canvas takeover.
    const aspectRatioValue = (() => {
      switch (state.aspectRatio) {
        case '16:9':
          return '16 / 9'
        case '9:16':
          return '9 / 16'
        case '4:3':
          return '4 / 3'
        case '3:4':
          return '3 / 4'
        default:
          return '1 / 1'
      }
    })()

    return (
      // Full-width "stage" card — mirrors the result state's framed surface so
      // the dashed border fills the column. The inner art box is height-driven
      // (height comes from the stage), so its width follows the aspect ratio and
      // is centered: square/portrait previews sit in intentional side matting
      // instead of bare workbench, while `maxWidth: 100%` letterboxes wide
      // ratios into the stage rather than overflowing the column.
      <div
        className="mx-auto flex w-full max-w-7xl items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border/60 bg-muted/10 2xl:max-w-[88rem]"
        style={{ height: isMobile ? 'min(45vh, 360px)' : 'min(72vh, 760px)' }}
        aria-live="polite"
      >
        <div
          className="studio-reveal-canvas relative h-full overflow-hidden rounded-xl"
          style={{ aspectRatio: aspectRatioValue, maxWidth: '100%' }}
        >
          <div className="studio-reveal-shimmer absolute inset-0" />
          <StudioGeneratingProgress
            elapsedSeconds={elapsedSeconds}
            stageLabel={generatingStageLabel}
            paramsLine={generatingParamsLine}
            variant="full"
            cornerRadiusVar="--radius-xl"
          />
          {activeRun?.mode === 'single' && activeRun.items[0] && (
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

  // ── Error only (no generation) ────────────────────────────────────
  if (!generation) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-foreground">
          {t('previewErrorTitle')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 rounded-full"
            onClick={onRetry}
          >
            <RotateCcw className="size-3.5" />
            {t('retry')}
          </Button>
        )}
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

  // ── Shared image container ────────────────────────────────────────
  const imageContainer = (
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
        className="group relative mx-auto w-full max-w-7xl overflow-hidden rounded-2xl border border-dashed border-border/60 bg-muted/10 2xl:max-w-[88rem]"
      >
        <TransformComponent
          wrapperClass="!w-full"
          contentClass="!w-full flex items-center justify-center"
        >
          {/* Bare <img> — the gallery ImageCard wraps the image in a card with
              date, prompt, metadata footer. Inside Studio the prompt already
              lives in the input below, so the footer is redundant noise AND
              its layout pushes the image past max-h, cropping it.
              `object-contain` + max-h on the img itself = always full picture. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={generation.id}
            src={generation.url}
            alt={generation.prompt ?? ''}
            draggable={false}
            className={cn(
              'studio-generation-image mx-auto block max-w-full object-contain',
              isMobile ? 'max-h-[45vh]' : 'max-h-[72vh]',
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

        {/* Regenerate overlay — dim + "裱框显影" frame described on the media edge */}
        {showGeneratingOverlay && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl">
            <div className="absolute inset-0 bg-background/35 backdrop-blur-[1px]" />
            <StudioGeneratingProgress
              elapsedSeconds={elapsedSeconds}
              stageLabel={generatingStageLabel}
              variant="compact"
              cornerRadiusVar="--radius-2xl"
              isCompleting={isCompletingThisGeneration}
              onCompleteAnimationDone={() => setCompletingGenerationId(null)}
            />
          </div>
        )}
      </div>
    </TransformWrapper>
  )

  // ── Audio container ───────────────────────────────────────────────
  const audioContainer = (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border/60 bg-muted/10">
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

      {showGeneratingOverlay && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-background/35 backdrop-blur-[1px]" />
          <StudioGeneratingProgress
            elapsedSeconds={elapsedSeconds}
            stageLabel={generatingStageLabel}
            variant="compact"
            cornerRadiusVar="--radius-2xl"
            isCompleting={isCompletingThisGeneration}
            onCompleteAnimationDone={() => setCompletingGenerationId(null)}
          />
        </div>
      )}
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
    generation.height ? `${generation.height}p` : null,
  ].filter((part): part is string => Boolean(part))

  const videoContainer = (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-muted/10 p-2">
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

      {showGeneratingOverlay && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-background/35 backdrop-blur-[1px]" />
          <StudioGeneratingProgress
            elapsedSeconds={elapsedSeconds}
            stageLabel={generatingStageLabel}
            variant="compact"
            cornerRadiusVar="--radius-2xl"
            isCompleting={isCompletingThisGeneration}
            onCompleteAnimationDone={() => setCompletingGenerationId(null)}
          />
        </div>
      )}
    </div>
  )

  const isAudio = generation.outputType === 'AUDIO'
  const isVideo = generation.outputType === 'VIDEO'
  const previewContent = isAudio
    ? audioContainer
    : isVideo
      ? videoContainer
      : imageContainer

  // ── Error section ─────────────────────────────────────────────────
  const errorSection = error ? (
    <div className="mt-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-foreground">
        {t('previewErrorTitle')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      {onRetry && !isGenerating && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 rounded-full"
          onClick={onRetry}
        >
          <RotateCcw className="size-3.5" />
          {t('retry')}
        </Button>
      )}
    </div>
  ) : null

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
          {errorSection}

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
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          {previewContent}
          {errorSection}
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
