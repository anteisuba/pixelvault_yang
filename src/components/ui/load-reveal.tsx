'use client'

import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'

import {
  EASE_STANDARD,
  LOAD_REVEAL,
  type LoadRevealTone,
} from '@/constants/motion'
import { cn } from '@/lib/utils'

/**
 * **加载中 · 数据到了由糊变清**（owner 2026-10-08 定稿，原型 `ThV7ucUtgNZS4zbGry9XPh`）。
 *
 * 全站只有这一份：画廊 / 素材库的图、设置页 key 列表、助手历史会话、模型选择器、查看器
 * 都从这里拿。⛔ 页面里再各写一份 `loading → fading → shown`。
 *
 * · 等数据时：静止的灰块（`Skeleton`，⛔ 呼吸闪烁），形状 = 真内容的形状。
 * · 数据到了：内容在**自己那一格里**由糊变清；一批里按位置从左上往右下错开
 *   （`revealStep` = 第几列 + 第几行）。
 * · `prefers-reduced-motion`：不糊、不错开，直接出现。
 *
 * 与 `BlurSwap` 的分工：`BlurSwap` 是「同一个位置上的字换成另一份」（换内容）；这里是
 * 「灰块换成第一次到的真内容」（到达）。按钮里的字照旧用 `BlurSwap`。
 */

/** 第几列 + 第几行 → 错开几步（封顶 `maxSteps`，再往后的不再多等）。 */
export function revealStep(
  column: number,
  row: number,
  tone: LoadRevealTone = 'media',
): number {
  return Math.min(
    Math.max(column, 0) + Math.max(row, 0),
    LOAD_REVEAL[tone].maxSteps,
  )
}

/**
 * 这一次挂载里**等过**数据没有：`loading` 曾经为真、现在为假 → `true`。
 *
 * 只有真等过的才糊进来：打开时数据已经在手上（缓存、上次拿过）的列表 ⛔ 每开一次糊一次。
 */
export function useArrivedAfterWait(loading: boolean): boolean {
  const [waited, setWaited] = useState(loading)
  if (loading && !waited) setWaited(true)
  return waited && !loading
}

/**
 * 一张列表一直往后接（无限滚动）时，第 `index` 张属于哪一批 —— 返回那一批的起点。
 * 每一批各自从左上往右下错开，⛔ 第 40 张等上 40 步。
 * 列表变短（换筛选、删了几张）就从头记。
 */
export function useRevealBatchStart(count: number): (index: number) => number {
  const [batches, setBatches] = useState({ count, starts: [0] })
  if (batches.count !== count) {
    setBatches(
      count > batches.count
        ? { count, starts: [...batches.starts, batches.count] }
        : { count, starts: [0] },
    )
  }
  const { starts } = batches
  return useCallback(
    (index: number) => {
      for (let i = starts.length - 1; i >= 0; i -= 1) {
        if (starts[i] <= index) return starts[i]
      }
      return 0
    },
    [starts],
  )
}

type RevealElement = 'div' | 'li' | 'span' | 'ul'

const MOTION_ELEMENTS = {
  div: motion.div,
  li: motion.li,
  span: motion.span,
  ul: motion.ul,
} as const

/**
 * 块 / 行 / 文字：挂上时由糊变清（`play` 为假时直接出现）。
 * 用法：骨架与真内容二选一地渲染，真内容外面包它 —— 它挂上的那一刻就是「数据到了」。
 */
export function LoadReveal({
  children,
  play = true,
  step = 0,
  tone = 'list',
  as = 'div',
  className,
  ...rest
}: {
  children: ReactNode
  /** 假 = 直接出现（数据本来就在手上）。通常传 `useArrivedAfterWait(loading)`。 */
  play?: boolean
  /** 错开第几步（`revealStep`）。 */
  step?: number
  tone?: LoadRevealTone
  as?: RevealElement
  className?: string
  role?: string
  'aria-label'?: string
  'data-testid'?: string
}) {
  const reduceMotion = useReducedMotion()
  const animateIn = play && !reduceMotion
  const preset = LOAD_REVEAL[tone]
  const Element = MOTION_ELEMENTS[as]
  return (
    <Element
      {...rest}
      data-load-reveal={animateIn ? 'play' : undefined}
      initial={
        animateIn ? { opacity: 0, filter: `blur(${preset.blurPx}px)` } : false
      }
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{
        duration: preset.durationS,
        ease: EASE_STANDARD,
        delay: animateIn
          ? Math.min(step, preset.maxSteps) * preset.staggerS
          : 0,
      }}
      className={className}
    >
      {children}
    </Element>
  )
}

