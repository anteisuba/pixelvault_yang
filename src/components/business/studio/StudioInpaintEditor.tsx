'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Eraser,
  Paintbrush,
  RotateCcw,
  SquareDashed,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface StudioInpaintEditorProps {
  imageUrl: string
  imageWidth: number
  imageHeight: number
  onApply: (maskDataUrl: string, prompt: string) => void
  onCancel: () => void
  isLoading?: boolean
}

interface CanvasPoint {
  x: number
  y: number
}

/**
 * 两种落笔方式，**同一块蒙版画布、同一条导出路径**（`docs/references/pages/
 * studio-image-edit.md` §5：框选与涂抹必须产出同构的 `maskDataUrl`）。
 *
 * 画笔回答「这一块不规则区域重画」，拉框回答「这个位置不好」—— 后者才是 E3
 * 多框编号的基础（涂抹出的一团 mask 编不了号）。
 */
type MaskTool = 'brush' | 'box'

interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

interface HistoryEntry {
  imageKey: string
  imageData: ImageData
}

const DEFAULT_BRUSH_SIZE = 20
const MAX_HISTORY_LENGTH = 20
const MAX_CANVAS_EDGE = 1024

function clampImageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1024
}

/**
 * Scale source dimensions so the **drawing** canvas long edge stays ≤
 * MAX_CANVAS_EDGE — a 4K source would otherwise allocate ~64 MB.
 *
 * ⚠ 这只管绘制面。导出的蒙版必须回到源图的真实像素尺寸（见
 * `exportMaskDataUrl`）—— 这里原本写着「fal.ai requires matching aspect
 * ratios」，2026-08-18 真机证伪：长宽比对上、尺寸对不上，照样 500。
 */
