'use client'

import { memo, useState } from 'react'
import {
  Download,
  GripHorizontal,
  ImagePlus,
  Maximize2,
  PenTool,
  Pin,
  RotateCcw,
  Share2,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'

import { useStudioGen, useStudioForm } from '@/contexts/studio-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { AudioPlayer } from '@/components/ui/audio-player'
import VideoPlayer from '@/components/business/VideoPlayer'
import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import { XiaoheiGuideCarousel } from '@/components/business/studio-shared/XiaoheiGuideCarousel'
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
import type { GenerationRecord } from '@/types'
import { useStudioDraggable } from '@/hooks/use-studio-draggable'
import { formatDuration } from '@/lib/video-utils'

interface GenerationPreviewProps {
  generation: GenerationRecord | null
  isLatestResult?: boolean
  onUseAsReference?: (url: string) => void
  onRemix?: (generation: GenerationRecord) => void
  onEdit?: (generation: GenerationRecord) => void
  onRetry?: () => void
}

type GeneratingStageKey = 'preparing' | 'connecting' | 'rendering' | 'waiting'

function getGeneratingStageKey(elapsedSeconds: number): GeneratingStageKey {
  if (elapsedSeconds < 2) return 'preparing'
  if (elapsedSeconds < 8) return 'connecting'
  if (elapsedSeconds < 45) return 'rendering'
  return 'waiting'
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
  onRetry,
}: GenerationPreviewProps) {
  const { error, isGenerating, elapsedSeconds } = useStudioGen()
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV3')
  const isMobile = useIsMobile()
  const [detailOpen, setDetailOpen] = useState(false)
  const [toolDrawerOpen, setToolDrawerOpen] = useState(false)
  const generatingStageKey = getGeneratingStageKey(elapsedSeconds)
  const generatingStageLabel = t(
    `generatingOverlayStages.${generatingStageKey}` as const,
  )
  const elapsedLabel =
    elapsedSeconds > 0
      ? t('elapsed', {
          seconds: formatDuration(elapsedSeconds),
        })
      : undefined

  const dragRef = useStudioDraggable({
    url: generation?.url ?? undefined,
    generationId: generation?.id ?? '',
    outputType: 'IMAGE',
  })

  // ── Empty state ───────────────────────────────────────────────────
  if (!generation && !isGenerating && !error) {
    if (state.outputType === 'video' || state.outputType === 'audio') {
      return (
        <div className="flex flex-col items-center justify-center px-3 py-4 sm:px-6 sm:py-8">
          <XiaoheiGuideCarousel
            key={state.outputType}
            guideId={state.outputType}
          />
        </div>
      )
    }

    const SUGGESTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const
    // Suggestion pills are image-prompt phrases; only meaningful in image mode.
    // Video and audio modes have their own input semantics (motion, TTS text).
    const showSuggestions = state.outputType === 'image'
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
        {showSuggestions && (
          <div className="mt-4 flex w-full max-w-full justify-start gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mt-6 sm:flex-wrap sm:justify-center sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            {SUGGESTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'SET_PROMPT',
                    payload: t(`suggestion.${key}`),
                  })
                }
                className="shrink-0 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {t(`suggestion.${key}`)}
              </button>
            ))}
          </div>
        )}
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
      <div
        className="mx-auto overflow-hidden rounded-2xl border border-dashed border-border/60 bg-muted/10"
        style={{
          aspectRatio: aspectRatioValue,
          height: isMobile ? 'min(45vh, 360px)' : 'min(55vh, 520px)',
          maxWidth: '100%',
        }}
        aria-live="polite"
      >
        <div className="studio-reveal-canvas relative h-full w-full overflow-hidden">
          <div className="studio-reveal-shimmer absolute inset-0" />
          <GenerationStatusChrome
            stageLabel={generatingStageLabel}
            elapsedLabel={elapsedLabel}
          />
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
        <p className="mt-1 font-serif text-sm text-muted-foreground">{error}</p>
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
        className="group relative rounded-2xl border border-dashed border-border/60 bg-muted/10 overflow-hidden"
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
          <img
            key={generation.id}
            src={generation.url}
            alt={generation.prompt ?? ''}
            draggable={false}
            className={cn(
              'studio-generation-image mx-auto block max-w-full object-contain',
              isMobile ? 'max-h-[45vh]' : 'max-h-[60vh]',
            )}
          />
        </TransformComponent>

        {/* Drag hint — desktop only */}
        {!isMobile && !isGenerating && generation.outputType === 'IMAGE' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-2xs text-muted-foreground backdrop-blur-sm">
              <GripHorizontal className="size-3" />
              {t('dragHint')}
            </span>
          </div>
        )}

        {/* Generating overlay */}
        {isGenerating && (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <div className="absolute inset-0 bg-background/35 backdrop-blur-[1px]" />
            <div className="studio-generation-scan absolute inset-0" />
            <GenerationStatusChrome
              stageLabel={generatingStageLabel}
              elapsedLabel={elapsedLabel}
            />
          </div>
        )}
      </div>
    </TransformWrapper>
  )

  // ── Audio container ───────────────────────────────────────────────
  const audioContainer = (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 py-12 sm:py-16">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Download className="size-7 text-primary/60" />
      </div>
      <div className="w-full max-w-md px-6">
        <AudioPlayer src={generation.url} segments={audioSegments} />
      </div>
      {generation.duration && (
        <p className="font-serif text-xs text-muted-foreground">
          {formatDuration(generation.duration)}
        </p>
      )}
    </div>
  )

  // ── Video container ───────────────────────────────────────────────
  const videoContainer = (
    <div className="rounded-2xl border border-border/60 bg-muted/10 p-2">
      <VideoPlayer src={generation.url ?? ''} className="rounded-xl" />
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
      <p className="mt-1 font-serif text-xs text-muted-foreground">{error}</p>
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

  // ── Mobile layout: full-width image + peek row + drawer ───────────
  if (isMobile) {
    return (
      <>
        <div className="space-y-2">
          {previewContent}
          {errorSection}

          {/* Peek action row — always visible */}
          {!isGenerating && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDownload}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/80 py-2 text-xs transition-colors active:scale-95"
              >
                <Download className="size-3.5" />
                {t('toolDownload')}
              </button>
              <button
                type="button"
                onClick={() => setDetailOpen(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/80 py-2 text-xs transition-colors active:scale-95"
              >
                <Maximize2 className="size-3.5" />
                {t('toolViewOriginal')}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/80 py-2 text-xs transition-colors active:scale-95"
              >
                <Share2 className="size-3.5" />
                {t('toolShare')}
              </button>
              {onRemix && generation && (
                <button
                  type="button"
                  onClick={() => onRemix(generation)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/80 py-2 text-xs transition-colors active:scale-95"
                >
                  <RotateCcw className="size-3.5" />
                  {t('toolRemix')}
                </button>
              )}
              {onEdit && generation && generation.outputType === 'IMAGE' && (
                <button
                  type="button"
                  onClick={() => onEdit(generation)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/80 py-2 text-xs transition-colors active:scale-95"
                >
                  <PenTool className="size-3.5" />
                  {t('toolEdit')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setToolDrawerOpen(true)}
                className="flex items-center justify-center rounded-lg border border-border/40 bg-background/80 px-2.5 py-2 text-xs transition-colors active:scale-95"
                aria-label={t('toolMore')}
              >
                <Sparkles className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Tool drawer — swipe up for full tools */}
        <Drawer open={toolDrawerOpen} onOpenChange={setToolDrawerOpen}>
          <DrawerContent className="max-h-[70vh]">
            <DrawerHeader>
              <DrawerTitle className="font-display text-base">
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

interface GenerationStatusChromeProps {
  stageLabel: string
  elapsedLabel?: string
}

function GenerationStatusChrome({
  stageLabel,
  elapsedLabel,
}: GenerationStatusChromeProps) {
  return (
    <>
      <div
        className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-background/40"
        role="progressbar"
        aria-label={stageLabel}
      >
        <span className="studio-generation-status-line block h-full w-1/3 rounded-full bg-primary/70" />
      </div>
      <div className="absolute inset-x-3 top-3 z-20 flex items-center justify-between gap-3">
        <span className="inline-flex h-7 min-w-0 items-center gap-2 rounded-full border border-border/45 bg-background/82 px-3 text-2xs font-medium text-foreground shadow-sm backdrop-blur-md">
          <span className="studio-generation-dot size-1.5 shrink-0 rounded-full bg-primary" />
          <span className="truncate">{stageLabel}</span>
        </span>
        {elapsedLabel && (
          <span className="shrink-0 rounded-full border border-border/35 bg-background/68 px-2.5 py-1 text-2xs tabular-nums text-muted-foreground backdrop-blur-md">
            {elapsedLabel}
          </span>
        )}
      </div>
    </>
  )
}
