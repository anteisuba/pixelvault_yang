'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react'
import { useTranslations } from 'next-intl'

import { DURATION, EASE_STANDARD, SPRING } from '@/constants/motion'
import { InPlaceViewerContext } from '@/components/business/viewer/in-place-viewer-context'
import type { InPlaceViewerProps } from '@/components/business/viewer/InPlaceViewer'
import { useBackToClose } from '@/hooks/use-back-to-close'
import { cn } from '@/lib/utils'

/** 左右两张之间的缝（滑的时候看得见下一张的边）。 */
const REEL_GAP = 16
/** 横着拖过屏宽的这么多、或者甩得够快，就翻到下一张。 */
const SWIPE_DISTANCE_RATIO = 0.2
const SWIPE_VELOCITY = 500
/** 往下拉这么多（或甩下去）= 关上；往上推这么多 = 拉出信息页。 */
const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 600
const OPEN_INFO_DISTANCE = 60
/** 往下拉时大图跟着缩、底色跟着淡（拉到这么远到底）。 */
const PULL_RANGE = 320
/** 信息页拉满占屏高的这么多（上面留一截大图，知道自己还在看这张）。 */
const SHEET_MAX_RATIO = 0.88
/** 量到之前先按这个高度露（≈ 把手 + 标题行 + 动作行）。 */
const DEFAULT_PEEK = 132
/** 动作行下面再露一点白，⛔ 贴着屏幕底边切。 */
const PEEK_TAIL = 14
const INSTANT = { duration: 0 }

function tileCenter(attribute: string, id: string): string | null {
  const tile = document.querySelector<HTMLElement>(
    `[${attribute}="${CSS.escape(id)}"]`,
  )
  if (!tile) return null
  const rect = tile.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
    return null
  }
  return `${x}px ${y}px`
}

/**
 * 手机看图（owner 2026-10-14「像 App 一样：看的时候是全屏的图或视频，信息滑动查看」）：
 * 整屏是这一张，从点的那一格长出来、关上缩回当前那一格；左右滑翻张（同一个元素滑过去，
 * 原型 AC）、往下拉关上（拉着走时大图跟着缩、底色跟着淡）；电脑右边 340 那份内容原样
 * 放进底部信息页 —— 平时只露标题行和动作行（做同款 · 收藏 / 赞 · 下载 …），往上推或点
 * 把手拉满再看配方。素材、画廊、我的主页共用。
 */
