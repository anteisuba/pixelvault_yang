'use client'

import { memo, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const ReverseEngineerPanel = dynamic(() =>
  import('@/components/business/ReverseEngineerPanel').then(
    (mod) => mod.ReverseEngineerPanel,
  ),
)
const ReferenceImageSection = dynamic(() =>
  import('@/components/ui/reference-image-section').then(
    (mod) => mod.ReferenceImageSection,
  ),
)
const StudioTransformPanel = dynamic(() =>
  import('@/components/business/studio/StudioTransformPanel').then(
    (mod) => mod.StudioTransformPanel,
  ),
)
const LayerDecomposePanel = dynamic(() =>
  import('@/components/business/LayerDecomposePanel').then(
    (mod) => mod.LayerDecomposePanel,
  ),
)
const StudioScriptPanel = dynamic(() =>
  import('@/components/business/studio/StudioScriptPanel').then(
    (mod) => mod.StudioScriptPanel,
  ),
)
const StudioKeepChangePanel = dynamic(() =>
  import('@/components/business/studio/StudioKeepChangePanel').then(
    (mod) => mod.StudioKeepChangePanel,
  ),
)

/**
 * StudioPanelSheets — renders 3 large panels as right-side Sheet overlays.
 * Uses Radix Portal, zero layout impact on the dock.
 *
 * Panels: Reference Image, Reverse Engineer, Layer Decompose
 */
export const StudioPanelSheets = memo(function StudioPanelSheets() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, styles } = useStudioData()
  const t = useTranslations('StudioV2')
  const tPanels = useTranslations('StudioPanels')

  const { selectedModel } = useImageModelOptions()

  const selectedStyleCard = styles.activeCard
  const adapterType =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.adapterType
      : ((selectedStyleCard?.adapterType as AI_ADAPTER_TYPES) ??
        AI_ADAPTER_TYPES.FAL)
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)
  const maxRefImages = getMaxReferenceImages(adapterType, modelId)

  // Sync max limit to the image upload hook
  useEffect(() => {
    imageUpload.setMaxImages(maxRefImages)
  }, [maxRefImages, imageUpload])

  const closePanel = useCallback(
    (
      panel:
        | 'refImage'
        | 'reverse'
        | 'layerDecompose'
        | 'transform'
        | 'script'
        | 'keepChange',
    ) => {
      dispatch({ type: 'CLOSE_PANEL', payload: panel })
    },
    [dispatch],
  )

  return (
    <>
      {/* ── Reference Image Sheet ─────────────────────────────── */}
      <Sheet
        open={state.panels.refImage}
        onOpenChange={(open) => {
          if (!open) closePanel('refImage')
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:w-[380px] sm:max-w-[420px] flex flex-col"
        >
          <SheetHeader>
            <SheetTitle className="font-display">
              {tPanels('reference')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ReferenceImageSection
              referenceImages={imageUpload.referenceImages}
              maxImages={maxRefImages}
              isDragging={imageUpload.isDragging}
              fileInputRef={imageUpload.fileInputRef}
              onDrop={imageUpload.handleDrop}
              onDragOver={imageUpload.handleDragOver}
              onDragLeave={imageUpload.handleDragLeave}
              onOpenFilePicker={imageUpload.openFilePicker}
              onInputChange={imageUpload.handleInputChange}
              onRemoveImage={imageUpload.removeReferenceImage}
              onClearAll={imageUpload.clearAllImages}
              previewAlt={t('referenceImage')}
              removeLabel={t('cancel')}
              uploadLabel={t('referenceImage')}
              formatsLabel="JPG · PNG · WEBP"
              counterLabel={`${imageUpload.referenceImages.length} / ${maxRefImages}`}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Reverse Engineer Sheet ─────────────────────────────── */}
      <Sheet
        open={state.panels.reverse}
        onOpenChange={(open) => {
          if (!open) closePanel('reverse')
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] sm:max-w-[480px] flex flex-col"
        >
          <SheetHeader>
            <SheetTitle className="font-display">
              {tPanels('reverse')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ReverseEngineerPanel
              onUsePrompt={(prompt) => {
                dispatch({ type: 'SET_PROMPT', payload: prompt })
                closePanel('reverse')
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Layer Decompose Sheet ──────────────────────────────── */}
      <Sheet
        open={state.panels.layerDecompose}
        onOpenChange={(open) => {
          if (!open) closePanel('layerDecompose')
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:w-[420px] sm:max-w-[480px] flex flex-col"
        >
          <SheetHeader>
            <SheetTitle className="font-display">
              {tPanels('layers')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <LayerDecomposePanel onAddAsReference={imageUpload.addFromUrl} />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Video Script Sheet ───────────────────────────────────── */}
      <Sheet
        open={state.panels.script}
        onOpenChange={(open) => {
          if (!open) closePanel('script')
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col sm:w-[440px] sm:max-w-[480px]"
        >
          <SheetHeader>
            <SheetTitle className="font-display">
              {tPanels('script')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <StudioScriptPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Transform Sheet ──────────────────────────────────────── */}
      <Sheet
        open={state.panels.transform}
        onOpenChange={(open) => {
          if (!open) closePanel('transform')
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:w-[380px] sm:max-w-[420px] flex flex-col"
        >
          <SheetHeader>
            <SheetTitle className="font-display">
              {tPanels('transform')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <StudioTransformPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Keep & Change Sheet ──────────────────────────────────── */}
      <Sheet
        open={state.panels.keepChange}
        onOpenChange={(open) => {
          if (!open) closePanel('keepChange')
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[70vh] flex flex-col"
        >
          <SheetHeader>
            <SheetTitle className="font-display">
              {tPanels('keepChange')}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <StudioKeepChangePanel />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
})
