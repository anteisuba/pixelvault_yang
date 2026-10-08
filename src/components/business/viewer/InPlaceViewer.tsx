'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'

import { ChevronLeft, ChevronRight } from '@/components/icons'
import { DURATION, EASE_STANDARD, SPRING } from '@/constants/motion'
import { cn } from '@/lib/utils'

export interface InPlaceViewerApi {
  /** 缩回当前那一张再放下（关上 / 删除后）。 */
  requestClose: () => void
  /** 菜单、确认框、弹层开着时让它们自己接 Esc 与方向键。 */
  setKeyboardBlocked: (blocked: boolean) => void
  /** 当前那张在可翻那组里的位置（从 0 起）；不在组里（视频 / 音频 / 3D）是 -1。 */
  index: number
  total: number
  hasRail: boolean
}

const InPlaceViewerContext = createContext<InPlaceViewerApi | null>(null)

/** 右栏拿外壳的接口（`requestClose` 等）。只能用在 `InPlaceViewer` 的 children 里。 */
export function useInPlaceViewer(): InPlaceViewerApi {
  const api = useContext(InPlaceViewerContext)
  if (!api)
    throw new Error('useInPlaceViewer must be used inside InPlaceViewer')
  return api
}

interface InPlaceViewerProps<T extends { id: string }> {
  current: T
  /** 能翻的那组（当前已加载、当前筛选结果里的图片）。 */
  items: readonly T[]
  onNavigate: (next: T) => void
  /** 关上的动画演完了：宿主把这一张放下。 */
  onClose: () => void
  /** 对话框的读屏名。 */
  label: string
  /** 瓦片上标着自己 id 的属性名：从那一格长出来、缩回那一格、焦点回到那一格。 */
  tileAttribute: string
  /** 每一件的宽高比（外框按它等比放到最大；翻图时左右邻居也按它摆）。 */
  ratioOf: (item: T) => number
  /** 视频放在深底上。 */
  darkStage?: boolean
  /** 舞台上的那一件（调用方按 id 换 key，换一张就淡入）。 */
  media: ReactNode
  thumbnailOf: (item: T) => string
  thumbLabel: (n: number) => string
  previousLabel: string
  nextLabel: string
  /** 右栏（340）。里面用 `useInPlaceViewer()` 拿 `requestClose` 等接口。 */
  children: ReactNode
  /** 外框的留白（例：画廊 `pt-3` —— 底色铺满容器，查看器本体往下让 12）。 */
  className?: string
}

