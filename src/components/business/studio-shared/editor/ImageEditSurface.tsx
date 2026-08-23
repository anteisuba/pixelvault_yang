'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, Paintbrush, Replace, Scissors, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { ImageAnnotationEditor } from '@/components/business/studio-shared/editor/ImageAnnotationEditor'
import { StudioInpaintEditor } from '@/components/business/studio/StudioInpaintEditor'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import {
  getCanvasImageEditCapability,
  READY_CANVAS_IMAGE_EDIT_CAPABILITIES,
} from '@/constants/canvas-image-edit-capabilities'
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import type { ObjectReplaceAnnotation } from '@/types'
import type {
  CanvasDerivedImageOutput,
  ReadyCanvasImageEditCapabilityId,
} from '@/types/canvas-image-edit'

/**
 * 图片编辑的**共用躯干** —— 画布的弹窗和工作台的舞台共用这一份。
 *
 * 施工基准 `docs/references/pages/studio-image-edit.md`：owner 2026-08-18 定
 * 「工作台先做好，画布再对齐工作台」，所以能力的跑法、状态、面板、**以及布局**
 * 都只有一份，宿主之间只剩一处差别 —— **结果落哪儿**（`onApplied`）。
 *
 * ⚠ 2026-08-19 E5：这里曾经有 `layout: 'dialog' | 'stage'` 两套排布（弹窗走
 * 248px 竖 rail，舞台走顶部横标签）。那本身就是 E5 验收里要消灭的「两套实现」
 * —— 同一份能力清单渲染两遍、改一处要记得改另一处。删掉竖 rail 那套，画布弹
 * 窗跟着用横标签，顺带把 248px 还给图。
 *
 * ⛔ 本组件不认识画布节点，也不认识工作台的参考图槽位。它只知道「一张源图」
 * 和「跑完把 outputs 交出去」。
 */

type TargetScale = '2x' | '4x'

const TASK_ICONS = {
  upscale: Sparkles,
  'remove-background': Eraser,
  inpaint: Paintbrush,
  'extract-element': Scissors,
  'object-replace': Replace,
} as const satisfies Record<ReadyCanvasImageEditCapabilityId, typeof Sparkles>

const EXTRACT_PRESETS = [
  { key: 'clothing', prompt: 'clothing', invert: false },
  { key: 'person', prompt: 'person', invert: false },
  { key: 'hair', prompt: 'hair', invert: false },
  { key: 'accessory', prompt: 'accessories', invert: false },
  { key: 'background', prompt: 'person', invert: true },
] as const

/**
 * 兜底边长。只有「既没量到、字段又缺」时才会用上，等于承认自己不知道 ——
 * 一旦真走到这里，蒙版尺寸就必然和源图对不上。
 */
const UNKNOWN_SOURCE_DIMENSION = 1024

/**
 * ⚠ **量到的优先于字段**，和 `LooseImageCard` 的取值顺序**故意相反**：那边这
 * 两个数只用来显示一行 `W × H`，这里却要拿去定蒙版画布的边长。蒙版必须贴合
 * provider 真正抓到的那张位图，所以位图的实测尺寸才是事实源，元数据是备份。
 */
function resolveSourceDimension(
  measured: number | undefined,
  declared: number | undefined,
): number {
  if (measured !== undefined && measured > 0) return Math.round(measured)
  if (declared !== undefined && Number.isFinite(declared) && declared > 0)
    return Math.round(declared)
  return UNKNOWN_SOURCE_DIMENSION
}

function getDefaultModelId(
  capabilityId: ReadyCanvasImageEditCapabilityId,
): string {
  return getCanvasImageEditCapability(capabilityId).defaultModelId ?? ''
}

export interface ImageEditSurfaceProps {
  sourceUrl: string
  /** 源图对应的 generation，用于给结果记血缘。没有就是外部图。 */
  sourceGenerationId?: string
  /** 元数据里声明的尺寸。⚠ 只是备份，实测赢过它。 */
  declaredWidth?: number
  declaredHeight?: number
  defaultTask?: ReadyCanvasImageEditCapabilityId
  /**
   * 结果落哪儿由宿主决定：画布落派生节点，工作台就地替换参考图槽位。
   * 返回 `false` 表示没落成，躯干会弹失败文案并把这一轮记为失败。
   *
   * `summary` = 这一步**做了什么**的一句话（重绘的提示词 / 注释清单 / 放大倍
   * 率…）。⚠ 没有它，编辑历史就只剩一串图，用户回退时认不出「第三次」是哪次
   * —— 而 E4 的验收正是「改五次能回到第三次」。画布宿主用不上，忽略即可。
   */
  onApplied: (outputs: CanvasDerivedImageOutput[], summary: string) => boolean
  /**
   * 运行结果回传给宿主（画布要把它写到节点状态上）。
   *
   * ⚠ 必须是三态，不能只回「跑没跑」：失败也会走到「不跑了」，只传布尔会让
   * 宿主把失败标成成功。
   */
  onRunStateChange?: (state: 'running' | 'success' | 'error') => void
  /** 取消/返回。`dialog` 用它关弹窗，`stage` 用它回结果区。 */
  onCancel?: () => void
}

