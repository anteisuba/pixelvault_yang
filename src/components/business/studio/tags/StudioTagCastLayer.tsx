'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import {
  AnimatePresence,
  animate,
  motion,
  motionValue,
  useReducedMotion,
  useTransform,
  type HTMLMotionProps,
  type MotionValue,
} from 'motion/react'

import { ChatCircleText, Eye, Grid2x2, Type } from '@/components/icons'
import { DURATION, EASE_IN, EASE_STANDARD } from '@/constants/motion'
import {
  findNovelAiInteractionPreset,
  getNovelAiImageDimensions,
  NOVELAI_CHARACTER_GRID_SIZE,
  NOVELAI_V5_MAX_CHARACTERS,
  snapToNovelAiGrid,
  type NovelAiCharacterLayoutMode,
} from '@/constants/novelai'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { cn } from '@/lib/utils'
import type { NovelAiCharacterLayout } from '@/types/novelai'

/** 整体页、指针离开舞台后人物层还亮多久（C 动效表「显 / 隐（自动）」）。 */
const LINGER_MS = 2000
/** 按下后挪过这么远才算拖（轻点只切人）。 */
const DRAG_SLOP_PX = 4
/** 手机长按多久才抬起来拖（轻点只切人，不会误拖）。 */
const LONG_PRESS_MS = 300
/** 结果图的比例与当前选的差在这以内，人物层就贴在那张图上。 */
const RATIO_TOLERANCE = 0.03
/** 人数到这为止全画气泡；再多只画正在编辑那位，其余点上挂小对话标。 */
const ALL_BUBBLES_MAX = 4
/** 空画框离舞台四边的留白；顶上多留一行给左上角那几颗胶囊。 */
const BLANK_INSET_PX = 16
const BLANK_TOP_PX = 48
/** 箭头从点的边上起笔（点的半径 + 一点空）。 */
const ARROW_GAP_PX = 18

type Point = { x: number; y: number }
type Box = { left: number; top: number; width: number; height: number }
/** 一个人在画框里的位置（0–1）。点、气泡、箭头都读这一份，所以它们一起走。 */
type Slot = { x: MotionValue<number>; y: MotionValue<number> }
type Character = NovelAiCharacterLayout['characters'][number]
type LayoutMode = NovelAiCharacterLayoutMode | null | undefined