function tileOf(attribute: string, id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[${attribute}="${CSS.escape(id)}"]`,
  )
}

/**
 * 就地查看器的外壳（素材页 §3「详情」· 画廊「卡片、顶栏与详情」）：盖在作品区上，
 * 从点的那一格长出来（0.3 → 1 + 淡入，320），关上缩回**当前那一张**（240）、焦点
 * 回到它；左边舞台 + 缩略轨，右边 340 由调用方给。与 LoRA 库 B 的样例查看器同一个形。
 *
 * ⚠ 顶栏与侧栏照常可用：⛔ 遮罩、⛔ 锁焦点。Esc 关、← / → 翻（首尾停住不循环）。
 * ⚠ 宿主给一个定好位的容器，这里 `absolute inset-0` 铺满它、底下留 16 与左栏对齐。
 */
export function InPlaceViewer<T extends { id: string }>({
  current,
  items,
  onNavigate,
  onClose,
  label,
  tileAttribute,
  ratioOf,
  darkStage = false,
  media,
  thumbnailOf,
  thumbLabel,
  previousLabel,
  nextLabel,
  children,
  className,
}: InPlaceViewerProps<T>) {
  const reducedMotion = useReducedMotion()
  const frameRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState<string | undefined>(undefined)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const [keyboardBlocked, setKeyboardBlocked] = useState(false)

  const index = items.findIndex((item) => item.id === current.id)
  const total = items.length
  const hasRail = index >= 0 && total > 1
  const canPrev = hasRail && index > 0
  const canNext = hasRail && index < total - 1

  /** 那一格的中心（相对外框）；那一格不在眼前就是外框中心。 */
  const originFor = useCallback(
    (id: string): string => {
      const frame = frameRef.current
      if (!frame) return 'center'
      // 原点相对查看器本体：外框的上下留白不算。
      const style = getComputedStyle(frame)
      const frameBox = frame.getBoundingClientRect()
      const top = frameBox.top + parseFloat(style.paddingTop)
      const width = frameBox.width
      const height = frameBox.bottom - parseFloat(style.paddingBottom) - top
      const tile = tileOf(tileAttribute, id)
      if (tile) {
        const rect = tile.getBoundingClientRect()
        const x = rect.left + rect.width / 2 - frameBox.left
        const y = rect.top + rect.height / 2 - top
        if (x >= 0 && y >= 0 && x <= width && y <= height) {
          return `${x}px ${y}px`
        }
      }
      return `${width / 2}px ${height / 2}px`
    },
    [tileAttribute],
  )

  // 从点的那一格长出来：第一帧画之前就把原点落到那一格上。
  const openedIdRef = useRef(current.id)
  useLayoutEffect(() => {
    frameRef.current?.style.setProperty(
      '--in-place-viewer-origin',
      originFor(openedIdRef.current),
    )
  }, [originFor])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setOrigin(originFor(current.id))
    setClosing(true)
  }, [current.id, originFor])

  const finishClose = useCallback(() => {
    tileOf(tileAttribute, current.id)
      ?.querySelector('button')
      ?.focus({ preventScroll: true })
    onClose()
  }, [current.id, onClose, tileAttribute])

  useEffect(() => {
    if (closing || keyboardBlocked) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target instanceof Element ? event.target : null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]',
        )
      ) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
      } else if (event.key === 'ArrowLeft' && canPrev) {
        event.preventDefault()
        onNavigate(items[index - 1])
      } else if (event.key === 'ArrowRight' && canNext) {
        event.preventDefault()
        onNavigate(items[index + 1])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    canNext,
    canPrev,
    closing,
    index,
    items,
    keyboardBlocked,
    onNavigate,
    requestClose,
  ])

  // 缩略轨：当前那一张滚到中间。
  useEffect(() => {
    railRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [index, reducedMotion])

  const fade = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' as const }
    : closing
      ? { duration: 0.24, ease: EASE_STANDARD }
      : { duration: DURATION.slow, ease: EASE_STANDARD }

  return (
    <div ref={frameRef} className={cn('absolute inset-0 pb-4', className)}>
      {/* 底色跟着长出来一起淡入：作品在底下被慢慢盖住，关上时再露出来。 */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1, transition: fade }}
        className="absolute inset-0 bg-surface-workbench"
      />
      <motion.div
        role="dialog"
        aria-label={label}
        data-testid="in-place-viewer"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
        animate={
          closing
            ? reducedMotion
              ? { opacity: 0, transition: fade }
              : { opacity: 0, scale: 0.3, transition: fade }
            : { opacity: 1, scale: 1, transition: fade }
        }
        onAnimationComplete={() => {
          if (closingRef.current) finishClose()
        }}
        style={{
          transformOrigin: origin ?? 'var(--in-place-viewer-origin, center)',
        }}
        className="relative flex h-full overflow-hidden rounded-2xl bg-card shadow-overlay"
      >
        {/* ─── 左：舞台 ─── */}
        <div className="relative flex min-w-0 flex-1 flex-col bg-surface-workbench">
          <div className="flex min-h-0 flex-1 flex-col px-17.5 pb-2 pt-5.5">
            <ViewerReel
              current={current}
              items={hasRail ? items : [current]}
              index={hasRail ? index : 0}
              ratioOf={ratioOf}
              darkStage={darkStage}
              media={media}
              thumbnailOf={thumbnailOf}
              onNavigate={onNavigate}
            />
          </div>
          {hasRail ? (
            <>
              <button
                type="button"
                onClick={() => canPrev && onNavigate(items[index - 1])}
                disabled={!canPrev}
                aria-label={previousLabel}
                className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground/75 shadow-float transition-[color,opacity] duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => canNext && onNavigate(items[index + 1])}
                disabled={!canNext}
                aria-label={nextLabel}
                className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card text-foreground/75 shadow-float transition-[color,opacity] duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <motion.div
                ref={railRef}
                layoutScroll
                className="studio-scrollbar shrink-0 overflow-x-auto px-4 pb-3.5 pt-2.5"
              >
                <div className="mx-auto flex w-max gap-1.5">
                  {items.map((item, i) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={thumbLabel(i + 1)}
                      aria-current={i === index ? 'true' : undefined}
                      onClick={() => onNavigate(item)}
                      className={cn(
                        'relative h-11.5 w-8.5 shrink-0 rounded-md transition-opacity duration-fast ease-linear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        i === index
                          ? 'opacity-100'
                          : 'opacity-55 hover:opacity-80',
                      )}
                    >
                      <span className="block size-full overflow-hidden rounded-md bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 缩略轨是一排 34px 小图，走派生缩略图直链。 */}
                        <img
                          src={thumbnailOf(item)}
                          alt=""
                          loading="lazy"
                          draggable={false}
                          className="size-full object-cover"
                        />
                      </span>
                      {/* 当前那一圈黑框是同一个元素，翻图时弹簧滑到下一格（原型 AC）。 */}
                      {i === index ? (
                        <motion.span
                          aria-hidden
                          layoutId={`${tileAttribute}:thumb-ring`}
                          transition={
                            reducedMotion ? { duration: 0 } : SPRING.slot
                          }
                          className="pointer-events-none absolute -inset-1 rounded-lg border-2 border-foreground"
                        />
                      ) : null}
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          ) : null}
        </div>

        {/* ─── 右：调用方的 340 ─── */}
        <aside className="flex w-85 shrink-0 flex-col gap-3.5 py-4">
          <InPlaceViewerContext.Provider
            value={{ requestClose, setKeyboardBlocked, index, total, hasRail }}
          >
            {children}
          </InPlaceViewerContext.Provider>
        </aside>
      </motion.div>
    </div>
  )
}

/** 邻居离当前那张多远（舞台宽度的比例）、缩多少、淡多少（原型 AC）。 */
const REEL_STEP = 0.5
const REEL_NEIGHBOR_SCALE = 0.78
const REEL_NEIGHBOR_OPACITY = 0.45
/** 有邻居时当前那张最多占舞台宽的这么多，两边露出邻居。 */
const REEL_CURRENT_MAX_WIDTH = 0.62
/** 只摆当前左右各两张，再远的不挂。 */
const REEL_REACH = 2

/**
 * 舞台（原型 AC「点开后左右切」，owner 2026-10-08 定「滑过去」）：当前那张居中，左右邻居
 * 缩小变淡露一点边；翻图时每一张都是同一个元素，按离当前的距离弹簧滑到新位置 ——
 * 下一张从右边滑进来，这一张缩着滑到左边。点邻居 = 翻到它。
 * 邻居只铺缩略图；当前那张在缩略图上面盖真正的媒体（视频 / 音频 / 3D）。
 */
function ViewerReel<T extends { id: string }>({
  current,
  items,
  index,
  ratioOf,
  darkStage,
  media,
  thumbnailOf,
  onNavigate,
}: {
  current: T
  items: readonly T[]
  index: number
  ratioOf: (item: T) => number
  darkStage: boolean
  media: ReactNode
  thumbnailOf: (item: T) => string
  onNavigate: (next: T) => void
}) {
  const reducedMotion = useReducedMotion()
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () =>
      setArea({ width: el.clientWidth, height: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const hasNeighbors = items.length > 1
  const maxWidth = area.width * (hasNeighbors ? REEL_CURRENT_MAX_WIDTH : 1)
  const spring = reducedMotion ? { duration: 0 } : SPRING.slot

  return (
    <div ref={areaRef} className="relative min-h-0 flex-1">
      {items.map((item, i) => {
        const offset = i - index
        if (Math.abs(offset) > REEL_REACH) return null
        // 还没量到舞台（首帧 / 测试环境）：只摆当前那张、铺满。
        const measured = area.width > 0 && area.height > 0
        if (!measured && offset !== 0) return null
        const isCurrent = item.id === current.id
        const ratio = ratioOf(item) || 1
        const width = Math.min(maxWidth, area.height * ratio)
        const height = width / ratio
        const far = Math.min(1, Math.abs(offset))
        return (
          <motion.div
            key={item.id}
            initial={false}
            animate={{
              x: offset * area.width * REEL_STEP,
              scale: 1 - far * (1 - REEL_NEIGHBOR_SCALE),
              opacity:
                Math.abs(offset) >= REEL_REACH
                  ? 0
                  : 1 - far * (1 - REEL_NEIGHBOR_OPACITY),
            }}
            transition={spring}
            style={
              measured
                ? {
                    width,
                    height,
                    left: (area.width - width) / 2,
                    top: (area.height - height) / 2,
                  }
                : { inset: 0 }
            }
            className={cn(
              'absolute overflow-hidden rounded-lg shadow-overlay',
              darkStage && isCurrent ? 'bg-foreground' : 'bg-muted',
              !isCurrent && 'cursor-pointer',
            )}
            onClick={isCurrent ? undefined : () => onNavigate(item)}
            aria-hidden={isCurrent ? undefined : true}
          >
            {isCurrent ? (
              <>
                {/* 邻居滑成当前那一下，真图淡入前先垫着同一张缩略图，⛔ 闪一下灰。 */}
                {hasNeighbors ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 同上，垫底的缩略图。
                  <img
                    src={thumbnailOf(item)}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : null}
                <div className="relative size-full">{media}</div>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- 邻居只是露一点边的缩略图。
              <img
                src={thumbnailOf(item)}
                alt=""
                draggable={false}
                className="size-full object-cover"
              />
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
