/**
 * 「从按钮位置长到正中」（owner 2026-10-08「提示与弹窗」第 2 题 A；设置页原型 v1 把
 * `QuickSetupDialog` 也归进来）—— 正中弹窗挂上时，从最近一次按下的那一点长出来。
 *
 * 记住最近一次按下的位置（捕获阶段，全站一个监听）；弹窗挂上时如果那一下够新，
 * 就把 tw-animate 的进场 / 退场位移指到那一点：弹窗从那儿缩着出来、长到正中，
 * 关上时缩回那儿。键盘打开（没有新的按下）就在正中原地放大。
 * ⚠ 菜单项触发的（菜单随即关掉、键已经不在了）同样成立：记的是**点**，不是元素。
 * ⚠ `prefers-reduced-motion` 下不指位移（globals.css 也把动画压到 0.01ms）。
 */
const ORIGIN_FRESH_MS = 1000
const ORIGIN_FROM_SCALE = 0.2
let lastPointerDown: { x: number; y: number; at: number } | null = null
let pointerTrackerBound = false

function bindPointerTracker() {
  if (pointerTrackerBound || typeof document === 'undefined') return
  pointerTrackerBound = true
  document.addEventListener(
    'pointerdown',
    (event) => {
      lastPointerDown = {
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
      }
    },
    true,
  )
}

if (typeof document !== 'undefined') bindPointerTracker()

/** 弹窗内容节点挂上时调：把进场 / 退场的位移与缩放指到最近一次按下的那一点。 */
export function growFromLastPointer(node: HTMLElement) {
  const point = lastPointerDown
  if (!point || performance.now() - point.at > ORIGIN_FRESH_MS) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const dx = `${Math.round(point.x - window.innerWidth / 2)}px`
  const dy = `${Math.round(point.y - window.innerHeight / 2)}px`
  node.style.setProperty('--tw-enter-translate-x', dx)
  node.style.setProperty('--tw-enter-translate-y', dy)
  node.style.setProperty('--tw-enter-scale', String(ORIGIN_FROM_SCALE))
  node.style.setProperty('--tw-exit-translate-x', dx)
  node.style.setProperty('--tw-exit-translate-y', dy)
  node.style.setProperty('--tw-exit-scale', String(ORIGIN_FROM_SCALE))
}

/**
 * 开：弹簧那一档（spring-expand，轻微过冲）；关：线性 base 缩回按下的那一点。
 * 盖在 Dialog / AlertDialog 内容自带的 `animate-in` / `animate-out` 上。
 */
export const GROW_FROM_POINTER_CLASS =
  'data-[state=closed]:duration-base data-[state=closed]:ease-in data-[state=open]:duration-spring-expand data-[state=open]:ease-spring-expand'