/** 交给模型时图上的摆法：按分页顺序从左到右等距（实测：顺序 = 左右）。 */
function autoPoint(index: number, count: number): Point {
  return { x: (index + 1) / (count + 1), y: 0.5 }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const percent = (value: number) => `${value * 100}%`

/** 落位：V4.5 吸到格心（provider 只收那 25 个点），V5 夹在画框里。 */
function pinPoint(point: Point, mode: LayoutMode): Point {
  return mode === 'grid'
    ? { x: snapToNovelAiGrid(point.x), y: snapToNovelAiGrid(point.y) }
    : { x: clamp01(point.x), y: clamp01(point.y) }
}

/**
 * 这个人此刻该停在哪：手动 = 存着的位置；交给模型 = 等距；有人正在被拖（`pinned`）时，
 * 其余人钉在等距位置吸格后的点上 —— 松手时就照这样写回去。
 */
function restPoint(
  characters: readonly Character[],
  index: number,
  manual: boolean,
  pinned: boolean,
  mode: LayoutMode,
): Point {
  if (manual) return characters[index].position
  const point = autoPoint(index, characters.length)
  return pinned ? pinPoint(point, mode) : point
}

const sameBox = (a: Box, b: Box) =>
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5

/**
 * 当前比例在舞台**看得见的那一块**里能放多大的空画框（与结果图同一条「放得下的
 * 最大」判据）。⚠ 舞台会滚（手机上空态比可见高度高），按整块内容高度算会把
 * 画框底边推到看不见的地方。
 */
function fitBlankFrame(room: Box, ratio: number): Box {
  const width = Math.max(0, room.width - BLANK_INSET_PX * 2)
  const height = Math.max(0, room.height - BLANK_TOP_PX - BLANK_INSET_PX)
  const frameWidth = Math.min(width, height * ratio)
  const frameHeight = frameWidth / ratio
  return {
    left: room.left + (room.width - frameWidth) / 2,
    top: room.top + BLANK_TOP_PX + (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  }
}

/** 发起方 → 对方的一条弯线（往下兜），端点让开两颗点；坐标是画框里的像素。 */
function relationCurve(a: Point, b: Point, box: Box) {
  const from = { x: a.x * box.width, y: a.y * box.height }
  const to = { x: b.x * box.width, y: b.y * box.height }
  const control = {
    x: (from.x + to.x) / 2,
    y: Math.max(from.y, to.y) + box.height * 0.15,
  }
  const toward = (start: Point, target: Point) => {
    const dx = target.x - start.x
    const dy = target.y - start.y
    const length = Math.hypot(dx, dy) || 1
    return {
      x: start.x + (dx / length) * ARROW_GAP_PX,
      y: start.y + (dy / length) * ARROW_GAP_PX,
    }
  }
  const start = toward(from, control)
  const end = toward(to, control)
  const head = (tip: Point, tail: Point) => {
    const dx = tip.x - tail.x
    const dy = tip.y - tail.y
    const length = Math.hypot(dx, dy) || 1
    const ux = dx / length
    const uy = dy / length
    const baseX = tip.x - ux * 9
    const baseY = tip.y - uy * 9
    return `${tip.x},${tip.y} ${baseX - uy * 4.5},${baseY + ux * 4.5} ${baseX + uy * 4.5},${baseY - ux * 4.5}`
  }
  // 二次贝塞尔 t = 0.5 处 —— 动作名挂在这。
  const middle = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  }
  return {
    d: `M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`,
    endHead: head(end, control),
    startHead: head(start, control),
    middle,
  }
}

type Curve = ReturnType<typeof relationCurve>

/** 两个人之间那条线的某一样（路径 / 箭头 / 中点），跟着两颗点的位置实时算。 */
function useCurve(
  from: Slot,
  to: Slot,
  box: Box,
  pick: (curve: Curve) => string,
): MotionValue<string> {
  return useTransform(
    [from.x, from.y, to.x, to.y],
    ([fromX, fromY, toX, toY]: number[]) =>
      pick(relationCurve({ x: fromX, y: fromY }, { x: toX, y: toY }, box)),
  )
}

function useTiming() {
  const reducedMotion = useReducedMotion()
  return (duration: number, delay = 0, ease = EASE_STANDARD) =>
    reducedMotion ? { duration: 0 } : { duration, delay, ease }
}

/** 一条互动：从发起方画到对方（描边 0 → 满），「互相」两头都有箭头。 */
function CastArrow({
  from,
  to,
  box,
  mutual,
}: {
  from: Slot
  to: Slot
  box: Box
  mutual: boolean
}) {
  const timing = useTiming()
  const d = useCurve(from, to, box, (curve) => curve.d)
  const endHead = useCurve(from, to, box, (curve) => curve.endHead)
  const startHead = useCurve(from, to, box, (curve) => curve.startHead)
  const head = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: timing(DURATION.fast, DURATION.slow),
  }
  return (
    <motion.g
      className="fill-foreground stroke-foreground"
      exit={{ opacity: 0, transition: timing(DURATION.base) }}
    >
      <motion.path
        d={d}
        fill="none"
        strokeWidth={1.5}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={timing(DURATION.slow)}
      />
      <motion.polygon points={endHead} strokeWidth={0} {...head} />
      {mutual ? (
        <motion.polygon points={startHead} strokeWidth={0} {...head} />
      ) : null}
    </motion.g>
  )
}

/** 动作名：黑底小标签，挂在弯线中点。 */
function CastArrowLabel({
  from,
  to,
  box,
  children,
}: {
  from: Slot
  to: Slot
  box: Box
  children: ReactNode
}) {
  const timing = useTiming()
  const left = useCurve(from, to, box, (curve) =>
    percent(box.width ? curve.middle.x / box.width : 0),
  )
  const top = useCurve(from, to, box, (curve) =>
    percent(box.height ? curve.middle.y / box.height : 0),
  )
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={timing(DURATION.fast)}
      className="absolute z-10 h-5.5 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-foreground px-2 text-2xs leading-5.5 text-background"
      style={{ left, top }}
    >
      {children}
    </motion.span>
  )
}

