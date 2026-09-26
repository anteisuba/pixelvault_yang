'use client'

import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import {
  animate,
  cancelFrame,
  frame,
  motionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from 'motion/react'

import {
  EASE_STANDARD,
  EASE_STANDARD_CSS,
  LIQUID_POPOVER,
  LIQUID_SPRING,
  LIQUID_TIMING,
} from '@/constants/motion'

/**
 * chip 弹层的液态展开（owner 2026-09-26 原型）—— 与助手 / 画布左栏同一族 B：
 * 弹层从 chip 长出来，先横成一条，再往上展开；开着时点另一颗 chip，**同一块形状**
 * 变形过去，旧内容带模糊退、新内容晚一点进（interaction.md §2.1 第一条）。
 *
 * 为什么是一层共享形状而不是给每个弹层自己加 clip-path：变形要从上一颗弹层的
 * 位置走到下一颗，而一个元素的背景画不出它自己的盒子 —— 两颗弹层互不重叠时
 * 形状无处可走。所以：
 * - **形状层**：全页一块空的 fixed 叶子，只画底 / 边 / 投影，几何跟着四根弹簧走。
 *   它没有子节点，改宽高只重排它自己（助手铁律「只裁剪不变尺寸」防的是整棵面板
 *   每帧重排，这里不存在那棵树）。
 * - **弹层本体**（Radix 照常定位）：动着时皮肤透明、按形状矩形裁剪自己的内容；
 *   静止后皮肤回来、裁剪撤掉、形状层隐藏 —— 静止档就是一颗普通弹层，滚动 /
 *   重新定位 / 毛玻璃都照旧，⛔ 动着时不开 backdrop-filter。
 * 形状的底 / 边 / 投影 / 圆角**从弹层自己的计算样式抄**，所以各宿主的皮肤不用
 * 在这里再写一份。
 *
 * 相位靠定时器落定（`LIQUID_POPOVER`），⛔ 不等弹簧 `finished`：后台页 rAF 冻结。
 * 关闭时内容的淡出走 Radix Presence 等 CSS 退场动画那条路（`animate-out`），
 * 所以弹层会多留 90ms 给形状接手。
 */

interface Rect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

interface Skin {
  readonly background: string
  readonly borderColor: string
  readonly boxShadow: string
  readonly radius: number
}

interface Entry {
  readonly el: HTMLElement
  readonly trigger: HTMLElement | null
  readonly skin: Skin
  /** 最近一次量到的布局矩形（弹层本体，border-box）。 */
  rect: Rect | null
  fadeIn: Animation | null
  observer: MutationObserver
  /** 收到 `ref(null)` 后等一个微任务：同一轮提交里又挂回来就不算卸载。 */
  detaching: boolean
}

type Phase = 'hidden' | 'moving' | 'rest' | 'closing'

const x = motionValue(0)
const y = motionValue(0)
const w = motionValue(0)
const h = motionValue(0)
const opacity = motionValue(1)

let shapeEl: HTMLDivElement | null = null
let phase: Phase = 'hidden'
let owner: Entry | null = null
/** 挂上了但 Radix 还没把它定好位（第一帧在屏幕外）。 */
let pending: Entry | null = null
/** 正在淡出的旧弹层 —— 形状走开的这 90ms 里仍按形状裁剪它。 */
const leaving = new Set<Entry>()
let controls: AnimationPlaybackControls[] = []
let timers: ReturnType<typeof setTimeout>[] = []
let restTimer: ReturnType<typeof setTimeout> | null = null
/** 第一拍（横成一条）还没交给第二拍 —— 这期间量到的新尺寸留给第二拍去追。 */
let inStripBeat = false
let looping = false
/** 每段 `animateTo` 一代；落定回调只认自己那一代。 */
let moveGen = 0

const shapeListeners = new Set<() => void>()
function subscribeShape(listener: () => void) {
  shapeListeners.add(listener)
  return () => shapeListeners.delete(listener)
}
const getShapeReady = () => shapeEl !== null

function schedule(ms: number, run: () => void) {
  timers.push(setTimeout(run, ms))
}

function clearBeats() {
  timers.forEach(clearTimeout)
  timers = []
  controls.forEach((control) => control.stop())
  controls = []
  inStripBeat = false
}

function clearRestTimer() {
  if (restTimer) clearTimeout(restTimer)
  restTimer = null
}

function currentRect(): Rect {
  return { left: x.get(), top: y.get(), width: w.get(), height: h.get() }
}

function jumpTo(rect: Rect) {
  x.jump(rect.left)
  y.jump(rect.top)
  w.jump(rect.width)
  h.jump(rect.height)
}

/** 新一段从当前位置与速度接着走（连点不从头播）。 */
function animateTo(
  rect: Rect,
  spring: (typeof LIQUID_SPRING)[keyof typeof LIQUID_SPRING],
) {
  moveGen += 1
  controls = [
    animate(x, rect.left, spring),
    animate(y, rect.top, spring),
    animate(w, rect.width, spring),
    animate(h, rect.height, spring),
  ]
}

/** 展开这一段弹簧落定就切静止档；落不定（后台页）由 `scheduleRest` 兜底。 */
function restWhenSettled() {
  const gen = moveGen
  void Promise.all(controls.map((control) => control.finished)).then(() => {
    if (gen === moveGen) toRest()
  })
}

/** 横成的那一条贴在靠 chip 的那一边（弹层朝上开 = 底边）。 */
function stripOf(rect: Rect, side: string | undefined): Rect {
  const height = Math.min(LIQUID_POPOVER.stripPx, rect.height)
  return {
    left: rect.left,
    width: rect.width,
    height,
    top: side === 'bottom' ? rect.top : rect.top + rect.height - height,
  }
}

function toRect(dom: DOMRect): Rect {
  return {
    left: dom.left,
    top: dom.top,
    width: dom.width,
    height: dom.height,
  }
}

/** Radix 定好位之前把弹层放在 `translate(0, -200%)`（屏幕外）。 */
function positionedRect(entry: Entry): Rect | null {
  const wrapper = entry.el.parentElement
  if (!wrapper?.hasAttribute('data-radix-popper-content-wrapper')) return null
  if (wrapper.style.transform.includes('-200%')) return null
  return toRect(entry.el.getBoundingClientRect())
}

function sameRect(a: Rect, b: Rect, sizeOnly = false) {
  const close = (p: number, q: number) => Math.abs(p - q) < 0.5
  return (
    close(a.width, b.width) &&
    close(a.height, b.height) &&
    (sizeOnly || (close(a.left, b.left) && close(a.top, b.top)))
  )
}

function applySkin(skin: Skin) {
  if (!shapeEl) return
  shapeEl.style.background = skin.background
  shapeEl.style.borderColor = skin.borderColor
  shapeEl.style.boxShadow = skin.boxShadow
  shapeEl.style.borderRadius = `${skin.radius}px`
}

function paintShape() {
  if (!shapeEl) return
  const shape = currentRect()
  shapeEl.style.transform = `translate(${shape.left}px, ${shape.top}px)`
  shapeEl.style.width = `${Math.max(0, shape.width)}px`
  shapeEl.style.height = `${Math.max(0, shape.height)}px`
  shapeEl.style.opacity = String(opacity.get())
}

/** 露出来的同一帧就摆到位 —— ⛔ 不先露一帧上次停下的地方。 */
function showShape() {
  if (!shapeEl) return
  paintShape()
  shapeEl.style.visibility = 'visible'
}

function hideShape() {
  if (shapeEl) shapeEl.style.visibility = ''
}

/** 弹层本体按形状矩形裁自己 —— 形状之外的内容一律不露。 */
function clipTo(entry: Entry, shape: Rect) {
  const rect = entry.rect
  if (!rect) return
  const top = shape.top - rect.top
  const left = shape.left - rect.left
  const right = rect.left + rect.width - (shape.left + shape.width)
  const bottom = rect.top + rect.height - (shape.top + shape.height)
  entry.el.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${entry.skin.radius}px)`
}

function paint() {
  if (pending) {
    const rect = positionedRect(pending)
    if (rect) start(pending, rect)
  } else if (owner?.rect) {
    const rect = positionedRect(owner)
    if (rect && !sameRect(rect, owner.rect)) retarget(owner, rect)
  }

  const shape = currentRect()
  if (phase === 'moving' || phase === 'closing') paintShape()
  if (owner && phase === 'moving') clipTo(owner, shape)
  leaving.forEach((entry) => clipTo(entry, shape))

  if (phase === 'hidden' && !pending && !owner && leaving.size === 0) {
    cancelFrame(paint)
    looping = false
  }
}

function ensureLoop() {
  if (looping) return
  looping = true
  frame.render(paint, true)
}

function scheduleRest() {
  clearRestTimer()
  restTimer = setTimeout(toRest, LIQUID_POPOVER.restFallbackMs)
}

function toRest() {
  clearRestTimer()
  if (pending) {
    // 一帧都没来过（后台页 rAF 冻结）：跳过动画直接落到静止档，⛔ 不留一颗
    // 被裁成 `inset(50%)` 的隐形弹层。
    const rect = positionedRect(pending)
    if (!rect) {
      scheduleRest()
      return
    }
    pending.fadeIn?.cancel()
    owner = pending
    owner.rect = rect
    pending = null
    clearBeats()
    phase = 'moving'
  }
  if (!owner || phase !== 'moving') return
  owner.el.dataset.liquid = 'rest'
  owner.el.style.clipPath = ''
  hideShape()
  phase = 'rest'
}

function fadeIn(entry: Entry, delayS: number, durationS: number) {
  entry.fadeIn?.cancel()
  if (typeof entry.el.animate !== 'function') return
  entry.fadeIn = entry.el.animate(
    [
      { opacity: 0, filter: `blur(${LIQUID_TIMING.blurPx}px)` },
      { opacity: 1, filter: 'blur(0px)' },
    ],
    {
      delay: delayS * 1000,
      duration: durationS * 1000,
      easing: EASE_STANDARD_CSS,
      fill: 'backwards',
    },
  )
}

function start(entry: Entry, rect: Rect) {
  pending = null
  const morph = phase !== 'hidden'
  owner = entry
  entry.rect = rect
  clearBeats()
  applySkin(entry.skin)
  opacity.jump(1)
  phase = 'moving'

  if (morph) {
    // 同一块形状从上一颗弹层（或正在缩回的那条）走到这一颗。上一颗若是静止档，
    // 形状此刻是藏着的、停在它的位置上 —— 原地露出来再走。
    showShape()
    animateTo(rect, LIQUID_SPRING.unfold)
    restWhenSettled()
    fadeIn(entry, LIQUID_TIMING.swapInDelayS, LIQUID_TIMING.swapInS)
  } else {
    const side = entry.el.dataset.side
    const chip = entry.trigger?.getBoundingClientRect()
    jumpTo(chip ? toRect(chip) : stripOf(rect, side))
    showShape()
    inStripBeat = true
    animateTo(stripOf(rect, side), LIQUID_SPRING.strip)
    schedule(LIQUID_TIMING.unfoldDelayS * 1000, () => {
      inStripBeat = false
      if (!owner?.rect) return
      animateTo(owner.rect, LIQUID_SPRING.unfold)
      restWhenSettled()
    })
    fadeIn(entry, LIQUID_TIMING.popoverInDelayS, LIQUID_TIMING.popoverInS)
  }
  scheduleRest()
}

/** 开着时尺寸变了（例：最近素材加载完）—— 形状跟着长，⛔ 不是一跳。 */
function retarget(entry: Entry, rect: Rect) {
  const previous = entry.rect
  entry.rect = rect
  if (phase === 'rest') {
    // 只挪了位置（窗口缩放）：静止档的弹层自己会跟，不必动形状。
    if (!previous || sameRect(previous, rect, true)) return
    jumpTo(previous)
    applySkin(entry.skin)
    showShape()
    entry.el.dataset.liquid = 'moving'
    phase = 'moving'
  }
  if (inStripBeat) return
  animateTo(rect, LIQUID_SPRING.unfold)
  restWhenSettled()
  scheduleRest()
}

function open(entry: Entry) {
  // 上一颗正在缩回：先停在原地，等这一颗定好位再从这里变形过去。
  if (phase === 'closing') clearBeats()
  leaving.delete(entry)
  if (owner && owner !== entry) {
    owner.el.dataset.liquid = 'moving'
    leaving.add(owner)
  }
  if (owner === entry) owner = null
  entry.el.dataset.liquid = 'moving'
  // 定好位之前什么都不露；定好位那一帧由 `paint` 接手。
  entry.el.style.clipPath = 'inset(50%)'
  pending = entry
  ensureLoop()
  scheduleRest()
}

function close(entry: Entry) {
  entry.fadeIn?.cancel()
  entry.fadeIn = null
  if (pending === entry) pending = null
  if (owner !== entry) {
    leaving.add(entry)
    return
  }
  owner = null
  if (phase === 'rest' && entry.rect) {
    jumpTo(entry.rect)
    applySkin(entry.skin)
    showShape()
  }
  entry.el.dataset.liquid = 'moving'
  leaving.add(entry)
  clearBeats()
  clearRestTimer()
  phase = 'closing'
  ensureLoop()

  const side = entry.el.dataset.side
  const beat = LIQUID_TIMING.retractDelayS * 1000
  schedule(beat, () =>
    animateTo(stripOf(currentRect(), side), LIQUID_SPRING.retract),
  )
  schedule(beat + LIQUID_TIMING.retractSecondBeatDelayS * 1000, () => {
    const chip = entry.trigger?.isConnected
      ? toRect(entry.trigger.getBoundingClientRect())
      : null
    if (chip) animateTo(chip, LIQUID_SPRING.retract)
    controls.push(
      animate(opacity, 0, {
        duration: LIQUID_POPOVER.dissolveS,
        ease: EASE_STANDARD,
      }),
    )
  })
  schedule(LIQUID_POPOVER.closeMs, () => {
    if (phase !== 'closing') return
    hideShape()
    phase = 'hidden'
  })
}

function readSkin(el: HTMLElement): Skin {
  const style = getComputedStyle(el)
  return {
    background: style.backgroundColor,
    borderColor: style.borderTopColor,
    boxShadow: style.boxShadow,
    radius: Number.parseFloat(style.borderTopLeftRadius) || 0,
  }
}

/**
 * 一个元素只登记一份。Radix 在弹层挂载的那几毫秒里会把 ref 反复摘了又挂
 * （`PopoverContent` 的组合 ref 每次渲染都是新的），每次都当新弹层处理的话，
 * 第二次量到的皮肤已经是 `moving` 下的透明色。
 */
const registry = new WeakMap<HTMLElement, Entry>()

function register(el: HTMLElement): Entry | null {
  const known = registry.get(el)
  if (known) {
    known.detaching = false
    return known
  }
  if (!el.parentElement?.hasAttribute('data-radix-popper-content-wrapper')) {
    return null // 手机抽屉那一支：不做液态。
  }
  const entry: Entry = {
    el,
    trigger: el.id
      ? document.querySelector<HTMLElement>(`[aria-controls="${el.id}"]`)
      : null,
    // ⚠ 必须在标记 moving（皮肤变透明）之前量。
    skin: readSkin(el),
    rect: null,
    fadeIn: null,
    detaching: false,
    observer: new MutationObserver(() => {
      if (el.dataset.state === 'open') open(entry)
      else close(entry)
    }),
  }
  entry.observer.observe(el, {
    attributes: true,
    attributeFilter: ['data-state'],
  })
  registry.set(el, entry)
  if (el.dataset.state === 'open') open(entry)
  return entry
}

function release(entry: Entry) {
  entry.detaching = true
  queueMicrotask(() => {
    if (!entry.detaching) return
    registry.delete(entry.el)
    entry.observer.disconnect()
    if (owner === entry || pending === entry) close(entry)
    leaving.delete(entry)
  })
}

function attachShape(el: HTMLDivElement | null) {
  shapeEl = el
  if (!el) {
    clearBeats()
    clearRestTimer()
    phase = 'hidden'
    owner = null
    pending = null
    leaving.clear()
  }
  shapeListeners.forEach((listener) => listener())
}

/**
 * 全页那一块共享形状。宿主（有液态 chip 的那一处）挂一次；没挂就没有液态，
 * 弹层退回普通开合。
 */
const noopSubscribe = () => () => {}

export function LiquidPopoverLayer() {
  // 服务端没有 document —— 水合完再挂 portal。
  const onClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  if (!onClient) return null
  return createPortal(
    <div
      ref={attachShape}
      aria-hidden
      data-liquid-popover-shape=""
      className="pointer-events-none invisible fixed left-0 top-0 z-50 border"
    />,
    document.body,
  )
}

interface LiquidPopoverProps {
  /** 传给弹层本体的 `ref`。 */
  attach?: (el: HTMLDivElement | null) => void
  className?: string
  style?: CSSProperties
}

const NO_LIQUID: LiquidPopoverProps = {}

/**
 * 动着时本体的皮肤让给形状层；进场动画关掉（形状就是进场）；退场只留一下模糊
 * 淡出（`animate-out` 读这几个变量），⛔ 不缩放 —— 缩放是形状的事。
 * ⚠ `transition-none` 不能省：弹层底座带 `duration-*` 却没写 `transition-property`
 * （初始值 = `all`），于是皮肤从透明切回来要渐变 200ms、每帧改的裁剪也被拖慢 ——
 * 形状一藏、皮肤还没回来，就是打开后「闪一下」（owner 2026-09-26 报）。
 */
const LIQUID_CONTENT_CLASS =
  'transition-none data-[state=open]:animate-none data-[liquid=moving]:border-transparent data-[liquid=moving]:bg-transparent data-[liquid=moving]:shadow-none data-[liquid=moving]:backdrop-blur-none'

const LIQUID_CONTENT_STYLE = {
  '--tw-exit-scale': '1',
  '--tw-exit-blur': `${LIQUID_TIMING.blurPx}px`,
  '--tw-animation-duration': `${LIQUID_TIMING.contentOutS * 1000}ms`,
} as CSSProperties

/**
 * 给一个 Radix 弹层本体接上液态。`requested` 由宿主按 chip 外观给（底部输入框
 * 那一行才要）；`prefers-reduced-motion`、没挂形状层、手机抽屉时都退回普通弹层。
 * 返回值整包展开到 `PopoverContent` / `ResponsivePopoverContent` 上（className
 * 与 style 需要和宿主自己的合并）。
 */
export function useLiquidPopover(requested: boolean): LiquidPopoverProps {
  const reducedMotion = useReducedMotion()
  const shapeReady = useSyncExternalStore(
    subscribeShape,
    getShapeReady,
    () => false,
  )
  /**
   * ⚠ 不用 React 19 的 ref 清理返回值：`PopoverContent` 把外面传进来的 ref 包在
   * 自己的回调里转一手（`assignRef`），返回值被丢掉，拿到的是老式的 `ref(null)`。
   * 两种调用法都按「同一个元素只登记一次」处理 —— 否则同一颗弹层会登记两份，
   * 旧的那份留在 `leaving` 里、按过期的矩形一直裁它。
   */
  const entryRef = useRef<Entry | null>(null)
  const attach = useCallback((el: HTMLDivElement | null) => {
    const current = entryRef.current
    if (current?.el === el) {
      current.detaching = false
      return
    }
    if (current) release(current)
    entryRef.current = el ? register(el) : null
  }, [])
  if (!requested || reducedMotion || !shapeReady) return NO_LIQUID
  return {
    attach,
    className: LIQUID_CONTENT_CLASS,
    style: LIQUID_CONTENT_STYLE,
  }
}