export function PhoneViewer<T extends { id: string }>({
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
  children,
}: InPlaceViewerProps<T>) {
  const t = useTranslations('MobileViewer')
  const reducedMotion = useReducedMotion()
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const [origin, setOrigin] = useState(
    () => tileCenter(tileAttribute, current.id) ?? 'center',
  )
  const [keyboardBlocked, setKeyboardBlocked] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const index = items.findIndex((item) => item.id === current.id)
  const total = items.length
  const hasRail = index >= 0 && total > 1
  const canPrev = hasRail && index > 0
  const canNext = hasRail && index < total - 1

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setOrigin(tileCenter(tileAttribute, current.id) ?? 'center')
    setExpanded(false)
    setClosing(true)
  }, [current.id, tileAttribute])

  const finishClose = useCallback(() => {
    document
      .querySelector<HTMLElement>(
        `[${tileAttribute}="${CSS.escape(current.id)}"]`,
      )
      ?.focus({ preventScroll: true })
    onClose()
  }, [current.id, onClose, tileAttribute])

  // 系统返回手势：信息页拉满时先收回，再按一次关大图（⛔ 直接离开整页）。
  useBackToClose(!closing, requestClose)
  useBackToClose(expanded && !closing, () => setExpanded(false))

  // 开着时底下的页面不跟着滚。
  useEffect(() => {
    const html = document.documentElement
    const previous = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = previous
    }
  }, [])

  // 接了实体键盘也照电脑：Esc 关、← / → 翻。
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

  // ─── 屏幕与信息页的尺寸 ───
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const safeBottomRef = useRef<HTMLDivElement>(null)
  const [screenHeight, setScreenHeight] = useState(0)
  const [peek, setPeek] = useState(DEFAULT_PEEK)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => setScreenHeight(root.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // 露出的高度 = 内容第二行（动作行）的底边 + 一点白 + 底部安全区；换一张重新量。
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => {
      const actions = content.children[1]
      if (!(actions instanceof HTMLElement)) return
      const safeBottom = safeBottomRef.current?.offsetHeight ?? 0
      setPeek(actions.offsetTop + actions.offsetHeight + PEEK_TAIL + safeBottom)
    }
    measure()
    const actions = content.children[1]
    if (typeof ResizeObserver === 'undefined' || !actions) return
    // 动作行折行（键上写「✓ 已开始下载」拉长）时跟着重量。
    const observer = new ResizeObserver(measure)
    observer.observe(actions)
    return () => observer.disconnect()
  }, [current.id])

  const sheetHeight = Math.max(
    peek,
    Math.round((screenHeight || window.innerHeight) * SHEET_MAX_RATIO),
  )
  const collapsedY = sheetHeight - peek

  // ─── 信息页：平时只露一截，往上推 / 点把手拉满 ───
  const sheetY = useMotionValue(collapsedY)
  const sheetControls = useDragControls()
  const spring = reducedMotion ? INSTANT : SPRING.slot
  useEffect(() => {
    const controls = animate(sheetY, expanded ? 0 : collapsedY, spring)
    return () => controls.stop()
  }, [collapsedY, expanded, sheetY, spring])
  // 拖把手松手时浏览器还会补一个 click：拖过就不再当成「点一下」切换。
  const sheetDraggedRef = useRef(false)

  const handleSheetDragEnd = (_event: unknown, info: PanInfo) => {
    const y = sheetY.get()
    const next =
      info.velocity.y < -300 ||
      (Math.abs(info.velocity.y) <= 300 && y < collapsedY / 2)
    if (next === expanded) {
      animate(sheetY, next ? 0 : collapsedY, spring)
    } else {
      setExpanded(next)
    }
  }

  const startSheetDrag = (event: ReactPointerEvent) => {
    // 拉满后里面要能滚：只有把手能拖；露一截时整页都能往上推。
    if (expanded) return
    sheetControls.start(event)
  }

  // ─── 大图：左右滑翻张、往下拉关上 ───
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const pullScale = useTransform(dragY, [0, PULL_RANGE], [1, 0.82])
  const pullFade = useTransform(dragY, [0, PULL_RANGE], [1, 0.25])

  const handleStageDragEnd = (_event: unknown, info: PanInfo) => {
    const width = window.innerWidth
    const { offset, velocity } = info
    if (Math.abs(offset.x) > Math.abs(offset.y)) {
      const toNext =
        offset.x < -width * SWIPE_DISTANCE_RATIO || velocity.x < -SWIPE_VELOCITY
      const toPrev =
        offset.x > width * SWIPE_DISTANCE_RATIO || velocity.x > SWIPE_VELOCITY
      if (toNext && canNext) onNavigate(items[index + 1])
      else if (toPrev && canPrev) onNavigate(items[index - 1])
      return
    }
    if (offset.y > DISMISS_DISTANCE || velocity.y > DISMISS_VELOCITY) {
      requestClose()
    } else if (offset.y < -OPEN_INFO_DISTANCE || velocity.y < -SWIPE_VELOCITY) {
      setExpanded(true)
    }
  }

  const fade = reducedMotion
    ? { duration: DURATION.fast, ease: 'linear' as const }
    : closing
      ? { duration: 0.24, ease: EASE_STANDARD }
      : { duration: DURATION.slow, ease: EASE_STANDARD }

  return createPortal(
    <div
      ref={rootRef}
      data-testid="phone-viewer"
      className="fixed inset-0 z-50 overflow-hidden overscroll-contain"
    >
      {/* 底色跟着长出来一起淡入；往下拉时跟着淡，露出底下的网格。 */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1, transition: fade }}
        className="absolute inset-0"
      >
        <motion.div
          style={{ opacity: pullFade }}
          className={cn(
            'size-full',
            darkStage ? 'bg-foreground' : 'bg-surface-workbench',
          )}
        />
      </motion.div>

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
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
        style={{ transformOrigin: origin }}
        className="absolute inset-0"
      >
        {/* ─── 大图 ─── 底边让给信息页露出的那一截，顶上让开刘海。 */}
        <div
          className="absolute inset-x-0 top-0 pt-safe-inset-top"
          style={{ bottom: peek }}
        >
          <motion.div
            drag={!closing}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={{
              left: canNext ? 1 : 0.15,
              right: canPrev ? 1 : 0.15,
              top: 0.15,
              bottom: 1,
            }}
            dragTransition={{
              bounceStiffness: SPRING.slot.stiffness,
              bounceDamping: SPRING.slot.damping,
            }}
            onDragEnd={handleStageDragEnd}
            onTap={() => {
              if (expanded) setExpanded(false)
            }}
            style={{ x: dragX, y: dragY, scale: pullScale }}
            className="relative size-full touch-none"
          >
            <PhoneReel
              current={current}
              items={hasRail ? items : [current]}
              index={hasRail ? index : 0}
              ratioOf={ratioOf}
              darkStage={darkStage}
              media={media}
              thumbnailOf={thumbnailOf}
            />
          </motion.div>
        </div>

        {/* ─── 信息页 ─── 电脑右栏那一份，原样放进来。 */}
        <motion.div
          drag={closing ? false : 'y'}
          dragListener={false}
          dragControls={sheetControls}
          dragConstraints={{ top: 0, bottom: collapsedY }}
          dragElastic={0.08}
          onDragStart={() => {
            sheetDraggedRef.current = true
          }}
          onDragEnd={handleSheetDragEnd}
          style={{ y: sheetY, height: sheetHeight }}
          className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl bg-card shadow-overlay"
        >
          <button
            type="button"
            onPointerDown={(event) => {
              sheetDraggedRef.current = false
              sheetControls.start(event)
            }}
            onClick={() => {
              if (sheetDraggedRef.current) return
              setExpanded((open) => !open)
            }}
            aria-expanded={expanded}
            aria-label={expanded ? t('hideInfo') : t('showInfo')}
            className="flex h-6 w-full shrink-0 touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border" />
          </button>
          <div
            ref={contentRef}
            onPointerDown={startSheetDrag}
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-3.5 pt-1 pb-safe-bottom',
              expanded
                ? 'overflow-y-auto overscroll-contain'
                : 'overflow-hidden',
            )}
          >
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
          </div>
          <div
            ref={safeBottomRef}
            aria-hidden
            className="pointer-events-none absolute h-safe-inset-bottom w-0"
          />
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  )
}

