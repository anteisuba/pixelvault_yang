'use client'

import { useRef, useState, type ReactNode, type RefObject } from 'react'

import { PREVIEW_SWIPE_MIN_PX } from '@/constants/navigation'
import { ChevronLeft, ChevronRight } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { ThirdPartyImage } from '@/components/business/ThirdPartyImage'

export interface PreviewImage {
  url: string
  /** 读屏念的名字，同时是框的标题（看不见）。 */
  alt: string
  /** 第三方网图（Danbooru 样图一类）：走 `ThirdPartyImage`，取不到退回 `fallbackUrl`。 */
  thirdParty?: boolean
  fallbackUrl?: string
}

interface ImagePreviewDialogProps {
  images: readonly PreviewImage[]
  /** 打开时先看哪一张；`null` = 关着。 */
  openIndex: number | null
  onClose: () => void
  closeLabel?: string
  /** 读屏用的一句说明（看不见）。 */
  description?: string
  /** 多张时左右翻：给了才画两颗翻页键（还能 ← → 与左右划）。 */
  navigation?: { previousLabel: string; nextLabel: string }
  /** 大图底下那一行（原帖链接一类）。 */
  footer?: (image: PreviewImage) => ReactNode
  /** 关上后焦点回哪颗缩略图；不给 = radix 默认（打开前的焦点）。 */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** 宿主面板自己也听 Esc（查资料）：这里接住，只关大图。 */
  stopEscapePropagation?: boolean
}

/**
 * 点缩略图看大图——全仓唯一一份（输入框参考图、LoRA 参考图 / 来源图 / 封面 / 结果、查资料样图）。
 * 外壳照 ui-spec §9 查看器：`scrim` 遮罩 + 圆角 24 的 `float` 大卡（`pop`），右上 32 的白圆 ×；
 * 只放大，没有配方栏（要配方的走 `InPlaceViewer` / 来源配方弹窗）。手机同一个框，四边留 1rem。
 */
export function ImagePreviewDialog({
  images,
  openIndex,
  onClose,
  closeLabel,
  description,
  navigation,
  footer,
  returnFocusRef,
  stopEscapePropagation,
}: ImagePreviewDialogProps) {
  const [index, setIndex] = useState(openIndex ?? 0)
  // 每次打开从宿主点的那一张起（render 期按 props 调整 state，⛔ effect 级联）。
  const [openedAt, setOpenedAt] = useState(openIndex)
  if (openedAt !== openIndex) {
    setOpenedAt(openIndex)
    if (openIndex !== null) setIndex(openIndex)
  }
  const swipeStart = useRef<{ x: number; y: number } | null>(null)

  const total = images.length
  const current = openIndex === null ? null : (images[index] ?? null)
  const canPage = Boolean(navigation) && total > 1
  const move = (delta: number) =>
    setIndex((value) => Math.max(0, Math.min(total - 1, value + delta)))

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        closeLabel={closeLabel}
        className="w-auto justify-items-center gap-2 rounded-24 p-3 sm:max-w-5xl"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && stopEscapePropagation) {
            event.stopPropagation()
          }
          if (
            canPage &&
            (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          ) {
            event.preventDefault()
            move(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
        onCloseAutoFocus={
          returnFocusRef
            ? (event) => {
                event.preventDefault()
                window.setTimeout(() => returnFocusRef.current?.focus(), 0)
              }
            : undefined
        }
      >
        <DialogTitle className="sr-only">{current?.alt ?? ''}</DialogTitle>
        {description ? (
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
        ) : null}
        {current ? (
          <div
            className="relative grid touch-pan-y place-items-center"
            onTouchStart={(event) => {
              const touch = event.touches[0]
              swipeStart.current =
                canPage && event.touches.length === 1 && touch
                  ? { x: touch.clientX, y: touch.clientY }
                  : null
            }}
            onTouchCancel={() => {
              swipeStart.current = null
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0]
              const origin = swipeStart.current
              swipeStart.current = null
              if (!touch || !origin) return
              const dx = touch.clientX - origin.x
              const dy = touch.clientY - origin.y
              if (
                Math.abs(dx) >= PREVIEW_SWIPE_MIN_PX &&
                Math.abs(dx) > Math.abs(dy)
              ) {
                move(dx < 0 ? 1 : -1)
              }
            }}
          >
            {current.thirdParty ? (
              <ThirdPartyImage
                key={current.url}
                src={current.url}
                fallback={current.fallbackUrl}
                alt={current.alt}
                className="image-preview-media rounded-12"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 任意来源的原图，按自己的比例放
              <img
                key={current.url}
                src={current.url}
                alt={current.alt}
                draggable={false}
                className="image-preview-media rounded-12"
              />
            )}
            {canPage && navigation ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={navigation.previousLabel}
                  disabled={index === 0}
                  onClick={() => move(-1)}
                  className="absolute top-1/2 left-2 -translate-y-1/2"
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={navigation.nextLabel}
                  disabled={index >= total - 1}
                  onClick={() => move(1)}
                  className="absolute top-1/2 right-2 -translate-y-1/2"
                >
                  <ChevronRight aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {current && (canPage || footer) ? (
          <div className="flex w-full min-w-0 items-center justify-between gap-3 px-1">
            {canPage ? (
              <span
                aria-live="polite"
                className="font-mono text-2xs tabular-nums text-muted-foreground"
              >
                {index + 1} / {total}
              </span>
            ) : (
              <span />
            )}
            {footer?.(current)}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