export function ImageEditSurface({
  sourceUrl,
  sourceGenerationId,
  declaredWidth,
  declaredHeight,
  defaultTask = 'upscale',
  onApplied,
  onRunStateChange,
  onCancel,
}: ImageEditSurfaceProps) {
  const t = useTranslations('StudioImageEdit')
  const [activeTask, setActiveTask] =
    useState<ReadyCanvasImageEditCapabilityId>(defaultTask)
  const [runningTask, setRunningTask] =
    useState<ReadyCanvasImageEditCapabilityId | null>(null)
  const [targetScale, setTargetScale] = useState<TargetScale>('4x')
  const [extractPrompt, setExtractPrompt] = useState('clothing')
  const [extractInvert, setExtractInvert] = useState(false)
  const [extractPreset, setExtractPreset] = useState<string | null>('clothing')
  const [measuredSource, setMeasuredSource] = useState<{
    width: number
    height: number
  } | null>(null)
  const runningRef = useRef(false)

  const sourceWidth = resolveSourceDimension(
    measuredSource?.width,
    declaredWidth,
  )
  const sourceHeight = resolveSourceDimension(
    measuredSource?.height,
    declaredHeight,
  )
  const isRunning = runningTask !== null

  useEffect(() => {
    setActiveTask(defaultTask)
  }, [defaultTask])

  // 量一次源图的真实边长。⚠ 不能蹭渲染出来的 <img> 的 `naturalWidth`：局部重绘
  // 面板压根不渲染 <img>，而它恰恰是最需要真尺寸的那一条 —— 蒙版按 1024×1024
  // 建、源图却是 1672×941 时，FLUX Fill 直接 500（2026-08-18 E0 实测）。
  // 跨域也没关系，读尺寸不需要 CORS。
  useEffect(() => {
    setMeasuredSource(null)
    if (!sourceUrl) return

    let cancelled = false
    const probe = new Image()
    probe.onload = () => {
      if (cancelled) return
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setMeasuredSource({
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        })
      }
    }
    probe.src = sourceUrl

    return () => {
      cancelled = true
      probe.onload = null
    }
  }, [sourceUrl])

  const runExclusive = useCallback(
    async (
      task: ReadyCanvasImageEditCapabilityId,
      fallbackMessage: string,
      operation: () => Promise<boolean>,
    ) => {
      if (runningRef.current || !sourceUrl) return

      runningRef.current = true
      setRunningTask(task)
      onRunStateChange?.('running')
      try {
        const succeeded = await operation()
        onRunStateChange?.(succeeded ? 'success' : 'error')
      } catch (error) {
        logger.error('[image-edit] task failed', { task, error })
        toast.error(fallbackMessage)
        onRunStateChange?.('error')
      } finally {
        runningRef.current = false
        setRunningTask(null)
      }
    },
    [onRunStateChange, sourceUrl],
  )

  const target = useMemo(
    () => ({ sourceUrl, sourceGenerationId, sourceWidth, sourceHeight }),
    [sourceGenerationId, sourceHeight, sourceUrl, sourceWidth],
  )

  const runCapability = useCallback(
    async (
      request: Parameters<typeof canvasCapabilityRuntime.run>[0],
      fallbackMessage: string,
      summary: string,
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
      if (!onApplied(outputs, summary)) {
        toast.error(fallbackMessage)
        return false
      }
      if (response.saveWarning) {
        toast.warning(t('extract.success'), {
          description: t('extract.saveFailed'),
        })
      }
      return true
    },
    [onApplied, t],
  )

  const runUpscale = useCallback(() => {
    void runExclusive('upscale', t('editFailed'), async () => {
      if (
        !(await runCapability(
          {
            capability: 'upscale',
            target,
            targetScale,
            modelId: getDefaultModelId('upscale'),
          },
          t('editFailed'),
          `${t('actions.upscale')} ${targetScale}`,
        ))
      )
        return false
      toast.success(t('success.upscale'))
      return true
    })
  }, [runCapability, runExclusive, t, target, targetScale])

  const runRemoveBackground = useCallback(() => {
    void runExclusive('remove-background', t('editFailed'), async () => {
      if (
        !(await runCapability(
          {
            capability: 'remove-background',
            target,
            modelId: getDefaultModelId('remove-background'),
          },
          t('editFailed'),
          t('actions.removeBg'),
        ))
      )
        return false
      toast.success(t('success.removeBg'))
      return true
    })
  }, [runCapability, runExclusive, t, target])

  const runExtractElement = useCallback(() => {
    const prompt = extractPrompt.trim()
    if (!prompt) return

    void runExclusive('extract-element', t('extractFailed'), async () => {
      const response = await canvasCapabilityRuntime.run({
        capability: 'extract-element',
        target,
        prompt,
        invert: extractInvert,
        modelId: getDefaultModelId('extract-element'),
      })
      if (!response.success || response.outputs.length === 0) {
        toast.error(response.error || t('extractFailed'))
        return false
      }
      if (!onApplied(response.outputs, prompt)) {
        toast.error(t('extractFailed'))
        return false
      }

      if (response.saveWarning) {
        logger.warn('[image-edit] extracted element save failed')
        toast.warning(t('extract.success'), {
          description: t('extract.saveFailed'),
        })
        // 落点已经成功 —— 存素材失败不算整轮失败。
        return true
      }
      toast.success(t('extract.success'))
      return true
    })
  }, [extractInvert, extractPrompt, onApplied, runExclusive, t, target])

  const applyInpaint = useCallback(
    (maskDataUrl: string, prompt: string) => {
      void runExclusive('inpaint', t('editFailed'), async () => {
        if (
          !(await runCapability(
            {
              capability: 'inpaint',
              target,
              maskImageUrl: maskDataUrl,
              prompt,
              modelId: getDefaultModelId('inpaint'),
            },
            t('editFailed'),
            prompt,
          ))
        )
          return false
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [runCapability, runExclusive, t, target],
  )

  const applyAnnotations = useCallback(
    (annotations: ObjectReplaceAnnotation[]) => {
      void runExclusive('object-replace', t('editFailed'), async () => {
        if (
          !(await runCapability(
            {
              capability: 'object-replace',
              target,
              annotations,
              modelId: getDefaultModelId('object-replace'),
            },
            t('editFailed'),
            annotations.map((item) => item.instruction).join(' · '),
          ))
        )
          return false
        toast.success(t('savedToGallery'))
        return true
      })
    },
    [runCapability, runExclusive, t, target],
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
                <Spinner size="md" />
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
              <Spinner size="md" />
            ) : (
              <Eraser className="size-4" />
            )}
            {t('actions.removeBg')}
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
                <Spinner size="md" />
              ) : (
                <Scissors className="size-4" />
              )}
              {t('extract.run')}
            </Button>
          </div>
        )
      case 'object-replace':
        return (
          <ImageAnnotationEditor
            // ⚠ 换图即重挂，清掉上一张的注释 —— 见组件头部注释。
            key={sourceUrl}
            imageUrl={sourceUrl}
            onApply={applyAnnotations}
            onCancel={onCancel ?? (() => undefined)}
            isLoading={runningTask === 'object-replace'}
          />
        )
      case 'inpaint':
        return (
          <StudioInpaintEditor
            imageUrl={sourceUrl}
            imageWidth={sourceWidth}
            imageHeight={sourceHeight}
            onApply={applyInpaint}
            onCancel={onCancel ?? (() => undefined)}
            isLoading={runningTask === 'inpaint'}
          />
        )
    }
  }

  const sourceFigure = (
    <figure className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-node-panel-inner bg-node-panel-soft">
      {sourceUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sourceUrl}
          alt={t('sourceAlt')}
          className="min-h-0 w-full flex-1 object-contain"
        />
      ) : (
        <div className="flex min-h-48 flex-1 items-center justify-center px-4 text-center text-xs text-node-muted">
          {t('emptySourceTitle')}
        </div>
      )}
      <figcaption className="flex shrink-0 items-center justify-between gap-3 border-t border-node-panel-inner px-3 py-2">
        <span className="truncate text-xs font-medium text-node-foreground">
          {t('sourceTitle')}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-node-muted">
          {sourceWidth} × {sourceHeight}
        </span>
      </figcaption>
    </figure>
  )

  // 涂抹编辑器自带画布 + 控件两栏，占满即可；其余三条（一键出结果 / 描述式）
  // 自己没有舞台，就在这儿补一个：大图在左，控件收进右侧一栏 —— 和涂抹编辑器
  // 同一个形，不是两套。
  const taskBody =
    activeTask === 'inpaint' || activeTask === 'object-replace' ? (
      renderTaskControls()
    ) : (
      <div className="studio-edit-body grid min-h-0 flex-1 gap-5">
        {sourceFigure}
        <div className="min-w-0 overflow-y-auto">{renderTaskControls()}</div>
      </div>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav
        className="mb-4 flex flex-wrap gap-1.5 border-b border-border/60 pb-3"
        aria-label={t('toolsTitle')}
      >
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
                'flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-colors',
                selected
                  ? 'border-foreground/20 bg-foreground text-background'
                  : 'border-border/70 text-muted-foreground hover:text-foreground',
                isRunning && 'cursor-not-allowed opacity-60',
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              {t(`tasks.${capability.id}.label`)}
            </button>
          )
        })}
      </nav>
      {taskBody}
    </div>
  )
}