/**
 * 一直挂着的那一块（下拉菜单里的列表、面板里的一段）：自己盯着 `loading`，等过之后数据一到
 * 就由糊变清地换上来；打开时数据本来就在 → 直接出现。
 * 挂在骨架 / 列表**外面**（两种状态下都挂着），它才看得见「等过」。
 */
export function ArrivalReveal({
  loading,
  children,
  className,
  tone = 'list',
}: {
  loading: boolean
  children: ReactNode
  className?: string
  tone?: LoadRevealTone
}) {
  const arrived = useArrivedAfterWait(loading)
  return (
    <LoadReveal
      // 到了那一刻换 key 重挂：`initial` 只在挂上时生效。
      key={arrived ? 'arrived' : 'waiting'}
      play={arrived}
      tone={tone}
      className={className}
    >
      {children}
    </LoadReveal>
  )
}

/** 每张图挂上的时刻（错开从这里算）。元素卸下就跟着回收。 */
const MOUNTED_AT = new WeakMap<HTMLImageElement, number>()

type MediaRevealPhase = 'waiting' | 'revealing' | 'shown' | 'failed'

/**
 * 图：灰格先占着，图解码好之后在格里由糊变清（14px + 透明 → 清楚，0.5 秒）。
 *
 * ⚠ 已经在缓存里的图（窗口化列表滚回来重挂、查看器翻回上一张）挂上那一刻就是好的
 *   → 直接出真图，⛔ 每滚一次重播一遍。
 * ⚠ 错开从**挂上**那一刻算：图到得晚的，晚掉的那段算进已经等过的错开里，⛔ 再多等。
 *
 * 返回值直接摊到 `<img>` / `next/image` 上（`ref={imageRef}` · `onLoad` · `onError` · `className` · `style`）。
 */
export function useMediaReveal({
  src,
  step = 0,
}: {
  src: string
  step?: number
}) {
  const [phase, setPhase] = useState<{
    src: string
    value: MediaRevealPhase
    delayMs: number
  }>({ src, value: 'waiting', delayMs: 0 })
  if (phase.src !== src) setPhase({ src, value: 'waiting', delayMs: 0 })
  const current = phase.src === src ? phase.value : 'waiting'
  const ref = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return
      if (!image.complete || image.naturalWidth === 0) {
        // 错开从挂上那一刻算：记在元素自己身上，onLoad 时取。
        if (!MOUNTED_AT.has(image)) MOUNTED_AT.set(image, performance.now())
        return
      }
      setPhase((previous) =>
        previous.src === src && previous.value === 'waiting'
          ? { src, value: 'shown', delayMs: 0 }
          : previous,
      )
    },
    [src],
  )

  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const staggerMs =
        Math.min(step, LOAD_REVEAL.media.maxSteps) *
        LOAD_REVEAL.media.staggerS *
        1000
      const mountedAt = MOUNTED_AT.get(event.currentTarget)
      const waitedMs = mountedAt ? performance.now() - mountedAt : 0
      const delayMs = Math.max(0, Math.round(staggerMs - waitedMs))
      setPhase((previous) =>
        previous.src === src && previous.value === 'waiting'
          ? { src, value: 'revealing', delayMs }
          : previous,
      )
    },
    [src, step],
  )

  const onError = useCallback(() => {
    setPhase((previous) =>
      previous.src === src ? { src, value: 'failed', delayMs: 0 } : previous,
    )
  }, [src])

  const style: CSSProperties | undefined =
    current === 'revealing' && phase.delayMs > 0
      ? { transitionDelay: `${phase.delayMs}ms` }
      : undefined

  return {
    phase: current,
    imageRef: ref,
    onLoad,
    onError,
    style,
    className: mediaRevealClassName(current),
  }
}

/** 图在各阶段的样子；`useMediaReveal` 之外（自己管 onLoad 的宿主）也按这一份。 */
export function mediaRevealClassName(phase: MediaRevealPhase): string {
  return cn(
    phase === 'waiting' && 'opacity-0 blur-reveal motion-reduce:blur-none',
    phase === 'revealing' &&
      'transition-[filter,opacity] duration-reveal ease-standard motion-reduce:transition-none',
  )
}
