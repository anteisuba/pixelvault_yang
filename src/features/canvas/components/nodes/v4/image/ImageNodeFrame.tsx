'use client'

import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Download, Plus, Sparkles } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CANVAS_PROMPT_DOCK } from '@/constants/canvas-shell'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { NODE_V4_CHROME } from '@/constants/node-studio'
import { cn } from '@/lib/utils'

import { NodeFrame } from '../chrome'
import { TextAssistantBar } from '../text/TextAssistantBar'

export interface ImageNodeFrameProps {
  readonly open: boolean
  onClose(): void
  readonly origin: RefObject<HTMLElement | null>
  readonly nodeId: string
  readonly title: string
  readonly headline: string
  readonly url: string
  readonly mediaWidth?: number | undefined
  readonly mediaHeight?: number | undefined
  onDownload(): void
  readonly versionCount: number
  readonly versionIndex: number
  onVersionChange(index: number): void
  /**
   * 这张卡的草稿。⚠ 框里**不再有第二个输入框**（2026-11-21 定稿）：正文只在底部
   * 停靠的那条提示词栏里写，这里只在关框时把它存回去。
   */
  readonly body: string
  onSave(body: string): void
  /**
   * ⌘↵ 的去处（框开着时焦点不在停靠栏里也认）。⚠ 页脚已没有「重新生成」键：
   * 画面 / ⚙ / 发送只在底部停靠栏里一份（owner 11-21）。
   */
  onRegenerate(): void
  readonly regenerateDisabled: boolean
  readonly footerReadout: string
  readonly showReferences: boolean
  readonly refRail: ReactNode
  readonly refAddMenu: ReactNode
  onAttachFile(file: File): void
}

