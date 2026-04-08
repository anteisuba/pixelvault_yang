'use client'

import { memo, useCallback, useState } from 'react'
import {
  Download,
  Eraser,
  GripHorizontal,
  ImagePlus,
  Layers,
  Maximize2,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from 'react-zoom-pan-pinch'

import { useStudioGen, useStudioForm } from '@/contexts/studio-context'
import { ImageCard } from '@/components/business/ImageCard'
import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

interface GenerationPreviewProps {
  generation: GenerationRecord | null
  isLatestResult?: boolean
  onUseAsReference?: (url: string) => void
  onRemix?: (generation: GenerationRecord) => void
  onRetry?: () => void
}

export const GenerationPreview = memo(function GenerationPreview({
  generation,
  isLatestResult = false,
  onUseAsReference,
  onRemix,
  onRetry,
}: GenerationPreviewProps) {
  const { error, isGenerating, elapsedSeconds } = useStudioGen()
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioV3')
  const [detailOpen, setDetailOpen] = useState(false)

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!generation?.url) return
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(
        'application/x-studio-ref',
        JSON.stringify({ url: generation.url, id: generation.id }),
      )
      e.dataTransfer.setData('text/uri-list', generation.url)
    },
    [generation],
  )

  // ── Empty state ───────────────────────────────────────────────────
  if (!generation && !isGenerating && !error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 py-16 sm:py-24">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <ImagePlus className="size-6 text-primary/60" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">
          {t('emptyStateTitle')}
        </p>
        <p className="mt-1 font-serif text-sm leading-6 text-muted-foreground">
          {t('emptyStateHint')}
        </p>
      </div>
    )
  }

  // ── Generating (no image yet) ─────────────────────────────────────
  if (isGenerating && !generation) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10">
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="relative">
            <div className="size-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground font-serif animate-pulse">
            {t('generating')}
          </p>
          {elapsedSeconds > 0 && (
            <p className="text-xs text-muted-foreground font-serif">
              {t('elapsed', { seconds: formatDuration(elapsedSeconds) })}
            </p>
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

  const handleDownload = () => {
    if (!generation.url) return
    const a = document.createElement('a')
    a.href = generation.url
    a.download = `pixelvault-${generation.id}.png`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.click()
  }

  const handleShare = async () => {
    if (!generation.url) return
    try {
      await navigator.clipboard.writeText(generation.url)
    } catch {
      // Fallback: ignore
    }
  }

  const handleOpenLayers = () => {
    dispatch({ type: 'OPEN_PANEL', payload: 'layerDecompose' })
  }

  return (
    <>
      <div className="flex gap-3">
        {/* Left: image in dashed border container */}
        <div className="flex-1 min-w-0">
          <TransformWrapper
            minScale={1}
            maxScale={5}
            doubleClick={{ mode: 'toggle', step: 2 }}
            wheel={{ step: 0.1 }}
            panning={{ velocityDisabled: true }}
            disabled={isGenerating}
          >
            <div
              className="group relative rounded-2xl border border-dashed border-border/60 bg-muted/10 overflow-hidden"
              draggable={generation.outputType === 'IMAGE'}
              onDragStart={handleDragStart}
            >
              <TransformComponent
                wrapperClass="!w-full"
                contentClass="!w-full flex items-center justify-center"
              >
                <div className="max-h-[60vh] w-auto mx-auto [&_img]:object-contain">
                  <ImageCard generation={generation} />
                </div>
              </TransformComponent>

              {/* Zoom controls — top right */}
              {!isGenerating && (
                <ZoomControls onDetailOpen={() => setDetailOpen(true)} />
              )}

              {/* Drag hint */}
              {!isGenerating && generation.outputType === 'IMAGE' && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <span className="flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-2xs text-muted-foreground backdrop-blur-sm">
                    <GripHorizontal className="size-3" />
                    {t('dragHint')}
                  </span>
                </div>
              )}

              {/* Generating overlay */}
              {isGenerating && (
                <div className="pointer-events-none absolute inset-x-3 top-3 rounded-full bg-background/90 px-3 py-2 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-foreground">
                      {t('generating')}
                    </p>
                    {elapsedSeconds > 0 && (
                      <p className="text-2xs text-muted-foreground">
                        {t('elapsed', {
                          seconds: formatDuration(elapsedSeconds),
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TransformWrapper>

          {/* Error below image */}
          {error && (
            <div className="mt-2 rounded-2xl border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-foreground">
                {t('previewErrorTitle')}
              </p>
              <p className="mt-1 font-serif text-xs text-muted-foreground">
                {error}
              </p>
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
          )}
        </div>

        {/* Right: tool buttons column */}
        <div className="shrink-0 flex flex-col gap-1.5">
          <CanvasToolButton
            icon={Download}
            label={t('toolDownload')}
            onClick={handleDownload}
          />
          <CanvasToolButton
            icon={Maximize2}
            label={t('toolViewOriginal')}
            onClick={() => setDetailOpen(true)}
          />
          <CanvasToolButton
            icon={Share2}
            label={t('toolShare')}
            onClick={handleShare}
          />
          {canUseAsReference && (
            <CanvasToolButton
              icon={ImagePlus}
              label={t('useAsReference')}
              onClick={() => onUseAsReference?.(generation.url)}
            />
          )}
          <div className="my-1 h-px bg-border/40" />
          <CanvasToolButton icon={Wand2} label={t('toolSuperRes')} disabled />
          <CanvasToolButton icon={Eraser} label={t('toolRemoveBg')} disabled />
          <CanvasToolButton
            icon={Save}
            label={t('toolSaveSuperRes')}
            disabled
          />
          <CanvasToolButton
            icon={Layers}
            label={t('toolLayers')}
            onClick={handleOpenLayers}
          />
        </div>
      </div>

      {/* Detail modal */}
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
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
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

// ── Zoom Controls (uses react-zoom-pan-pinch context) ─────────────

function ZoomControls({ onDetailOpen }: { onDetailOpen: () => void }) {
  const { zoomIn, zoomOut, resetTransform } = useControls()

  return (
    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
      <button
        type="button"
        onClick={() => zoomIn(0.5)}
        className="flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
        aria-label="Zoom in"
      >
        <ZoomIn className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => zoomOut(0.5)}
        className="flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
        aria-label="Zoom out"
      >
        <ZoomOut className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => resetTransform()}
        className="flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
        aria-label="Reset zoom"
      >
        <Maximize2 className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onDetailOpen}
        className="flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
        aria-label="Open detail"
      >
        <Sparkles className="size-3.5" />
      </button>
    </div>
  )
}
