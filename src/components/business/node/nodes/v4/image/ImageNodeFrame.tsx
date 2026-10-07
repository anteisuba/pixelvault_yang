'use client'

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'
import { Download, Plus, Sparkles } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MentionInput,
  type MentionCandidate,
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
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
  readonly body: string
  onBodyChange(body: string): void
  onSave(body: string): void
  onRegenerate(): void
  readonly regenerateDisabled: boolean
  readonly footerReadout: string
  readonly paramsChip: ReactNode
  /** 「专属」chip —— 模型没有专属能力时为 null。 */
  readonly capabilityChip?: ReactNode
  readonly modelChip: ReactNode
  readonly showReferences: boolean
  readonly refRail: ReactNode
  readonly refAddMenu: ReactNode
  onAttachFile(file: File): void
  readonly tokens: readonly MentionToken[]
  readonly candidates: readonly MentionCandidate[]
  onMentionSelect(candidate: MentionCandidate, handle: MentionInputHandle): void
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
  onBodyChange,
  onSave,
  onRegenerate,
  regenerateDisabled,
  footerReadout,
  paramsChip,
  capabilityChip,
  modelChip,
  showReferences,
  refRail,
  refAddMenu,
  onAttachFile,
  tokens,
  candidates,
  onMentionSelect,
}: ImageNodeFrameProps) {
  const t = useTranslations('StudioNode.v4')
  const tImage = useTranslations('StudioNode.v4.image')
  const tVideo = useTranslations('StudioNode.v4.video')
  const reduce = useReducedMotion()
  const editorRef = useRef<MentionInputHandle>(null)
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

  const ratio = mediaWidth && mediaHeight ? mediaWidth / mediaHeight : 16 / 9
  const imageWidth = NODE_V4_CHROME.frameWidth.video - 40
  const imageMaxHeight = Math.max(
    200,
    stageHeight - 96 - (showReferences ? 252 : 194),
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
      title={title}
      width={NODE_V4_CHROME.frameWidth.video}
      titleExtra={
        <span
          data-image-frame-headline
          className="truncate font-mono text-xs text-muted-foreground"
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
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors duration-fast ease-standard focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              assistOpen
                ? 'bg-foreground text-background'
                : 'bg-surface-fill text-foreground hover:bg-surface-fill-hover',
            )}
          >
            <Sparkles aria-hidden className="size-3.5" />
            {tVideo('frame.askAssistant')}
          </button>
          <span
            data-image-frame-readout
            className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground/75"
          >
            {footerReadout}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {paramsChip}
            {capabilityChip}
            {modelChip}
            <button
              type="button"
              data-image-regenerate
              disabled={regenerateDisabled}
              onClick={() => {
                commit()
                onRegenerate()
              }}
              className="inline-flex h-7.5 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {tVideo('frame.regenerate')}
              <kbd className="rounded-sm border border-primary-foreground/35 px-1 font-sans text-3xs">
                {tVideo('frame.regenerateShortcut')}
              </kbd>
            </button>
          </span>
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
                    'size-1.5 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
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
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-foreground/24 text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-75 rounded-node-bar border bg-popover p-1.5 shadow-node-menu"
              >
                {refAddMenu}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="ml-1 truncate text-xs text-muted-foreground/75">
              {tImage('frame.dropOrPaste')}
            </span>
          </div>
        ) : null}

        <div
          data-image-frame-body
          onBlur={commit}
          onKeyDown={(event) => {
            if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter')
              return
            event.preventDefault()
            if (regenerateDisabled) return
            commit()
            onRegenerate()
          }}
          className="min-h-17.5 border-t pt-3.5 text-sm leading-5.5"
        >
          <MentionInput
            variant="canvas"
            ref={editorRef}
            value={body}
            onValueChange={onBodyChange}
            tokens={tokens}
            mentionCandidates={candidates}
            placeholder={tImage('promptPlaceholder')}
            aria-label={tImage('promptLabel')}
            onMentionSelect={(candidate) => {
              if (editorRef.current)
                onMentionSelect(candidate, editorRef.current)
            }}
            className="min-h-14 w-full p-0 text-sm leading-5.5"
          />
        </div>
      </div>
    </NodeFrame>
  )
}
