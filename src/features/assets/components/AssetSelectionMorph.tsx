'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useAnimate, useReducedMotion } from 'motion/react'

import { BlurSwap } from '@/components/ui/blur-swap'
import { SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

interface AssetSelectionMorphProps {
  open: boolean
  /** 顶栏（定位基准，`relative`）。 */
  containerRef: RefObject<HTMLElement | null>
  /** 选择条左缘对齐到它的左缘（分面那一段的起点）。 */
  startRef: RefObject<HTMLElement | null>
  /** 「选择」键：条从它长出来、缩回它。 */
  buttonRef: RefObject<HTMLElement | null>
  children: ReactNode
  className?: string
}

/** 键先让分面糊掉，再开始长（原型 150ms）。 */
const GROW_DELAY_S = 0.15

/**
 * 「选择」键自己往左拉长成选择条（素材页原型「选择」· 2026-10-08 定稿）：同一个元素变形，
 * 量键与分面起点的位置，左缘 / 宽度走 `SPRING.slot`；收的时候缩回那颗键再藏起来。
 * 条里的内容靠右排、宽度定死在终态，所以长的过程中只是被一点点露出来，⛔ 不挤字。
 *
 * 只在 ≥768 用（窄屏顶栏会折行，仍走底部浮条）：宿主外面套 `hidden md:contents`。
 */
export function AssetSelectionMorph({
  open,
  containerRef,
  startRef,
  buttonRef,
  children,
  className,
}: AssetSelectionMorphProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const innerRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  const firstRef = useRef(true)

  useLayoutEffect(() => {
    const shell = scope.current
    const container = containerRef.current
    const start = startRef.current
    const button = buttonRef.current
    const inner = innerRef.current
    if (!shell || !container || !start || !button || !inner) return
    const base = container.getBoundingClientRect()
    const btn = button.getBoundingClientRect()
    const from = {
      left: btn.left - base.left,
      top: btn.top - base.top,
      width: btn.width,
      height: btn.height,
    }
    const startLeft = start.getBoundingClientRect().left - base.left
    const to = { left: startLeft, width: btn.right - base.left - startLeft }

    if (firstRef.current) {
      firstRef.current = false
      if (!open) return
    }
    const instant = reducedMotion ? { duration: 0 } : SPRING.slot
    if (open) {
      inner.style.width = `${to.width}px`
      Object.assign(shell.style, {
        display: 'block',
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
      })
      void animate(shell, to, {
        ...instant,
        delay: reducedMotion ? 0 : GROW_DELAY_S,
      })
    } else {
      void animate(shell, { left: from.left, width: from.width }, instant).then(
        () => {
          shell.style.display = 'none'
        },
      )
    }
  }, [open, animate, scope, containerRef, startRef, buttonRef, reducedMotion])

  return (
    <div
      ref={scope}
      inert={!open}
      style={{ display: 'none' }}
      className={cn(
        'absolute z-10 overflow-hidden rounded-full border border-border bg-background',
        className,
      )}
    >
      <div
        ref={innerRef}
        className={cn(
          'absolute inset-y-0 right-0 flex items-center gap-0.5 pl-3.5 pr-0.5 whitespace-nowrap',
          'transition-[opacity,filter] duration-base ease-standard motion-reduce:transition-none',
          open ? 'opacity-100 blur-none delay-200' : 'opacity-0 blur-xs',
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** 选择条上的一个动作（文字链样式）。 */
export function SelectionLink({
  children,
  className,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex h-6.5 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground',
        'transition-[color,background-color,opacity] duration-fast ease-standard motion-reduce:transition-none',
        'hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35',
        'data-[state=open]:bg-muted data-[state=open]:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** 拉长成确认还没再点，就自己缩回去。 */
const ARM_TIMEOUT_MS = 3000

/**
 * 删除要点两次（原型 J）：第一次原地变成黑底「确认删除 N 张」，再点才删；
 * 3 秒不点、选中数变了、或条收起都缩回「删除」。⛔ 不弹框。
 */
export function SelectionArmButton({
  label,
  armedLabel,
  disabled,
  resetKey,
  onConfirm,
}: {
  label: string
  armedLabel: string
  disabled?: boolean
  /** 一换就缩回未确认（选中数、条的开合）。 */
  resetKey: string
  onConfirm: () => void
}) {
  const [armed, setArmed] = useState<string | null>(null)
  const isArmed = armed === resetKey

  useEffect(() => {
    if (!isArmed) return
    const timer = window.setTimeout(() => setArmed(null), ARM_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [isArmed])

  const text = isArmed ? armedLabel : label
  return (
    <SelectionLink
      disabled={disabled}
      data-armed={isArmed || undefined}
      onClick={() => {
        if (!isArmed) {
          setArmed(resetKey)
          return
        }
        setArmed(null)
        onConfirm()
      }}
      className="data-[armed]:bg-foreground data-[armed]:text-background data-[armed]:hover:bg-foreground data-[armed]:hover:text-background"
    >
      <BlurSwap swapKey={text}>{text}</BlurSwap>
    </SelectionLink>
  )
}
