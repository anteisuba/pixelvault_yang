'use client'

import { memo, useState } from 'react'
import {
  Download,
  Eraser,
  GripHorizontal,
  ImagePlus,
  Layers,
  Maximize2,
  PenTool,
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
import { useIsMobile } from '@/hooks/use-mobile'
import { AudioPlayer } from '@/components/ui/audio-player'
import { ImageCard } from '@/components/business/ImageCard'
import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import { useStudioDraggable } from '@/hooks/use-studio-draggable'

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
  onEdit?: (generation: GenerationRecord) => void
  onRetry?: () => void
}

export const GenerationPreview = memo(function GenerationPreview({
  generation,
  isLatestResult = false,
  onUseAsReference,
  onRemix,
  onEdit,
  onRetry,
}: GenerationPreviewProps) {
  const { error, isGenerating, elapsedSeconds } = useStudioGen()
  const { dispatch } = useStudioForm()
  const t = useTranslations('StudioV3')
  const isMobile = useIsMobile()
  const [detailOpen, setDetailOpen] = useState(false)
  const [toolDrawerOpen, setToolDrawerOpen] = useState(false)

  const dragRef = useStudioDraggable({
    url: generation?.url ?? undefined,
    generationId: generation?.id ?? '',
    outputType: 'IMAGE',
  })

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
      <div
        className="rounded-2xl border border-dashed border-border/60 bg-muted/10"
        aria-live="polite"
      >
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

  const handleDownload = async () => {
    if (!generation.url) return
    try {
      const res = await fetch(generation.url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      const ext =
        generation.outputType === 'VIDEO'
          ? 'mp4'
          : generation.outputType === 'AUDIO'
            ? 'mp3'
            : 'png'
      a.download = `pixelvault-${generation.id}.${ext}`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch {
      // Fallback: open in new tab
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

  const handleOpenLayers = () => {
    dispatch({ type: 'OPEN_PANEL', payload: 'layerDecompose' })
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
          <div
            className={cn(
              'w-auto mx-auto [&_img]:object-contain',
              isMobile ? 'max-h-[45vh]' : 'max-h-[60vh]',
            )}
          >
            <ImageCard generation={generation} />
          </div>
        </TransformComponent>

        {/* Zoom controls — top right */}
        {!isGenerating && (
          <ZoomControls onDetailOpen={() => setDetailOpen(true)} />
        )}

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
  )

  // ── Audio container ───────────────────────────────────────────────
  const audioContainer = (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/60 bg-muted/10 py-12 sm:py-16">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Download className="size-7 text-primary/60" />
      </div>
      <div className="w-full max-w-md px-6">
        <AudioPlayer src={generation.url} />
      </div>
      {generation.duration && (
        <p className="font-serif text-xs text-muted-foreground">
          {formatDuration(generation.duration)} · {generation.model}
        </p>
      )}
    </div>
  )

  const isAudio = generation.outputType === 'AUDIO'
  const previewContent = isAudio ? audioContainer : imageContainer

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
      {!isAudio && variant === 'icon' && (
        <div className="my-1 h-px bg-border/40" />
      )}
      {!isAudio && (
        <CanvasToolButton
          icon={Wand2}
          label={t('toolSuperRes')}
          disabled
          variant={variant}
        />
      )}
      {!isAudio && (
        <CanvasToolButton
          icon={Eraser}
          label={t('toolRemoveBg')}
          disabled
          variant={variant}
        />
      )}
      {!isAudio && (
        <CanvasToolButton
          icon={Save}
          label={t('toolSaveSuperRes')}
          disabled
          variant={variant}
        />
      )}
      {!isAudio && (
        <CanvasToolButton
          icon={Layers}
          label={t('toolLayers')}
          onClick={handleOpenLayers}
          variant={variant}
        />
      )}
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
                aria-label="More tools"
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

// ── Zoom Controls (uses react-zoom-pan-pinch context) ─────────────

function ZoomControls({ onDetailOpen }: { onDetailOpen: () => void }) {
  const { zoomIn, zoomOut, resetTransform } = useControls()

  return (
    <div className="card-actions absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
