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
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
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
  const [decomposePreview, setDecomposePreview] = useState<{
    outputs: CanvasDerivedImageOutput[]
    selected: Set<string>
  } | null>(null)
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
    setDecomposePreview(null)
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

  const runCapability = useCallback(
    async (
      request: Parameters<typeof canvasCapabilityRuntime.run>[0],
      fallbackMessage: string,
    ): Promise<boolean> => {
      const response = await canvasCapabilityRuntime.run(request)
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || fallbackMessage)
        return false
      }
      const outputs = response.outputs.map((output) => ({
        ...output,
        label: output.label ?? t(`tasks.${request.capability}.label`),
      }))
      if (!placeOutputs(outputs, fallbackMessage)) return false
      if (response.saveWarning) {
        toast.warning(t('extract.success'), {
          description: t('extract.saveFailed'),
        })
      }
      return true
    },
    [placeOutputs, t],
  )

  const runUpscale = useCallback(() => {
    void runExclusive('upscale', t('editFailed'), async () => {
      if (
        !(await runCapability(
          {
            capability: 'upscale',
            target: {
              sourceUrl,
              sourceGenerationId,
              sourceWidth,
              sourceHeight,
            },
            targetScale,
            modelId: getDefaultModelId('upscale'),
          },
          t('editFailed'),
        ))
      )
        return false
      toast.success(t('success.upscale'))
      return true
    })
  }, [
    runCapability,
    runExclusive,
    sourceGenerationId,
    sourceHeight,
    sourceUrl,
    sourceWidth,
    t,
    targetScale,
  ])

  const runRemoveBackground = useCallback(() => {
    void runExclusive('remove-background', t('editFailed'), async () => {
      if (
        !(await runCapability(
          {
            capability: 'remove-background',
            target: {
              sourceUrl,
              sourceGenerationId,
              sourceWidth,
              sourceHeight,
            },
            modelId: getDefaultModelId('remove-background'),
          },
          t('editFailed'),
        ))
      )
        return false
      toast.success(t('success.removeBg'))
      return true
    })
  }, [
    runCapability,
    runExclusive,
    sourceGenerationId,
    sourceHeight,
    sourceUrl,
    sourceWidth,
    t,
  ])

  const runDecompose = useCallback(() => {
    void runExclusive('decompose', t('decomposeFailed'), async () => {
      const response = await canvasCapabilityRuntime.run({
        capability: 'decompose',
        target: { sourceUrl, sourceGenerationId, sourceWidth, sourceHeight },
        modelId: getDefaultModelId('decompose'),
      })
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || t('decomposeFailed'))
        return false
      }
      setDecomposePreview({
        outputs: response.outputs,
        selected: new Set(response.outputs.map((output) => output.imageUrl)),
      })
      return true
    })
  }, [
    runExclusive,
    sourceGenerationId,
    sourceHeight,
    sourceUrl,
    sourceWidth,
    t,
  ])

  const runExtractElement = useCallback(() => {
    const prompt = extractPrompt.trim()
    if (!prompt) return

    void runExclusive('extract-element', t('extractFailed'), async () => {
      const modelId = getDefaultModelId('extract-element')
      const response = await canvasCapabilityRuntime.run({
        capability: 'extract-element',
        target: { sourceUrl, sourceGenerationId, sourceWidth, sourceHeight },
        prompt,
        invert: extractInvert,
        modelId,
      })
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || t('extractFailed'))
        return false
      }
      if (!placeOutputs(response.outputs, t('extractFailed'))) return false

      if (response.saveWarning) {
        logger.warn('[canvas-image-edit] extracted element save failed')
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
    placeOutputs,
    runExclusive,
    sourceGenerationId,
    sourceHeight,
    sourceUrl,
    sourceWidth,
    t,
  ])

  const placeSelectedLayers = useCallback(() => {
    if (!decomposePreview) return
    const outputs = decomposePreview.outputs.filter((output) =>
      decomposePreview.selected.has(output.imageUrl),
    )
    if (outputs.length === 0) {
      toast.error(t('decomposeFailed'))
      return
    }
    if (!placeOutputs(outputs, t('decomposeFailed'))) return
    toast.success(t('decomposeDone', { count: outputs.length }))
    setDecomposePreview(null)
  }, [decomposePreview, placeOutputs, t])

  const applyInpaint = useCallback(
    (maskDataUrl: string, prompt: string) => {
      void runExclusive('inpaint', t('editFailed'), async () => {
        if (
          !(await runCapability(
            {
              capability: 'inpaint',
              target: {
                sourceUrl,
                sourceGenerationId,
                sourceWidth,
                sourceHeight,
              },
              maskImageUrl: maskDataUrl,
              prompt,
              modelId: getDefaultModelId('inpaint'),
            },
            t('editFailed'),
          ))
        )
          return false
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [
      runCapability,
      runExclusive,
      sourceGenerationId,
      sourceHeight,
      sourceUrl,
      sourceWidth,
      t,
    ],
  )

  const applyOutpaint = useCallback(
    (padding: OutpaintPadding, prompt: string) => {
      void runExclusive('outpaint', t('editFailed'), async () => {
        if (
          !(await runCapability(
            {
              capability: 'outpaint',
              target: {
                sourceUrl,
                sourceGenerationId,
                sourceWidth,
                sourceHeight,
              },
              padding,
              prompt,
              modelId: getDefaultModelId('outpaint'),
            },
            t('editFailed'),
          ))
        )
          return false
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [
      runCapability,
      runExclusive,
      sourceGenerationId,
      sourceHeight,
      sourceUrl,
      sourceWidth,
      t,
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
        if (decomposePreview) {
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-node-foreground">
                    {t('decomposePreviewTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-node-muted">
                    {t('layerCount', {
                      count: decomposePreview.outputs.length,
                    })}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDecomposePreview((current) =>
                        current
                          ? {
                              ...current,
                              selected: new Set(
                                current.outputs.map(
                                  (output) => output.imageUrl,
                                ),
                              ),
                            }
                          : current,
                      )
                    }
                  >
                    {t('decomposeSelectAll')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDecomposePreview((current) =>
                        current ? { ...current, selected: new Set() } : current,
                      )
                    }
                  >
                    {t('decomposeClear')}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {decomposePreview.outputs.map((output) => {
                  const selected = decomposePreview.selected.has(
                    output.imageUrl,
                  )
                  return (
                    <button
                      key={output.imageUrl}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setDecomposePreview((current) => {
                          if (!current) return current
                          const next = new Set(current.selected)
                          if (next.has(output.imageUrl))
                            next.delete(output.imageUrl)
                          else next.add(output.imageUrl)
                          return { ...current, selected: next }
                        })
                      }
                      className={cn(
                        'group overflow-hidden rounded-xl border text-left transition-colors',
                        selected
                          ? 'border-node-edge bg-node-panel-inner'
                          : 'border-node-panel-inner/60 bg-node-panel-soft/40 opacity-60 hover:opacity-100',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={output.imageUrl}
                        alt={output.label ?? ''}
                        className="aspect-square w-full object-contain"
                      />
                      <span className="block truncate px-2 py-1.5 text-2xs font-medium text-node-muted">
                        {output.label ?? t('layersTitle')}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDecomposePreview(null)}
                >
                  {t('decomposeClear')}
                </Button>
                <Button
                  type="button"
                  disabled={decomposePreview.selected.size === 0}
                  onClick={placeSelectedLayers}
                >
                  <Layers3 className="size-4" />
                  {t('decomposePlace')}
                </Button>
              </div>
            </div>
          )
        }
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
