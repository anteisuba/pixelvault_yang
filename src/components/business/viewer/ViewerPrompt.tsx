'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'

import { Check, Copy } from '@/components/icons'
import { COPIED_ACK_MS, LIQUID_SPRING } from '@/constants/motion'

/** 提示词收着时露 6 行（`leading-5` = 20px 一行）。 */
const PROMPT_COLLAPSED_HEIGHT = 120

interface ViewerPromptLabels {
  title: string
  copy: string
  copied: string
  copyFailed: string
  expand: string
  collapse: string
}

/**
 * 就地查看器右栏的提示词（素材页 · 画廊共用）：等宽，折到 6 行；「展开全部 /
 * 收起」高度走弹簧；复制键上换字 1.2 秒。换一张时调用方按 id 换 key。
 */
export function ViewerPrompt({
  text,
  labels,
}: {
  text: string
  labels: ViewerPromptLabels
}) {
  const reducedMotion = useReducedMotion()
  const textRef = useRef<HTMLParagraphElement>(null)
  const [fullHeight, setFullHeight] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  // 只有点「展开 / 收起」才走弹簧；量出来的高度（首帧、窗口变宽）瞬间落位。
  const [userToggled, setUserToggled] = useState(false)
  const [copied, setCopied] = useState(false)

  useLayoutEffect(() => {
    const node = textRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setFullHeight(node.offsetHeight)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const overflowing =
    fullHeight !== null && fullHeight > PROMPT_COLLAPSED_HEIGHT + 1
  const target =
    fullHeight === null
      ? PROMPT_COLLAPSED_HEIGHT
      : expanded
        ? fullHeight
        : Math.min(fullHeight, PROMPT_COLLAPSED_HEIGHT)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_ACK_MS)
    } catch {
      toast.error(labels.copyFailed)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h5 className="text-2xs font-semibold text-muted-foreground">
          {labels.title}
        </h5>
        <button
          type="button"
          onClick={() => void copy()}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <Copy className="size-3" aria-hidden />
          )}
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      <div className="rounded-lg bg-muted/60 px-2.5 py-2 ring-1 ring-inset ring-border/60">
        {/* 量出来之前按收着的高度摆；⛔ 从整段高度弹下来一次。 */}
        <motion.div
          initial={false}
          animate={{ height: target }}
          transition={
            reducedMotion || !userToggled
              ? { duration: 0 }
              : expanded
                ? LIQUID_SPRING.unfold
                : LIQUID_SPRING.retract
          }
          className="overflow-hidden"
        >
          <p
            ref={textRef}
            className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground"
          >
            {text}
          </p>
        </motion.div>
      </div>
      {overflowing ? (
        <button
          type="button"
          onClick={() => {
            setUserToggled(true)
            setExpanded((value) => !value)
          }}
          aria-expanded={expanded}
          className="self-start rounded-md text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? labels.collapse : labels.expand}
        </button>
      ) : null}
    </div>
  )
}