export function ImageNodeFrame({
  open,
  onClose,
  origin,
  nodeId,
  title,
  headline,
  url,
  mediaWidth,
  mediaHeight,
  onDownload,
  versionCount,
  versionIndex,
  onVersionChange,
  body,
  onSave,
  onRegenerate,
  regenerateDisabled,
  footerReadout,
  showReferences,
  refRail,
  refAddMenu,
  onAttachFile,
}: ImageNodeFrameProps) {
  const t = useTranslations('StudioNode.v4')
  const tImage = useTranslations('StudioNode.v4.image')
  const tVideo = useTranslations('StudioNode.v4.video')
  const reduce = useReducedMotion()
  const [assistOpen, setAssistOpen] = useState(false)
  const [stageHeight, setStageHeight] = useState(() =>
    typeof window === 'undefined' ? 900 : window.innerHeight,
  )

  useEffect(() => {
    if (!open) return
    const stage = document.querySelector('[data-canvas-stage]')
    const measure = () =>
      setStageHeight(
        stage?.getBoundingClientRect().height || window.innerHeight,
      )
    measure()
    window.addEventListener('resize', measure)
    const observer =
      stage && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(measure)
        : null
    if (stage) observer?.observe(stage)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith('image/'),
      )
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      onAttachFile(file)
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [open, onAttachFile])

  useEffect(() => {
    if (!open || versionCount < 2) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, [contenteditable="true"]')
      )
        return
      event.preventDefault()
      const next =
        event.key === 'ArrowLeft'
          ? Math.max(0, versionIndex - 1)
          : Math.min(versionCount - 1, versionIndex + 1)
      if (next !== versionIndex) onVersionChange(next)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, versionCount, versionIndex, onVersionChange])

  // ⌘↵ =「重新生成」：页脚主键删掉后它仍挂在框上（框开着 = 停靠栏归这张卡）。焦点
  // 在停靠栏里时栏自己的 Enter 先吃掉这一下（`defaultPrevented`），⛔ 发两枪。
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      if (!regenerateDisabled) onRegenerate()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, regenerateDisabled, onRegenerate])

  const ratio = mediaWidth && mediaHeight ? mediaWidth / mediaHeight : 16 / 9
  const imageWidth = NODE_V4_CHROME.frameWidth.video - 40
  // 上留白 48 + 底部让给停靠栏的那一截 + 框自己的顶栏 52 / 页脚 59（+ 参考一行 58）。
  const imageMaxHeight = Math.max(
    200,
    stageHeight -
      48 -
      CANVAS_PROMPT_DOCK.frameReservePx -
      (showReferences ? 169 : 111),
  )
  const fittedHeight = Math.min(imageWidth / ratio, imageMaxHeight)
  const fittedWidth = Math.min(imageWidth, fittedHeight * ratio)
  const commit = () => onSave(body)

  return (
    <NodeFrame
      open={open}
      onClose={() => {
        commit()
        onClose()
      }}
      origin={origin}
      stretchFromOrigin
      bottomInsetPx={CANVAS_PROMPT_DOCK.frameReservePx}
      title={title}
      width={NODE_V4_CHROME.frameWidth.video}
      titleExtra={
        <span
          data-image-frame-headline
          className="truncate font-mono text-2xs text-muted-foreground"
        >
          {headline}
        </span>
      }
      titleActions={
        <button
          type="button"
          data-image-frame-download
          aria-label={t('toolbar.download')}
          onClick={onDownload}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Download aria-hidden className="size-4" />
        </button>
      }
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-image-frame-assist
            aria-expanded={assistOpen}
            onClick={() => setAssistOpen((value) => !value)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-2sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:shadow-focus',
              assistOpen
                ? 'bg-foreground text-background'
                : 'bg-surface-fill text-foreground hover:tint-hover',
            )}
          >
            <Sparkles aria-hidden className="size-3.5" />
            {tVideo('frame.askAssistant')}
          </button>
          <span
            data-image-frame-readout
            className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground/75"
          >
            {footerReadout}
          </span>
          {/* ⛔ 画面 / ⚙ / 模型 / 重新生成：底部停靠的提示词栏里已有同一份（owner 11-21），
              页脚只留栏里没有的「让助手写」与读数。 */}
        </div>
      }
      assistantBar={
        <AnimatePresence initial={false}>
          {assistOpen ? (
            <motion.div
              key="assist"
              data-image-frame-assist-bar
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_STANDARD }}
              className="overflow-hidden"
            >
              <TextAssistantBar nodeId={nodeId} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div
          data-image-frame-stage
          className="relative flex shrink-0 justify-center overflow-hidden rounded-node-bar bg-surface-workbench"
          style={{ height: Math.round(fittedHeight) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={title}
            draggable={false}
            className="h-full rounded-node-thumb object-contain"
            style={{ width: Math.round(fittedWidth) }}
          />
          {versionCount > 1 ? (
            <div
              data-image-frame-version-dots
              className="absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-1.5"
            >
              {Array.from({ length: versionCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onVersionChange(index)}
                  aria-label={t('chrome.versionOf', {
                    index: index + 1,
                    total: versionCount,
                  })}
                  aria-current={index === versionIndex ? 'true' : undefined}
                  className={cn(
                    'size-1.5 rounded-full focus-visible:outline-none focus-visible:shadow-focus',
                    index === versionIndex ? 'bg-card' : 'bg-card/55',
                  )}
                />
              ))}
            </div>
          ) : null}
        </div>

        {showReferences ? (
          <div
            data-image-frame-refs
            className="flex min-h-11 items-center gap-2"
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes('Files'))
                event.preventDefault()
            }}
            onDrop={(event) => {
              const file = Array.from(event.dataTransfer.files).find((item) =>
                item.type.startsWith('image/'),
              )
              if (!file) return
              event.preventDefault()
              event.stopPropagation()
              onAttachFile(file)
            }}
          >
            <span className="w-8.5 shrink-0 text-2xs tracking-node-sec text-muted-foreground">
              {tImage('frame.referenceLabel')}
            </span>
            {refRail}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-image-frame-add-ref
                  aria-label={tImage('add.canvas')}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-foreground/24 text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-75 rounded-12 bg-popover p-1.5 shadow-pop"
              >
                {refAddMenu}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="ml-1 truncate text-2xs text-muted-foreground/75">
              {tImage('frame.dropOrPaste')}
            </span>
          </div>
        ) : null}
      </div>
    </NodeFrame>
  )
}
