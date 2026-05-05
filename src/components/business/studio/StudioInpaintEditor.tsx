'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eraser, Paintbrush, RotateCcw, Trash2 } from 'lucide-react'
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

interface HistoryEntry {
  imageKey: string
  imageData: ImageData
}

const DEFAULT_BRUSH_SIZE = 20
const MAX_HISTORY_LENGTH = 20

function clampImageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1024
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
  const [isErasing, setIsErasing] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const canvasWidth = clampImageSize(imageWidth)
  const canvasHeight = clampImageSize(imageHeight)
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
      lastPointRef.current = point
      drawStroke(point, null)
    },
    [captureHistory, drawStroke, getCanvasPoint],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return

      const point = getCanvasPoint(event)
      if (!point) return

      event.preventDefault()
      drawStroke(point, lastPointRef.current)
      lastPointRef.current = point
    },
    [drawStroke, getCanvasPoint],
  )

  const stopDrawing = useCallback(() => {
    isDrawingRef.current = false
    lastPointRef.current = null
  }, [])

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

  const exportMaskDataUrl = useCallback((): string => {
    const canvas = maskCanvasRef.current
    const context = getMaskContext()
    if (!canvas || !context) return 'data:image/png;base64,'

    const source = context.getImageData(0, 0, canvas.width, canvas.height)
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height

    const exportContext = exportCanvas.getContext('2d')
    if (!exportContext) return canvas.toDataURL('image/png')

    const mask = exportContext.createImageData(canvas.width, canvas.height)
    for (let index = 0; index < source.data.length; index += 4) {
      const hasPaint = source.data[index + 3] > 0
      const value = hasPaint ? 255 : 0
      mask.data[index] = value
      mask.data[index + 1] = value
      mask.data[index + 2] = value
      mask.data[index + 3] = 255
    }

    exportContext.putImageData(mask, 0, 0)
    return exportCanvas.toDataURL('image/png')
  }, [getMaskContext])

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
            style={{ aspectRatio }}
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
          </div>
        </div>

        <div className="space-y-4">
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