function fitCanvasDimensions(
  width: number,
  height: number,
): {
  width: number
  height: number
} {
  const w = clampImageSize(width)
  const h = clampImageSize(height)
  const longEdge = Math.max(w, h)
  if (longEdge <= MAX_CANVAS_EDGE) {
    return { width: Math.round(w), height: Math.round(h) }
  }
  const scale = MAX_CANVAS_EDGE / longEdge
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

export const StudioInpaintEditor = memo(function StudioInpaintEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  onApply,
  onCancel,
  isLoading = false,
}: StudioInpaintEditorProps) {
  const t = useTranslations('StudioV3.inpaintEditor')
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<CanvasPoint | null>(null)
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [tool, setTool] = useState<MaskTool>('brush')
  const [isErasing, setIsErasing] = useState(false)
  const boxStartRef = useRef<CanvasPoint | null>(null)
  const [boxPreview, setBoxPreview] = useState<CanvasRect | null>(null)
  const [prompt, setPrompt] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const { width: canvasWidth, height: canvasHeight } = useMemo(
    () => fitCanvasDimensions(imageWidth, imageHeight),
    [imageHeight, imageWidth],
  )
  const imageKey = `${imageUrl}:${canvasWidth}x${canvasHeight}`
  const aspectRatio = useMemo(
    () => `${canvasWidth} / ${canvasHeight}`,
    [canvasHeight, canvasWidth],
  )
  const currentHistory = useMemo(
    () => history.filter((entry) => entry.imageKey === imageKey),
    [history, imageKey],
  )

  useEffect(() => {
    const canvas = baseCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    image.src = imageUrl

    return () => {
      image.onload = null
    }
  }, [imageUrl, canvasHeight, canvasWidth])

  useEffect(() => {
    const canvas = maskCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
  }, [imageUrl, canvasHeight, canvasWidth])

  const getMaskContext = useCallback(() => {
    return maskCanvasRef.current?.getContext('2d') ?? null
  }, [])

  const captureHistory = useCallback(() => {
    const canvas = maskCanvasRef.current
    const context = getMaskContext()
    if (!canvas || !context) return

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    setHistory((current) => {
      const otherEntries = current.filter(
        (entry) => entry.imageKey !== imageKey,
      )
      const imageEntries = current.filter(
        (entry) => entry.imageKey === imageKey,
      )
      return [
        ...otherEntries,
        ...imageEntries.slice(-(MAX_HISTORY_LENGTH - 1)),
        { imageKey, imageData },
      ]
    })
  }, [getMaskContext, imageKey])

  const getCanvasPoint = useCallback((event: React.PointerEvent) => {
    const canvas = maskCanvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }, [])

  const drawStroke = useCallback(
    (point: CanvasPoint, previousPoint: CanvasPoint | null) => {
      const context = getMaskContext()
      if (!context) return

      context.save()
      context.globalCompositeOperation = isErasing
        ? 'destination-out'
        : 'source-over'
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = brushSize
      context.strokeStyle = 'rgba(239, 68, 68, 0.55)'
      context.fillStyle = 'rgba(239, 68, 68, 0.55)'

      if (previousPoint) {
        context.beginPath()
        context.moveTo(previousPoint.x, previousPoint.y)
        context.lineTo(point.x, point.y)
        context.stroke()
      } else {
        context.beginPath()
        context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
        context.fill()
      }

      context.restore()
    },
    [brushSize, getMaskContext, isErasing],
  )

  const rectBetween = (a: CanvasPoint, b: CanvasPoint): CanvasRect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  })

  const drawBox = useCallback(
    (rect: CanvasRect) => {
      const context = getMaskContext()
      if (!context) return

      context.save()
      // 与画笔同一套合成规则 —— 橡皮对框一样生效，不然那个开关在拉框下就是死的。
      context.globalCompositeOperation = isErasing
        ? 'destination-out'
        : 'source-over'
      context.fillStyle = 'rgba(239, 68, 68, 0.55)'
      context.fillRect(rect.x, rect.y, rect.width, rect.height)
      context.restore()
    },
    [getMaskContext, isErasing],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(event)
      if (!point) return

      event.preventDefault()
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      captureHistory()
      isDrawingRef.current = true

      if (tool === 'box') {
        // 框在松手时才落进蒙版 —— 拖动期间只画一层预览浮层，避免每帧擦重画。
        boxStartRef.current = point
        setBoxPreview({ x: point.x, y: point.y, width: 0, height: 0 })
        return
      }

      lastPointRef.current = point
      drawStroke(point, null)
    },
    [captureHistory, drawStroke, getCanvasPoint, tool],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return

      const point = getCanvasPoint(event)
      if (!point) return

      event.preventDefault()

      if (tool === 'box') {
        const start = boxStartRef.current
        if (start) setBoxPreview(rectBetween(start, point))
        return
      }

      drawStroke(point, lastPointRef.current)
      lastPointRef.current = point
    },
    [drawStroke, getCanvasPoint, tool],
  )

  const stopDrawing = useCallback(
    (event?: React.PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'box' && isDrawingRef.current) {
        const start = boxStartRef.current
        const end = event ? getCanvasPoint(event) : null
        // 太小的框多半是误点（想点却拖了 1px）——落进去只会留个看不见的脏点。
        if (start && end) {
          const rect = rectBetween(start, end)
          if (rect.width >= 2 && rect.height >= 2) drawBox(rect)
        }
      }
      boxStartRef.current = null
      setBoxPreview(null)
      isDrawingRef.current = false
      lastPointRef.current = null
    },
    [drawBox, getCanvasPoint, tool],
  )

  const handleUndo = useCallback(() => {
    const context = getMaskContext()
    if (!context) return

    setHistory((current) => {
      const otherEntries = current.filter(
        (entry) => entry.imageKey !== imageKey,
      )
      const imageEntries = current.filter(
        (entry) => entry.imageKey === imageKey,
      )
      const previous = imageEntries.at(-1)
      if (previous) {
        context.putImageData(previous.imageData, 0, 0)
      }
      return [...otherEntries, ...imageEntries.slice(0, -1)]
    })
  }, [getMaskContext, imageKey])

  const handleClear = useCallback(() => {
    const canvas = maskCanvasRef.current
    const context = getMaskContext()
    if (!canvas || !context) return

    captureHistory()
    context.clearRect(0, 0, canvas.width, canvas.height)
  }, [captureHistory, getMaskContext])

  /**
   * 导出蒙版。⚠ **必须是源图的真实像素尺寸，不是绘制画布的尺寸。**
   *
   * 2026-08-18 真机实测：源图 1672×941、蒙版 1024×1024 时 FLUX Pro Fill 直接
   * 500；把 `MAX_CANVAS_EDGE` 那层比例修对、蒙版变成 1024×576（长宽比已经和
   * 源图一致）**仍然 500**；换成 1672×941 原尺寸的蒙版才出图。所以
   * `fitCanvasDimensions` 上那句「fal.ai requires matching aspect ratios」是
   * 错的 —— 它要的是**逐像素同尺寸**。
   *
   * 绘制面继续按 `MAX_CANVAS_EDGE` 收着（4K 源图否则要吃 ~64MB），只在导出这
   * 一步放大：先在绘制分辨率上把 alpha 压成纯黑白，再用最近邻放到源图尺寸 ——
   * 双线性会在边缘插出灰边，那就不是二值蒙版了。
   */
  const exportMaskDataUrl = useCallback((): string => {
    const canvas = maskCanvasRef.current
    const context = getMaskContext()
    if (!canvas || !context) return 'data:image/png;base64,'

    const source = context.getImageData(0, 0, canvas.width, canvas.height)
    const binaryCanvas = document.createElement('canvas')
    binaryCanvas.width = canvas.width
    binaryCanvas.height = canvas.height

    const binaryContext = binaryCanvas.getContext('2d')
    if (!binaryContext) return canvas.toDataURL('image/png')

    const mask = binaryContext.createImageData(canvas.width, canvas.height)
    for (let index = 0; index < source.data.length; index += 4) {
      const hasPaint = source.data[index + 3] > 0
      const value = hasPaint ? 255 : 0
      mask.data[index] = value
      mask.data[index + 1] = value
      mask.data[index + 2] = value
      mask.data[index + 3] = 255
    }

    binaryContext.putImageData(mask, 0, 0)

    const exportWidth = Math.round(clampImageSize(imageWidth))
    const exportHeight = Math.round(clampImageSize(imageHeight))
    if (exportWidth === canvas.width && exportHeight === canvas.height) {
      return binaryCanvas.toDataURL('image/png')
    }

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = exportWidth
    exportCanvas.height = exportHeight
    const exportContext = exportCanvas.getContext('2d')
    if (!exportContext) return binaryCanvas.toDataURL('image/png')

    exportContext.imageSmoothingEnabled = false
    exportContext.drawImage(binaryCanvas, 0, 0, exportWidth, exportHeight)
    return exportCanvas.toDataURL('image/png')
  }, [getMaskContext, imageHeight, imageWidth])

  const handleApply = useCallback(() => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isLoading) return
    onApply(exportMaskDataUrl(), trimmedPrompt)
  }, [exportMaskDataUrl, isLoading, onApply, prompt])

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            className="relative mx-auto overflow-hidden rounded-lg border border-border bg-muted"
            /**
             * ⚠ 高度必须封顶，否则方形源图会把「应用」按钮顶出视口 ——
             * 2026-08-19 真机量到：1024×1024 的源图在 1920×855 上让应用按钮
             * 落在 y=1197，用户看不见也点不着。
             *
             * 封的是 `maxWidth`（= 高度上限 × 宽高比）而不是 `maxHeight`：
             * 两块 canvas 是 `inset-0 h-full w-full` 绝对定位的，直接压高度
             * 会把它们拉变形；压宽度则由 `aspect-ratio` 反推高度，比例不变。
             */
            style={{
              aspectRatio,
              maxWidth: `calc(min(56vh, 560px) * ${canvasWidth / canvasHeight})`,
            }}
          >
            <canvas
              ref={baseCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="absolute inset-0 h-full w-full"
            />
            <canvas
              ref={maskCanvasRef}
              width={canvasWidth}
              height={canvasHeight}
              aria-label={t('canvasLabel')}
              className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
            />
            {boxPreview ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                style={{
                  left: `${(boxPreview.x / canvasWidth) * 100}%`,
                  top: `${(boxPreview.y / canvasHeight) * 100}%`,
                  width: `${(boxPreview.width / canvasWidth) * 100}%`,
                  height: `${(boxPreview.height / canvasHeight) * 100}%`,
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div
            className="grid grid-cols-2 gap-2"
            role="group"
            aria-label={t('title')}
          >
            {(
              [
                { id: 'brush', label: t('toolBrush'), Icon: Paintbrush },
                { id: 'box', label: t('toolBox'), Icon: SquareDashed },
              ] as const
            ).map(({ id, label, Icon }) => (
              <Button
                key={id}
                type="button"
                variant={tool === id ? 'default' : 'ghost'}
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
                className="justify-start"
              >
                <Icon className="size-4" />
                {label}
              </Button>
            ))}
          </div>

          {/* 画笔粗细只服务画笔 —— 拉框态留着它就是个不生效的控件。 */}
          {tool === 'brush' ? (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="inpaint-brush-size">{t('brushSize')}</Label>
                <span className="text-xs text-muted-foreground">
                  {brushSize}px
                </span>
              </div>
              <Slider
                id="inpaint-brush-size"
                min={5}
                max={50}
                step={1}
                value={[brushSize]}
                onValueChange={(value) => setBrushSize(value[0] ?? brushSize)}
                aria-label={t('brushSize')}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
              {t('boxHint')}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={isErasing ? 'default' : 'ghost'}
              onClick={() => setIsErasing((current) => !current)}
              className="justify-start"
            >
              {isErasing ? (
                <Eraser className="size-4" />
              ) : (
                <Paintbrush className="size-4" />
              )}
              {t('eraser')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleUndo}
              disabled={currentHistory.length === 0}
              className="justify-start"
            >
              <RotateCcw className="size-4" />
              {t('undo')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClear}
              className="col-span-2 justify-start text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
              {t('clearAll')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inpaint-prompt">{t('prompt')}</Label>
            <Textarea
              id="inpaint-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t('promptPlaceholder')}
              className="min-h-24 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button
          type="button"
          onClick={handleApply}
          disabled={!prompt.trim() || isLoading}
          className={cn(isLoading && 'cursor-wait')}
        >
          <Check className="size-4" />
          {t('apply')}
        </Button>
      </div>
    </div>
  )
})
