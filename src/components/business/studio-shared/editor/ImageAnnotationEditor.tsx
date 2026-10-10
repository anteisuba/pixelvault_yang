'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Check, Trash2 } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { ObjectReplaceAnnotation } from '@/types'
import type { ImageEditComposerControls } from './ImageEditComposer'

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

export interface DraftAnnotation {
  id: string
  area: { x: number; y: number; width: number; height: number }
  instruction: string
}

interface ImageAnnotationEditorProps {
  imageUrl: string
  onApply: (annotations: ObjectReplaceAnnotation[]) => void
  onCancel: () => void
  isLoading?: boolean
  annotations?: DraftAnnotation[]
  onAnnotationsChange?: (annotations: DraftAnnotation[]) => void
  renderComposer?: (controls: ImageEditComposerControls) => ReactNode
}

function badge(index: number): string {
  return CIRCLED[index] ?? String(index + 1)
}

export function ImageAnnotationEditor({
  imageUrl,
  onApply,
  onCancel,
  isLoading = false,
  annotations: controlledAnnotations,
  onAnnotationsChange,
  renderComposer,
}: ImageAnnotationEditorProps) {
  const t = useTranslations('StudioImageEdit')
  const tCommon = useTranslations('Common')
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [localAnnotations, setLocalAnnotations] = useState<DraftAnnotation[]>(
    [],
  )
  const annotations = controlledAnnotations ?? localAnnotations
  const setAnnotations = useCallback(
    (update: SetStateAction<DraftAnnotation[]>) => {
      const next = typeof update === 'function' ? update(annotations) : update
      if (onAnnotationsChange) onAnnotationsChange(next)
      else setLocalAnnotations(next)
    },
    [annotations, onAnnotationsChange],
  )
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
      if (isLoading || !start) return
      const point = toRatio(event)
      if (!point) return
      setDraftBox({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      })
    },
    [isLoading, toRatio],
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
  }, [draftBox, setAnnotations])

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

  // 输入框里（工作台）只留一句提示 + 每个框一行，⛔ 标题与「还没有框」两段重复的话
  // 不进输入框（owner 2026-10-03）；独立弹层照旧三段。
  const annotationInput = (
    <div className="flex min-w-0 flex-col gap-3">
      {renderComposer ? (
        annotations.length === 0 ? (
          <p className="py-1 text-sm text-muted-foreground">
            {t('annotate.hint')}
          </p>
        ) : null
      ) : (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">
            {t('annotate.listTitle')}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground/80">
            {t('annotate.hint')}
          </p>
        </div>
      )}

      <div
        className={cn(
          'max-h-36 min-h-0 flex-1 space-y-2 overflow-y-auto',
          renderComposer && annotations.length === 0 && 'hidden',
        )}
      >
        {annotations.length === 0 ? (
          <p className="text-xs text-muted-foreground/80">
            {t('annotate.empty')}
          </p>
        ) : (
          annotations.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg bg-muted py-1 pr-1 pl-2"
            >
              <span className="size-5 shrink-0 rounded bg-foreground text-center font-mono text-xs leading-5 text-background">
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
                // ⚠ <768 必须 ≥16px：iOS 对小于 16px 的可聚焦输入框会自动放大整页。
                className="h-9 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60 md:text-sm"
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
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-background hover:text-destructive coarse:size-11"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div
      className={
        renderComposer
          ? 'flex min-h-0 flex-1 flex-col items-center justify-center gap-3'
          : 'studio-edit-body grid min-h-0 flex-1 gap-5'
      }
    >
      <div
        ref={surfaceRef}
        role="application"
        aria-label={t('annotate.hint')}
        // ⚠ 这一层必须**恰好等于图片的渲染框**：下面那些框选标注是按本元素的
        // 百分比定位的，指针坐标也是拿它的 rect 换算的。所以不能让它 stretch
        // 满整格再把图 object-contain 进去 —— 那样上下会多出留白，框会整体错位。
        // 高度约束因此加在 <img> 上（.studio-annotate-image），容器只负责居中。
        className="relative min-h-0 place-self-center overflow-hidden rounded-xl border border-border bg-muted"
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
          className="studio-annotate-image pointer-events-none block select-none"
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

      {renderComposer ? (
        renderComposer({
          input: annotationInput,
          onSubmit: handleApply,
          canSubmit: canApply,
          submitLabel: t('annotate.apply', { count: annotations.length }),
        })
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {annotationInput}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isLoading}
              onClick={onCancel}
            >
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
      )}
    </div>
  )
}
