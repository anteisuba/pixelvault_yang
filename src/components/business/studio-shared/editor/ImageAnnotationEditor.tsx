'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { ObjectReplaceAnnotation } from '@/types'

/**
 * 多框编号 + 注释清单（E3）。
 *
 * ⚠ **宿主必须传 `key={imageUrl}`**：一次全改成功后源图会换成结果（就地替换
 * 槽位），而注释本来就是**相对某一张图**的 —— 不重挂的话那些 ①②③ 框会留在
 * 新图上，用户以为标注仍然生效，再点一次「应用」就把同样的指令又跑一遍
 * （2026-08-19 真机逮到）。用 key 而不是 `useEffect` 清空，是 React 官方对
 * 「prop 变了要重置 state」的推荐解法，也避开 `react-hooks/set-state-in-effect`。
 *
 * ⚠ **图上只画编号，文字走清单进 prompt，不落像素**（`docs/references/pages/
 * studio-image-edit.md` §5，2026-07-11 拍板的理由未变：痕迹落像素 + 不结构化）。
 * 2026-08-19 实测也证明不需要把编号烧进图 —— 干净原图 + 文字清单就能一次改对
 * 三处（任务包 §7.11），于是「成品留标注痕」这个风险根本不用承担。
 *
 * 与 `StudioInpaintEditor` 的分工：那边一个 mask + 一句话，走 `inpaint`；这边
 * 多个编号 + 一条清单，走 `object-replace`。**框在这里不是 mask** —— 它只负责
 * 让用户看见自己圈了哪儿，外加给模型一个粗略方位。
 */

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'] as const
/** 小于这个比例的框当误点丢弃（想点却拖了几像素）。 */
const MIN_BOX_RATIO = 0.015

interface DraftAnnotation {
  id: string
  area: { x: number; y: number; width: number; height: number }
  instruction: string
}

interface ImageAnnotationEditorProps {
  imageUrl: string
  onApply: (annotations: ObjectReplaceAnnotation[]) => void
  onCancel: () => void
  isLoading?: boolean
}

function badge(index: number): string {
  return CIRCLED[index] ?? String(index + 1)
}

export function ImageAnnotationEditor({
  imageUrl,
  onApply,
  onCancel,
  isLoading = false,
}: ImageAnnotationEditorProps) {
  const t = useTranslations('StudioImageEdit')
  const tCommon = useTranslations('Common')
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [annotations, setAnnotations] = useState<DraftAnnotation[]>([])
  const [draftBox, setDraftBox] = useState<DraftAnnotation['area'] | null>(null)

  const canApply = useMemo(
    () =>
      annotations.length > 0 &&
      annotations.every((item) => item.instruction.trim().length > 0),
    [annotations],
  )

  const toRatio = useCallback((event: React.PointerEvent) => {
    const surface = surfaceRef.current
    if (!surface) return null
    const rect = surface.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isLoading) return
      const point = toRatio(event)
      if (!point) return
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      startRef.current = point
      setDraftBox({ x: point.x, y: point.y, width: 0, height: 0 })
    },
    [isLoading, toRatio],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current
      if (!start) return
      const point = toRatio(event)
      if (!point) return
      setDraftBox({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      })
    },
    [toRatio],
  )

  const handlePointerUp = useCallback(() => {
    const box = draftBox
    startRef.current = null
    setDraftBox(null)
    if (!box || box.width < MIN_BOX_RATIO || box.height < MIN_BOX_RATIO) return

    setAnnotations((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        area: box,
        instruction: '',
      },
    ])
  }, [draftBox])

  const handleApply = useCallback(() => {
    if (!canApply || isLoading) return
    onApply(
      annotations.map((item, index) => ({
        index: index + 1,
        instruction: item.instruction.trim(),
        area: item.area,
      })),
    )
  }, [annotations, canApply, isLoading, onApply])

  return (
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div
        ref={surfaceRef}
        role="application"
        aria-label={t('annotate.hint')}
        className="relative min-h-0 self-start overflow-hidden rounded-xl border border-border bg-muted"
        style={{
          touchAction: 'none',
          cursor: isLoading ? 'wait' : 'crosshair',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={t('sourceAlt')}
          draggable={false}
          className="pointer-events-none block w-full select-none"
        />
        {annotations.map((item, index) => (
          <div
            key={item.id}
            aria-hidden="true"
            className="pointer-events-none absolute border-2 border-primary bg-primary/10"
            style={{
              left: `${item.area.x * 100}%`,
              top: `${item.area.y * 100}%`,
              width: `${item.area.width * 100}%`,
              height: `${item.area.height * 100}%`,
            }}
          >
            <span className="absolute -top-px -left-px min-w-5 bg-primary px-1 text-center text-xs leading-5 text-primary-foreground">
              {badge(index)}
            </span>
          </div>
        ))}
        {draftBox ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/5"
            style={{
              left: `${draftBox.x * 100}%`,
              top: `${draftBox.y * 100}%`,
              width: `${draftBox.width * 100}%`,
              height: `${draftBox.height * 100}%`,
            }}
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">
            {t('annotate.listTitle')}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground/80">
            {t('annotate.hint')}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {annotations.length === 0 ? (
            <p className="text-xs text-muted-foreground/80">
              {t('annotate.empty')}
            </p>
          ) : (
            annotations.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
              >
                <span className="size-5 shrink-0 rounded bg-primary text-center text-xs leading-5 text-primary-foreground">
                  {badge(index)}
                </span>
                <input
                  value={item.instruction}
                  disabled={isLoading}
                  placeholder={t('annotate.placeholder')}
                  aria-label={`${badge(index)} ${t('annotate.placeholder')}`}
                  onChange={(event) =>
                    setAnnotations((current) =>
                      current.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, instruction: event.target.value }
                          : entry,
                      ),
                    )
                  }
                  className="min-w-0 flex-1 border-0 border-b border-dashed border-border bg-transparent text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={isLoading}
                  aria-label={t('annotate.remove', { index: index + 1 })}
                  onClick={() =>
                    setAnnotations((current) =>
                      current.filter((entry) => entry.id !== item.id),
                    )
                  }
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canApply || isLoading}
            onClick={handleApply}
          >
            {isLoading ? <Spinner size="md" /> : <Check className="size-4" />}
            {t('annotate.apply', { count: annotations.length })}
          </Button>
        </div>
      </div>
    </div>
  )
}