/** 台词气泡：从点上方 .8 → 1 淡入，清空时缩回去；最宽 240，超出省略。 */
function CastBubble({ slot, line }: { slot: Slot; line: string }) {
  const timing = useTiming()
  const left = useTransform(slot.x, percent)
  const top = useTransform(slot.y, (y) => `calc(${percent(y)} - 1.25rem)`)
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        opacity: 0,
        scale: 0.8,
        transition: timing(DURATION.fast, 0, EASE_IN),
      }}
      transition={timing(DURATION.base)}
      className="pointer-events-none absolute z-10 flex max-w-60 origin-bottom -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-xl bg-background/95 px-2.5 py-1.5 text-xs shadow-md ring-1 ring-border"
      style={{ left, top }}
    >
      <ChatCircleText
        className="size-3 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="truncate">{line}</span>
    </motion.span>
  )
}

/** 一个人的点（命中区触屏 44 / 桌面 32，画出来的圆 30）。 */
function CastDot({
  at,
  ...props
}: { at: Slot } & Omit<HTMLMotionProps<'button'>, 'style'>) {
  const timing = useTiming()
  const left = useTransform(at.x, percent)
  const top = useTransform(at.y, percent)
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0, transition: timing(DURATION.fast) }}
      transition={timing(DURATION.base)}
      {...props}
      style={{ left, top }}
    />
  )
}

interface Gesture {
  index: number
  pointerId: number
  x: number
  y: number
  armed: boolean
  started: boolean
  moved: boolean
  cancelled: boolean
  timer: number | null
}

const pillClass =
  'inline-flex h-7.5 items-center gap-1.5 whitespace-nowrap rounded-full bg-background/90 px-3 text-xs ring-1 ring-border'

/**
 * 舞台人物层（NAI 位置关系与台词 C「舞台预演」第 ② 片 · 最小可试版）。
 *
 * 画在上一张图上：量出结果图的位置贴上去；没出过图、或那张图的比例和当前选的不同 →
 * 按当前比例画一个空画框（盖住底下的结果）。在角色页或指针在舞台上时亮着，整体页
 * 指针离开 2s 淡掉，只留左上「人物层 · N 人」；点它 = 关，关了一直关。
 *
 * 点：交给模型 = 虚线点按分页顺序等距；拖任何一个 → 全员变手动（其余人钉在现在的位置），
 * 「回到交给模型」全部滑回；点一下 = 切到他。V4.5 网格常显、松手吸格心；V5 网格线
 * 可开关。⚠ 每个人的位置是一对 motion 值，点、气泡、箭头都读它们 —— 拖动时只改这对值
 * （不 dispatch），松手才写回表单；滑回 / 重新等距时箭头和气泡跟着点一起走。
 *
 * ⚠ 包裹层永远渲染（哪怕当前模型没有角色）：结果区不能因为换模型被卸掉重挂。
 */
