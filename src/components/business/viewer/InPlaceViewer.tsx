'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'

import { ChevronLeft, ChevronRight } from '@/components/icons'
import { DURATION, EASE_STANDARD, SPRING } from '@/constants/motion'
import { PhoneViewer } from '@/components/business/viewer/PhoneViewer'
import { InPlaceViewerContext } from '@/components/business/viewer/in-place-viewer-context'
import { cn } from '@/lib/utils'

export {
  useInPlaceViewer,
  type InPlaceViewerApi,
} from '@/components/business/viewer/in-place-viewer-context'

export interface InPlaceViewerProps<T extends { id: string }> {
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
  /**
   * 手机（<768）：整屏看图，左右滑翻张、往下拉关上，右栏那份内容变成底部上滑的信息页
   * （`PhoneViewer`）。由宿主按 `useIsMobile()` 传进来 —— 查看器自己量会先按电脑画一帧。
   */
  phone?: boolean
}

function tileOf(attribute: string, id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[${attribute}="${CSS.escape(id)}"]`,
  )
}

/**
 * 查看器（ui-spec §9「查看器 `Viewer`」）：居中浮窗，背后 `scrim`；大卡（圆角 24，
 * 素档白、暗房 `float`）里左缩略轨、中间大图 + 左右翻、右边 340 由调用方给。
 * 从点的那一格长出来（0.3 → 1 + 淡入，320），关上缩回**当前那一张**（240）、焦点
 * 回到它。Esc / 点遮罩关、← / → 翻（首尾停住不循环）。手机整屏（`PhoneViewer`）。
 *
 * ⚠ 自己挂到 `body` 上：宿主那一列带 transform（素材页的大河跟着文件夹栏平移），
 *   `fixed` 写在里面会被它截住。开着时页面不滚、留着滚动条那一道。
 */
export function InPlaceViewer<T extends { id: string }>(
  props: InPlaceViewerProps<T>,
) {
  if (props.phone) return <PhoneViewer {...props} />
  return <StageViewer {...props} />
}

function StageViewer<T extends { id: string }>({
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

  /** 那一格的中心（相对大卡）；那一格不在屏幕里就是大卡中心。 */
  const originFor = useCallback(
    (id: string): string => {
      const card = frameRef.current
      if (!card) return 'center'
      const box = card.getBoundingClientRect()
      const tile = tileOf(tileAttribute, id)
      if (tile) {
        const rect = tile.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        if (
          cx >= 0 &&
          cy >= 0 &&
          cx <= window.innerWidth &&
          cy <= window.innerHeight
        ) {
          return `${cx - box.left}px ${cy - box.top}px`
        }
      }
      return `${box.width / 2}px ${box.height / 2}px`
    },
    [tileAttribute],
  )

  // 开着时页面不滚（留着滚动条那一道，底下的格子不挪），关上原样放开。
  useLayoutEffect(() => {
    const html = document.documentElement
    const previous = {
      overflow: html.style.overflow,
      scrollbarGutter: html.style.scrollbarGutter,
    }
    html.style.scrollbarGutter = 'stable'
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = previous.overflow
      html.style.scrollbarGutter = previous.scrollbarGutter
    }
  }, [])

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
      block: 'center',
      inline: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  }, [index, reducedMotion])

  const fade = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' as const }
    : closing
      ? { duration: 0.24, ease: EASE_STANDARD }
      : { duration: DURATION.slow, ease: EASE_STANDARD }

  const arrowClass =
    'absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-raise text-ink-2 shadow-soft transition-[color,opacity] duration-fast hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-40'

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* 遮罩跟着长出来一起淡入，关上时再淡出；点它 = 关。 */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1, transition: fade }}
        onClick={requestClose}
        className="absolute inset-0 bg-scrim"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10">
        <motion.div
          ref={frameRef}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          data-testid="in-place-viewer"
          data-float
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
          className="pointer-events-auto relative flex size-full max-w-7xl overflow-hidden rounded-24 bg-popover shadow-pop"
        >
          {/* ─── 左：缩略轨 ─── 当前那一圈黑框翻图时弹簧滑到下一格（原型 AC）。 */}
          {hasRail ? (
            <motion.div
              ref={railRef}
              layoutScroll
              className="studio-scrollbar flex w-16 shrink-0 flex-col items-center gap-1.5 overflow-y-auto py-4"
            >
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={thumbLabel(i + 1)}
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => onNavigate(item)}
                  className={cn(
                    'relative h-11.5 w-8.5 shrink-0 rounded-md transition-opacity duration-fast ease-linear focus-visible:outline-none focus-visible:shadow-focus',
                    i === index ? 'opacity-100' : 'opacity-55 hover:opacity-80',
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
                  {i === index ? (
                    <motion.span
                      aria-hidden
                      layoutId={`${tileAttribute}:thumb-ring`}
                      transition={reducedMotion ? { duration: 0 } : SPRING.slot}
                      className="pointer-events-none absolute -inset-1 rounded-lg border-2 border-foreground"
                    />
                  ) : null}
                </button>
              ))}
            </motion.div>
          ) : null}

          {/* ─── 中：舞台 ─── 裁掉滑到两边的邻居，⛔ 盖到右边配方栏上。 */}
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col px-16 py-6">
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
                  className={cn(arrowClass, 'left-4')}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => canNext && onNavigate(items[index + 1])}
                  disabled={!canNext}
                  aria-label={nextLabel}
                  className={cn(arrowClass, 'right-4')}
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </>
            ) : null}
          </div>

          {/* ─── 右：调用方的 340 ─── */}
          <aside className="flex w-85 shrink-0 flex-col gap-3.5 py-4">
            <InPlaceViewerContext.Provider
              value={{
                requestClose,
                setKeyboardBlocked,
                index,
                total,
                hasRail,
              }}
            >
              {children}
            </InPlaceViewerContext.Provider>
          </aside>
        </motion.div>
      </div>
    </div>,
    document.body,
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
              'absolute overflow-hidden rounded-12',
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
