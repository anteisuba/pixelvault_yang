'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Eraser,
  Expand,
  Layers3,
  Loader2,
  Paintbrush,
  Scissors,
  Sparkles,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { StudioInpaintEditor } from '@/components/business/studio/StudioInpaintEditor'
import { StudioOutpaintEditor } from '@/components/business/studio/StudioOutpaintEditor'
import { Button } from '@/components/ui/button'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  getCanvasImageEditCapability,
  READY_CANVAS_IMAGE_EDIT_CAPABILITIES,
} from '@/constants/canvas-image-edit-capabilities'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import {
  createExtractedElementAPI,
  decomposeImageAPI,
  editImageAPI,
  extractElementAPI,
  inpaintImageAPI,
  outpaintImageAPI,
} from '@/lib/api-client'
import { isRemoteImageUrl } from '@/lib/image-input'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import type {
  CanvasDerivedImageOutput,
  ReadyCanvasImageEditCapabilityId,
} from '@/types/canvas-image-edit'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'
import type { OutpaintPadding } from '@/types'

import { useNodeWorkflowActions } from './NodeWorkflowActionsContext'

interface CanvasImageEditWorkspaceProps {
  nodeId: string
  data: NodeWorkflowNodeData
  defaultTask?: ReadyCanvasImageEditCapabilityId
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface SingleImageResult {
  imageUrl: string
  width?: number
  height?: number
  generationId?: string
}

type TargetScale = '2x' | '4x'

const TASK_ICONS = {
  upscale: Sparkles,
  'remove-background': Eraser,
  inpaint: Paintbrush,
  outpaint: Expand,
  decompose: Layers3,
  'extract-element': Scissors,
} as const satisfies Record<ReadyCanvasImageEditCapabilityId, typeof Sparkles>

const EXTRACT_PRESETS = [
  { key: 'clothing', prompt: 'clothing', invert: false },
  { key: 'person', prompt: 'person', invert: false },
  { key: 'hair', prompt: 'hair', invert: false },
  { key: 'accessory', prompt: 'accessories', invert: false },
  { key: 'background', prompt: 'person', invert: true },
] as const

function getSourceUrl(data: NodeWorkflowNodeData): string {
  if (typeof data.mediaUrl === 'string') return data.mediaUrl
  if (typeof data.imageUrl === 'string') return data.imageUrl
  return ''
}

function getPositiveDimension(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 1024
}

function getDefaultModelId(
  capabilityId: ReadyCanvasImageEditCapabilityId,
): string {
  return getCanvasImageEditCapability(capabilityId).defaultModelId ?? ''
}

export function CanvasImageEditWorkspace({
  nodeId,
  data,
  defaultTask = 'upscale',
  open,
  onOpenChange,
}: CanvasImageEditWorkspaceProps) {
  const t = useTranslations('StudioImageEdit')
  const tCommon = useTranslations('Common')
  const tErrors = useTranslations('Errors')
  const { placeDerivedImages, focusNode, updateNodeData } =
    useNodeWorkflowActions()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(true)
  const [activeTask, setActiveTask] =
    useState<ReadyCanvasImageEditCapabilityId>(defaultTask)
  const [runningTask, setRunningTask] =
    useState<ReadyCanvasImageEditCapabilityId | null>(null)
  const [targetScale, setTargetScale] = useState<TargetScale>('4x')
  const [extractPrompt, setExtractPrompt] = useState('clothing')
  const [extractInvert, setExtractInvert] = useState(false)
  const [extractPreset, setExtractPreset] = useState<string | null>('clothing')
  const runningRef = useRef(false)

  const dialogOpen = open ?? uncontrolledOpen
  const sourceUrl = useMemo(() => getSourceUrl(data), [data])
  const sourceGenerationId =
    typeof data.generationId === 'string'
      ? data.generationId
      : typeof data.sourceGenerationId === 'string'
        ? data.sourceGenerationId
        : undefined
  const sourceWidth = getPositiveDimension(data.mediaWidth ?? data.width)
  const sourceHeight = getPositiveDimension(data.mediaHeight ?? data.height)
  const isRunning = runningTask !== null

  useEffect(() => {
    setActiveTask(defaultTask)
  }, [defaultTask])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, open],
  )

  const runExclusive = useCallback(
    async (
      task: ReadyCanvasImageEditCapabilityId,
      fallbackMessage: string,
      operation: () => Promise<boolean>,
    ) => {
      if (runningRef.current || !sourceUrl) return

      runningRef.current = true
      setRunningTask(task)
      // C2: surface running progress on the source object (not only the dialog).
      updateNodeData(nodeId, {
        generationStatus: NODE_GENERATION_STATUS_IDS.pending,
        status: NODE_STATUS_IDS.running,
      })
      try {
        const succeeded = await operation()
        updateNodeData(nodeId, {
          generationStatus: succeeded
            ? NODE_GENERATION_STATUS_IDS.success
            : NODE_GENERATION_STATUS_IDS.error,
          status: succeeded ? NODE_STATUS_IDS.done : NODE_STATUS_IDS.failed,
        })
      } catch (error) {
        logger.error('[canvas-image-edit] task failed', { task, error })
        toast.error(fallbackMessage)
        updateNodeData(nodeId, {
          generationStatus: NODE_GENERATION_STATUS_IDS.error,
          status: NODE_STATUS_IDS.failed,
        })
      } finally {
        runningRef.current = false
        setRunningTask(null)
      }
    },
    [nodeId, sourceUrl, updateNodeData],
  )

  const placeOutputs = useCallback(
    (outputs: CanvasDerivedImageOutput[], fallbackMessage: string): boolean => {
      const derivedNodeIds = placeDerivedImages?.(nodeId, outputs) ?? []
      if (derivedNodeIds.length === 0) {
        toast.error(fallbackMessage)
        return false
      }

      focusNode?.(derivedNodeIds[0])
      return true
    },
    [focusNode, nodeId, placeDerivedImages],
  )

  const placeSingleResult = useCallback(
    (
      task: ReadyCanvasImageEditCapabilityId,
      result: SingleImageResult,
      fallbackMessage: string,
    ): boolean =>
      placeOutputs(
        [
          {
            imageUrl: result.imageUrl,
            width: result.width,
            height: result.height,
            generationId: result.generationId,
            label: t(`tasks.${task}.label`),
            editCapability: task,
          },
        ],
        fallbackMessage,
      ),
    [placeOutputs, t],
  )

  const runUpscale = useCallback(() => {
    void runExclusive('upscale', t('editFailed'), async () => {
      const response = await editImageAPI('upscale', sourceUrl, {
        generationId: sourceGenerationId,
        targetScale,
        ...(targetScale === '4x' && {
          modelId: getDefaultModelId('upscale'),
        }),
      })
      if (!response.success || !response.data) {
        toast.error(
          getGenerationErrorMessage(tErrors, response, t('editFailed')),
        )
        return false
      }

      if (
        !placeSingleResult(
          'upscale',
          {
            imageUrl: response.data.imageUrl,
            width: response.data.width,
            height: response.data.height,
            generationId: response.data.generation?.id,
          },
          t('editFailed'),
        )
      ) {
        return false
      }
      toast.success(t('success.upscale'))
      return true
    })
  }, [
    placeSingleResult,
    runExclusive,
    sourceGenerationId,
    sourceUrl,
    t,
    tErrors,
    targetScale,
  ])

  const runRemoveBackground = useCallback(() => {
    void runExclusive('remove-background', t('editFailed'), async () => {
      const response = await editImageAPI('remove-background', sourceUrl, {
        generationId: sourceGenerationId,
        modelId: getDefaultModelId('remove-background'),
      })
      if (!response.success || !response.data) {
        toast.error(
          getGenerationErrorMessage(tErrors, response, t('editFailed')),
        )
        return false
      }

      if (
        !placeSingleResult(
          'remove-background',
          {
            imageUrl: response.data.imageUrl,
            width: response.data.width,
            height: response.data.height,
            generationId: response.data.generation?.id,
          },
          t('editFailed'),
        )
      ) {
        return false
      }
      toast.success(t('success.removeBg'))
      return true
    })
  }, [
    placeSingleResult,
    runExclusive,
    sourceGenerationId,
    sourceUrl,
    t,
    tErrors,
  ])

  const runDecompose = useCallback(() => {
    void runExclusive('decompose', t('decomposeFailed'), async () => {
      const response = await decomposeImageAPI(sourceUrl, {
        modelId: getDefaultModelId('decompose'),
        ...(sourceGenerationId && {
          persist: true,
          generationId: sourceGenerationId,
        }),
      })
      if (!response.success || !response.data) {
        toast.error(
          getGenerationErrorMessage(tErrors, response, t('decomposeFailed')),
        )
        return false
      }

      const outputs = response.data.layers
        .filter((layer) => isRemoteImageUrl(layer.imageUrl))
        .map(
          (layer): CanvasDerivedImageOutput => ({
            imageUrl: layer.imageUrl,
            width: sourceWidth,
            height: sourceHeight,
            label: layer.name,
            editCapability: 'decompose',
          }),
        )

      if (outputs.length === 0) {
        toast.error(t('decomposeFailed'))
        return false
      }
      if (!placeOutputs(outputs, t('decomposeFailed'))) return false

      toast.success(t('decomposeDone', { count: outputs.length }))
      return true
    })
  }, [
    placeOutputs,
    runExclusive,
    sourceGenerationId,
    sourceHeight,
    sourceUrl,
    sourceWidth,
    t,
    tErrors,
  ])

  const runExtractElement = useCallback(() => {
    const prompt = extractPrompt.trim()
    if (!prompt) return

    void runExclusive('extract-element', t('extractFailed'), async () => {
      const modelId = getDefaultModelId('extract-element')
      const response = await extractElementAPI({
        imageUrl: sourceUrl,
        prompt,
        invert: extractInvert,
        sourceGenerationId,
        modelId,
      })
      if (!response.success || !response.data) {
        toast.error(
          getGenerationErrorMessage(tErrors, response, t('extractFailed')),
        )
        return false
      }

      if (
        !placeSingleResult(
          'extract-element',
          {
            imageUrl: response.data.imageUrl,
            width: response.data.width,
            height: response.data.height,
            generationId: response.data.generation?.id,
          },
          t('extractFailed'),
        )
      ) {
        return false
      }

      const saveResponse = await createExtractedElementAPI({
        extractedImageUrl: response.data.imageUrl,
        sourceImageUrl: sourceUrl,
        sourceGenerationId,
        prompt,
        invert: extractInvert,
        modelId,
      })

      if (!saveResponse.success || !saveResponse.data) {
        logger.warn('[canvas-image-edit] extracted element save failed', {
          error: saveResponse.error,
        })
        toast.warning(t('extract.success'), {
          description: t('extract.saveFailed'),
        })
        // Placement already succeeded — treat as overall success for canvas.
        return true
      }
      toast.success(t('extract.success'))
      return true
    })
  }, [
    extractInvert,
    extractPrompt,
    placeSingleResult,
    runExclusive,
    sourceGenerationId,
    sourceUrl,
    t,
    tErrors,
  ])

  const applyInpaint = useCallback(
    (maskDataUrl: string, prompt: string) => {
      void runExclusive('inpaint', t('editFailed'), async () => {
        const response = await inpaintImageAPI({
          imageUrl: sourceUrl,
          maskImageUrl: maskDataUrl,
          prompt,
          sourceGenerationId,
          modelId: getDefaultModelId('inpaint'),
        })
        if (!response.success || !response.data) {
          toast.error(
            getGenerationErrorMessage(tErrors, response, t('editFailed')),
          )
          return false
        }

        if (
          !placeSingleResult(
            'inpaint',
            {
              imageUrl: response.data.imageUrl,
              width: response.data.width,
              height: response.data.height,
              generationId: response.data.generation?.id,
            },
            t('editFailed'),
          )
        ) {
          return false
        }
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [
      placeSingleResult,
      runExclusive,
      sourceGenerationId,
      sourceUrl,
      t,
      tErrors,
    ],
  )

  const applyOutpaint = useCallback(
    (padding: OutpaintPadding, prompt: string) => {
      void runExclusive('outpaint', t('editFailed'), async () => {
        const response = await outpaintImageAPI({
          imageUrl: sourceUrl,
          padding,
          prompt,
          sourceGenerationId,
          modelId: getDefaultModelId('outpaint'),
        })
        if (!response.success || !response.data) {
          toast.error(
            getGenerationErrorMessage(tErrors, response, t('editFailed')),
          )
          return false
        }

        if (
          !placeSingleResult(
            'outpaint',
            {
              imageUrl: response.data.imageUrl,
              width: response.data.width,
              height: response.data.height,
              generationId: response.data.generation?.id,
            },
            t('editFailed'),
          )
        ) {
          return false
        }
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [
      placeSingleResult,
      runExclusive,
      sourceGenerationId,
      sourceUrl,
      t,
      tErrors,
    ],
  )

  const renderTaskControls = () => {
    if (!sourceUrl) {
      return (
        <p className="text-sm text-muted-foreground">{t('emptySourceTitle')}</p>
      )
    }

    switch (activeTask) {
      case 'upscale':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('upscale.scaleLabel')}
              </p>
              <div
                className="inline-flex rounded-lg border border-border/70 bg-muted/30 p-0.5"
                role="group"
                aria-label={t('upscale.scaleLabel')}
              >
                {(['2x', '4x'] as const).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    disabled={isRunning}
                    aria-pressed={targetScale === scale}
                    onClick={() => setTargetScale(scale)}
                    className={cn(
                      'min-h-8 rounded-md px-3 text-xs font-medium transition-colors',
                      targetScale === scale
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`upscale.scale${scale}`)}
                  </button>
                ))}
              </div>
            </div>
            <Button type="button" disabled={isRunning} onClick={runUpscale}>
              {runningTask === 'upscale' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {t('actions.upscale')}
            </Button>
          </div>
        )
      case 'remove-background':
        return (
          <Button
            type="button"
            disabled={isRunning}
            onClick={runRemoveBackground}
          >
            {runningTask === 'remove-background' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Eraser className="size-4" />
            )}
            {t('actions.removeBg')}
          </Button>
        )
      case 'decompose':
        return (
          <Button type="button" disabled={isRunning} onClick={runDecompose}>
            {runningTask === 'decompose' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Layers3 className="size-4" />
            )}
            {t('actions.decompose')}
          </Button>
        )
      case 'extract-element':
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {EXTRACT_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  disabled={isRunning}
                  aria-pressed={extractPreset === preset.key}
                  onClick={() => {
                    setExtractPrompt(preset.prompt)
                    setExtractInvert(preset.invert)
                    setExtractPreset(preset.key)
                  }}
                  className={cn(
                    'min-h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                    extractPreset === preset.key
                      ? 'border-foreground/20 bg-foreground text-background'
                      : 'border-border/70 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`extract.presets.${preset.key}`)}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="canvas-extract-prompt"
                className="text-xs font-medium text-muted-foreground"
              >
                {t('extract.promptLabel')}
              </label>
              <Textarea
                id="canvas-extract-prompt"
                value={extractPrompt}
                disabled={isRunning}
                placeholder={t('extract.promptPlaceholder')}
                className="min-h-24 resize-none"
                onChange={(event) => {
                  setExtractPrompt(event.target.value)
                  setExtractPreset(null)
                }}
              />
              <p className="text-xs text-muted-foreground/80">
                {t('extract.promptHint')}
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={extractInvert}
                disabled={isRunning}
                onChange={(event) => {
                  setExtractInvert(event.target.checked)
                  setExtractPreset(null)
                }}
                className="size-4 rounded border-border"
              />
              {t('extract.invertLabel')}
            </label>
            <Button
              type="button"
              disabled={isRunning || !extractPrompt.trim()}
              onClick={runExtractElement}
            >
              {runningTask === 'extract-element' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Scissors className="size-4" />
              )}
              {t('extract.run')}
            </Button>
          </div>
        )
      case 'inpaint':
        return (
          <StudioInpaintEditor
            imageUrl={sourceUrl}
            imageWidth={sourceWidth}
            imageHeight={sourceHeight}
            onApply={applyInpaint}
            onCancel={() => handleOpenChange(false)}
            isLoading={runningTask === 'inpaint'}
          />
        )
      case 'outpaint':
        return (
          <StudioOutpaintEditor
            imageUrl={sourceUrl}
            imageWidth={sourceWidth}
            imageHeight={sourceHeight}
            onApply={applyOutpaint}
            onCancel={() => handleOpenChange(false)}
            isLoading={runningTask === 'outpaint'}
          />
        )
    }
  }

  return (
    <ResponsiveDialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent
        closeLabel={tCommon('close')}
        className="dark h-[min(760px,calc(100svh-2rem))] w-[min(1120px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden border-node-panel-inner bg-node-panel p-0 text-node-foreground shadow-node-panel"
        mobileBodyClassName="px-0 pt-0"
      >
        <ResponsiveDialogHeader className="min-h-11 justify-center border-b border-node-panel-inner px-4 py-2.5 text-left">
          <ResponsiveDialogTitle className="text-sm font-semibold text-node-foreground">
            {t('title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t(`tasks.${activeTask}.description`)}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[248px_minmax(0,1fr)] md:overflow-hidden">
          <aside className="border-b border-node-panel-inner bg-node-panel-soft/40 p-3 md:overflow-y-auto md:border-r md:border-b-0">
            <div className="overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel-soft">
              {sourceUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sourceUrl}
                  alt={t('sourceAlt')}
                  className="aspect-[4/3] size-full object-contain"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center px-4 text-center text-xs text-node-muted">
                  {t('emptySourceTitle')}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-node-panel-inner px-3 py-2">
                <span className="truncate text-xs font-medium text-node-foreground">
                  {t('sourceTitle')}
                </span>
                <span className="shrink-0 text-2xs tabular-nums text-node-muted">
                  {sourceWidth} × {sourceHeight}
                </span>
              </div>
            </div>

            <nav className="mt-3 space-y-1" aria-label={t('toolsTitle')}>
              {READY_CANVAS_IMAGE_EDIT_CAPABILITIES.map((capability) => {
                const Icon = TASK_ICONS[capability.id]
                const selected = activeTask === capability.id
                return (
                  <button
                    key={capability.id}
                    type="button"
                    disabled={isRunning}
                    aria-pressed={selected}
                    onClick={() => setActiveTask(capability.id)}
                    className={cn(
                      'flex min-h-11 w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors md:min-h-9',
                      selected
                        ? 'bg-node-panel-inner text-node-foreground'
                        : 'text-node-muted hover:bg-node-panel-inner/70 hover:text-node-foreground',
                      isRunning && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">
                        {t(`tasks.${capability.id}.label`)}
                      </span>
                      <span className="mt-0.5 hidden text-2xs leading-4 text-node-muted md:block">
                        {t(`tasks.${capability.id}.description`)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>
          </aside>

          <main className="min-w-0 overflow-y-auto p-4 sm:p-5">
            <div className="mb-5 border-b border-node-panel-inner pb-4">
              <h2 className="text-sm font-semibold text-node-foreground">
                {t(`tasks.${activeTask}.label`)}
              </h2>
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {t(`tasks.${activeTask}.description`)}
              </p>
            </div>
            {renderTaskControls()}
          </main>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