/**
 * 整屏的一排：当前那张按比例放到最大（宽占满或高占满），左右邻居紧挨着摆在屏幕外，
 * 拖的时候露出来；翻张时每一张都是同一个元素，弹簧滑到新位置（原型 AC）。
 * 邻居只铺缩略图，当前那张在缩略图上面盖真正的媒体（视频 / 音频 / 3D）。
 */
function PhoneReel<T extends { id: string }>({
  current,
  items,
  index,
  ratioOf,
  darkStage,
  media,
  thumbnailOf,
}: {
  current: T
  items: readonly T[]
  index: number
  ratioOf: (item: T) => number
  darkStage: boolean
  media: ReactNode
  thumbnailOf: (item: T) => string
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

  const spring = reducedMotion ? INSTANT : SPRING.slot
  const measured = area.width > 0 && area.height > 0

  return (
    <div ref={areaRef} className="relative size-full">
      {items.map((item, i) => {
        const offset = i - index
        if (Math.abs(offset) > 1) return null
        if (!measured && offset !== 0) return null
        const isCurrent = item.id === current.id
        const ratio = ratioOf(item) || 1
        const width = Math.min(area.width, area.height * ratio)
        const height = width / ratio
        return (
          <motion.div
            key={item.id}
            initial={false}
            animate={{ x: offset * (area.width + REEL_GAP) }}
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
              'absolute overflow-hidden',
              darkStage && isCurrent ? 'bg-foreground' : 'bg-muted',
            )}
            aria-hidden={isCurrent ? undefined : true}
          >
            {isCurrent ? (
              <>
                {/* 邻居滑成当前那一下，真图淡入前先垫着同一张缩略图，⛔ 闪一下灰。 */}
                {items.length > 1 ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 垫底的缩略图走派生缩略图直链。
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
              // eslint-disable-next-line @next/next/no-img-element -- 邻居只是拖的时候露出来的缩略图。
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