export function StudioTagCastStage({
  active,
  children,
}: {
  /** 舞台此刻在看结果（没有开着查资料 / 模板之类的面板）。 */
  active: boolean
  children: ReactNode
}) {
  const t = useTranslations('StudioTags.cast')
  const c = useNovelAiCharacters()
  const { state } = useStudioForm()
  const { isGenerating } = useStudioGen()
  const reducedMotion = useReducedMotion()
  const hostRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const lingerTimer = useRef<number | null>(null)
  /** 已经落过位的人数 —— 多出来的那位是新加的，从画框右缘滑进来。 */
  const placed = useRef(0)

  const [slots] = useState<Slot[]>(() =>
    Array.from({ length: NOVELAI_V5_MAX_CHARACTERS }, () => ({
      x: motionValue(0.5),
      y: motionValue(0.5),
    })),
  )
  const [layerOn, setLayerOn] = useState(true)
  const [hover, setHover] = useState(false)
  const [showGrid, setShowGrid] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  /** 舞台里此刻看得见的那一块（宿主坐标）：`room` 扣掉内边距放画框，`cover` 整块盖住。 */
  const [room, setRoom] = useState<Box | null>(null)
  const [cover, setCover] = useState<Box | null>(null)
  const [imageBox, setImageBox] = useState<Box | null>(null)

  const characters = c.characters
  const count = characters.length
  const mode = c.mode
  const layout = c.layout
  const stored = layout?.positioning === 'manual'
  const manual = stored || dragIndex !== null
  const show = active && Boolean(mode) && count > 0
  const dimensions = getNovelAiImageDimensions(state.aspectRatio)
  const ratio = dimensions.width / dimensions.height

  useLayoutEffect(() => {
    if (!show) return
    const host = hostRef.current
    const results = resultsRef.current
    if (!host || !results) return
    const scroller = host.closest<HTMLElement>('.studio-scroll-area')
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const hostRect = host.getBoundingClientRect()
        let visibleTop = hostRect.top
        let visibleBottom = hostRect.bottom
        // 结果区比舞台高时会溢出宿主、伸进内边距 —— 盖板要盖到舞台可见的下沿。
        let coverTop = hostRect.top
        let coverBottom = hostRect.bottom
        if (scroller) {
          const area = scroller.getBoundingClientRect()
          const style = getComputedStyle(scroller)
          visibleTop = Math.max(
            visibleTop,
            area.top + parseFloat(style.paddingTop),
          )
          visibleBottom = Math.min(
            visibleBottom,
            area.bottom - parseFloat(style.paddingBottom),
          )
          coverTop = Math.max(coverTop, area.top)
          coverBottom = area.bottom
        }
        const nextRoom = {
          left: 0,
          top: visibleTop - hostRect.top,
          width: hostRect.width,
          height: Math.max(0, visibleBottom - visibleTop),
        }
        const nextCover = {
          left: 0,
          top: coverTop - hostRect.top,
          width: hostRect.width,
          height: Math.max(0, coverBottom - coverTop),
        }
        setRoom((previous) =>
          previous && sameBox(previous, nextRoom) ? previous : nextRoom,
        )
        setCover((previous) =>
          previous && sameBox(previous, nextCover) ? previous : nextCover,
        )
        const image = results.querySelector<HTMLImageElement>(
          'img.studio-generation-image',
        )
        const sameRatio =
          image !== null &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0 &&
          Math.abs(image.naturalWidth / image.naturalHeight / ratio - 1) <
            RATIO_TOLERANCE
        if (!image || !sameRatio) {
          setImageBox(null)
          return
        }
        const rect = image.getBoundingClientRect()
        const next = {
          left: rect.left - hostRect.left,
          top: rect.top - hostRect.top,
          width: rect.width,
          height: rect.height,
        }
        setImageBox((previous) =>
          previous && sameBox(previous, next) ? previous : next,
        )
      })
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(host)
    // 结果换了一张、放大缩小、图片刚加载完 —— 都要重新量。⚠ 新图落地带一段
    // `scale(.992) → 1` 的进场（globals.css `.studio-generation-image`），量到的是
    // 动画第一帧的尺寸，所以动画 / 过渡结束时再量一次。
    const mutations = new MutationObserver(measure)
    mutations.observe(results, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'class', 'style'],
    })
    const settled = ['load', 'animationend', 'transitionend'] as const
    for (const type of settled) results.addEventListener(type, measure, true)
    scroller?.addEventListener('scroll', measure, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      mutations.disconnect()
      for (const type of settled)
        results.removeEventListener(type, measure, true)
      scroller?.removeEventListener('scroll', measure)
    }
  }, [show, ratio])

  // 每个人滑到该停的地方（320ms）；正在被拖的那位跟手，不归这里管。
  useLayoutEffect(() => {
    const slide = { duration: DURATION.slow, ease: EASE_STANDARD }
    characters.forEach((_, index) => {
      const slot = slots[index]
      if (!slot || index === dragIndex) return
      const point = restPoint(
        characters,
        index,
        stored,
        dragIndex !== null,
        mode,
      )
      const fresh = index >= placed.current
      if (reducedMotion || (fresh && placed.current === 0)) {
        slot.x.jump(point.x)
        slot.y.jump(point.y)
        return
      }
      if (fresh) {
        slot.x.jump(1)
        slot.y.jump(point.y)
      }
      animate(slot.x, point.x, slide)
      animate(slot.y, point.y, slide)
    })
    placed.current = characters.length
  }, [characters, stored, dragIndex, mode, reducedMotion, slots])

  useEffect(
    () => () => {
      if (lingerTimer.current) window.clearTimeout(lingerTimer.current)
      if (gesture.current?.timer) window.clearTimeout(gesture.current.timer)
    },
    [],
  )

  const onImage = imageBox !== null
  const box = imageBox ?? (room ? fitBlankFrame(room, ratio) : null)
  const visible =
    layerOn && (c.activeIndex !== null || hover || dragIndex !== null)

  /** 写回表单：全员变手动，交给模型时的等距位置成为各自的起点。 */
  const commit = (index: number, point: Point) => {
    if (!layout) return
    c.setLayout({
      ...layout,
      positioning: 'manual',
      characters: characters.map((character, i) => ({
        ...character,
        position:
          i === index
            ? pinPoint(point, mode)
            : restPoint(characters, i, stored, true, mode),
      })),
    })
  }

  const toFramePoint = (event: PointerEvent): Point | null => {
    const host = hostRef.current
    if (!host || !box || box.width === 0 || box.height === 0) return null
    const rect = host.getBoundingClientRect()
    return {
      x: clamp01((event.clientX - rect.left - box.left) / box.width),
      y: clamp01((event.clientY - rect.top - box.top) / box.height),
    }
  }

  const startDrag = (current: Gesture) => {
    current.started = true
    c.select(current.index)
    setDragIndex(current.index)
  }

  const onDotPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const touch = event.pointerType === 'touch'
    const current: Gesture = {
      index,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      armed: !touch && !isGenerating,
      started: false,
      moved: false,
      cancelled: false,
      timer: null,
    }
    if (touch && !isGenerating) {
      // 手机：长按到点才抬起来（之后再挪才是拖）。
      current.timer = window.setTimeout(() => {
        current.timer = null
        if (gesture.current !== current || current.cancelled) return
        current.armed = true
        startDrag(current)
      }, LONG_PRESS_MS)
    }
    gesture.current = current
  }

  const onDotPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.cancelled) return
    const far =
      Math.hypot(event.clientX - current.x, event.clientY - current.y) >
      DRAG_SLOP_PX
    if (!current.started) {
      if (!far) return
      if (!current.armed) {
        // 手机上没等到长按就挪了：既不拖也不切人。
        current.cancelled = true
        return
      }
      startDrag(current)
    }
    if (far) current.moved = true
    if (!current.moved) return
    const point = toFramePoint(event)
    const slot = slots[current.index]
    if (!point || !slot) return
    slot.x.jump(point.x)
    slot.y.jump(point.y)
  }

  const endGesture = () => {
    const current = gesture.current
    gesture.current = null
    if (current?.timer) window.clearTimeout(current.timer)
    setDragIndex(null)
    return current
  }

  const onDotPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    const point = toFramePoint(event)
    const current = endGesture()
    if (!current || current.cancelled) return
    if (current.started) {
      if (current.moved && point) commit(current.index, point)
      return
    }
    c.select(current.index)
  }

  const onDotKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const move = moves[event.key]
    if (!move || isGenerating) return
    event.preventDefault()
    const step = mode === 'grid' ? 1 / NOVELAI_CHARACTER_GRID_SIZE : 0.02
    const from = restPoint(characters, index, stored, true, mode)
    commit(index, { x: from.x + move.x * step, y: from.y + move.y * step })
    c.select(index)
  }

  const onEnter = () => {
    if (lingerTimer.current) window.clearTimeout(lingerTimer.current)
    lingerTimer.current = null
    setHover(true)
  }
  const onLeave = () => {
    if (lingerTimer.current) window.clearTimeout(lingerTimer.current)
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = null
      setHover(false)
    }, LINGER_MS)
  }

  // 互动 → 箭头。「互相」两边各存一条时只画一次。
  const relations: {
    key: string
    from: number
    to: number
    tag: string
    mutual: boolean
  }[] = []
  const seen = new Set<string>()
  characters.forEach((character, from) => {
    for (const interaction of character.interactions ?? []) {
      const to = interaction.target
      if (to < 0 || to >= count || to === from) continue
      const mutual = interaction.mutual === true
      const key = mutual
        ? `${Math.min(from, to)}~${Math.max(from, to)}~${interaction.tag}`
        : `${from}>${to}~${interaction.tag}`
      if (seen.has(key)) continue
      seen.add(key)
      relations.push({ key, from, to, tag: interaction.tag, mutual })
    }
  })
  const actionName = (tag: string) => {
    const preset = findNovelAiInteractionPreset(tag)
    return preset ? t(`actions.${preset.key}`) : tag
  }

  const crowd = count > ALL_BUBBLES_MAX
  const sceneTexts = (state.advancedParams.novelAiSceneTexts ?? []).filter(
    (item) => item.text.trim(),
  )
  const grid = mode === 'grid' || showGrid
  const ghost =
    dragIndex !== null
      ? restPoint(characters, dragIndex, stored, true, mode)
      : null

  return (
    <div
      ref={hostRef}
      className="relative flex min-h-0 flex-1 flex-col"
      onPointerEnter={show ? onEnter : undefined}
      onPointerLeave={show ? onLeave : undefined}
    >
      <div ref={resultsRef} className="contents">
        {children}
      </div>
      {show && box ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* 空画框盖住底下的结果；贴在结果图上时没有底。 */}
          <div
            aria-hidden
            className={cn(
              'absolute inset-x-0 bg-card transition-opacity duration-base ease-standard motion-reduce:transition-none',
              !onImage && visible
                ? 'pointer-events-auto opacity-100'
                : 'opacity-0',
            )}
            style={{ top: cover?.top ?? 0, height: cover?.height ?? '100%' }}
          />
          <div
            inert={!visible}
            className={cn(
              'absolute transition-opacity duration-base ease-standard motion-reduce:transition-none',
              visible ? 'opacity-100' : 'opacity-0',
              !onImage && 'rounded-xl bg-muted ring-1 ring-border ring-inset',
            )}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
            }}
          >
            <svg
              aria-hidden
              className="absolute inset-0 size-full overflow-visible"
              viewBox={`0 0 ${box.width} ${box.height}`}
            >
              {grid
                ? Array.from(
                    { length: NOVELAI_CHARACTER_GRID_SIZE - 1 },
                    (_, line) => {
                      const at = (line + 1) / NOVELAI_CHARACTER_GRID_SIZE
                      return (
                        <g key={line} className="stroke-foreground/15">
                          <line
                            x1={at * box.width}
                            x2={at * box.width}
                            y1={0}
                            y2={box.height}
                          />
                          <line
                            x1={0}
                            x2={box.width}
                            y1={at * box.height}
                            y2={at * box.height}
                          />
                        </g>
                      )
                    },
                  )
                : null}
              <AnimatePresence initial={false}>
                {relations.map((relation) => (
                  <CastArrow
                    key={relation.key}
                    from={slots[relation.from]}
                    to={slots[relation.to]}
                    box={box}
                    mutual={relation.mutual}
                  />
                ))}
              </AnimatePresence>
            </svg>

            <AnimatePresence initial={false}>
              {relations.map((relation) => (
                <CastArrowLabel
                  key={relation.key}
                  from={slots[relation.from]}
                  to={slots[relation.to]}
                  box={box}
                >
                  {actionName(relation.tag)}
                </CastArrowLabel>
              ))}
            </AnimatePresence>

            {/* 气泡：有台词才画；人多时只画正在编辑那位。 */}
            <AnimatePresence initial={false}>
              {characters.map((character, index) => {
                const line = character.dialogue?.trim()
                if (!line || (crowd && c.activeIndex !== index)) return null
                return (
                  <CastBubble
                    key={`bubble-${index}`}
                    slot={slots[index]}
                    line={line}
                  />
                )
              })}
            </AnimatePresence>

            {/* 拖动时原位留一个淡虚影。 */}
            {ghost && dragIndex !== null ? (
              <span
                aria-hidden
                className="absolute grid size-7.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-dashed border-muted-foreground font-mono text-xs font-semibold text-muted-foreground opacity-40"
                style={{ left: percent(ghost.x), top: percent(ghost.y) }}
              >
                {dragIndex + 1}
              </span>
            ) : null}

            <AnimatePresence initial={false}>
              {characters.map((character, index) => {
                const dragging = dragIndex === index
                const editing = c.activeIndex === index
                const badge =
                  crowd && !editing && Boolean(character.dialogue?.trim())
                return (
                  <CastDot
                    key={index}
                    at={slots[index]}
                    aria-label={t('who', { number: index + 1 })}
                    aria-pressed={editing}
                    onPointerDown={(event) => onDotPointerDown(event, index)}
                    onPointerMove={onDotPointerMove}
                    onPointerUp={onDotPointerUp}
                    onPointerCancel={endGesture}
                    onKeyDown={(event) => onDotKeyDown(event, index)}
                    className={cn(
                      'pointer-events-auto absolute grid size-11 -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:size-8',
                      dragging ? 'z-30 cursor-grabbing' : 'z-20',
                      !dragging && !isGenerating && 'cursor-grab',
                    )}
                  >
                    <span
                      className={cn(
                        'relative grid size-7.5 place-items-center rounded-full border-2 font-mono text-xs font-semibold tabular-nums transition-[scale,border-color,color,box-shadow,background-color] duration-fast ease-standard motion-reduce:transition-none',
                        manual
                          ? 'border-foreground bg-background text-foreground shadow-md'
                          : 'border-dashed border-muted-foreground bg-background/90 text-muted-foreground',
                        editing && 'scale-112 ring-4 ring-foreground/10',
                        dragging && 'scale-120 shadow-lg ring-6',
                        character.enabled === false && 'opacity-40',
                      )}
                    >
                      {index + 1}
                      {badge ? (
                        <span
                          role="img"
                          aria-label={t('hasLine')}
                          className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-border"
                        >
                          <ChatCircleText className="size-2.5" aria-hidden />
                        </span>
                      ) : null}
                    </span>
                  </CastDot>
                )
              })}
            </AnimatePresence>

            {/* 画面文字不定位置：画框左上角挂一枚小标签。 */}
            {sceneTexts.length ? (
              <span className="absolute top-2.5 left-2.5 z-20 inline-flex h-6.5 max-w-3/4 items-center gap-1.5 rounded-full bg-background/95 px-2.5 text-xs ring-1 ring-border">
                <Type className="size-3 shrink-0" aria-hidden />
                {t(`sceneKinds.${sceneTexts[0].kind}`)}
                <span className="truncate text-muted-foreground">
                  {sceneTexts[0].text}
                </span>
                {sceneTexts.length > 1 ? (
                  <span className="shrink-0 text-muted-foreground">
                    +{sceneTexts.length - 1}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>

          {/* 左上：人物层开关 · 站位状态 · 网格线（钉在看得见的那一块的左上角）。 */}
          <div
            className="absolute left-0 z-30 flex flex-wrap items-center gap-2"
            style={{ top: room?.top ?? 0 }}
          >
            <button
              type="button"
              aria-pressed={layerOn}
              onClick={() => setLayerOn((on) => !on)}
              className={cn(
                'pointer-events-auto inline-flex h-7.5 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                visible
                  ? 'bg-foreground text-background'
                  : 'bg-background/70 text-muted-foreground ring-1 ring-border',
              )}
            >
              <Eye className="size-3.5" aria-hidden />
              {t('layer', { count })}
            </button>
            <div
              inert={!visible}
              className={cn(
                'flex items-center gap-2 transition-opacity duration-base ease-standard motion-reduce:transition-none',
                visible ? 'opacity-100' : 'opacity-0',
              )}
            >
              {manual ? (
                <button
                  type="button"
                  disabled={isGenerating || !layout}
                  onClick={() =>
                    layout && c.setLayout({ ...layout, positioning: 'auto' })
                  }
                  className={cn(
                    pillClass,
                    'pointer-events-auto transition-colors duration-fast ease-standard hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  <span className="font-semibold">{t('manualStatus')}</span>
                  <span className="text-muted-foreground">
                    · {t('backToAuto')}
                  </span>
                </button>
              ) : (
                <span className={pillClass}>
                  <span className="font-semibold">{t('autoStatus')}</span>
                  <span className="text-muted-foreground">
                    · {t('autoHint')}
                  </span>
                </span>
              )}
              {mode === 'free' ? (
                <button
                  type="button"
                  aria-pressed={showGrid}
                  onClick={() => setShowGrid((on) => !on)}
                  className={cn(
                    pillClass,
                    'pointer-events-auto transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    showGrid
                      ? 'bg-foreground text-background ring-0'
                      : 'hover:bg-muted',
                  )}
                >
                  <Grid2x2 className="size-3.5" aria-hidden />
                  {t('gridLines')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
