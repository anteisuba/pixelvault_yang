'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  SHELL_NAV_TOOLS,
  STUDIO_LIBRARY_ITEMS,
  activeShellTool,
  type ShellNavItem,
} from '@/constants/navigation'
import { SHELL_MOTION } from '@/constants/motion'
import {
  STUDIO_LIBRARY_TAB_IDS,
  STUDIO_SHELL_BENCH_IDS,
  STUDIO_SHELL_SWIPE,
  studioLibraryPath,
  type StudioLibraryCategoryId,
  type StudioShellBenchId,
} from '@/constants/studio-shell'
import { StudioOperatorCurrentAvatar } from '@/components/business/studio/assistant-operator/StudioOperatorAvatarSwitcher'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIntentPrefetch } from '@/hooks/use-intent-prefetch'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { Link, useRouter } from '@/i18n/navigation'
import { shellEnter, shellLeave } from '@/lib/studio-shell-motion'
import {
  studioBenchHref,
  studioConversationHref,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/** 台条上的几个台，按 `STUDIO_SHELL_BENCH_IDS` 的顺序。 */
const BENCH_ITEMS: readonly ShellNavItem[] = STUDIO_SHELL_BENCH_IDS.flatMap(
  (id) => SHELL_NAV_TOOLS.filter((item) => item.id === id),
)

/** 台条上的一格（样件 E S01 / S02）：图标在上、台名在下，当前那一格浅灰底。 */
const RAIL_BUTTON_CLASS =
  'flex w-13 flex-col items-center gap-0.5 rounded-12 py-1.5 text-2xs text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus [&>svg]:size-4.5'

const RAIL_ACTIVE_CLASS = 'bg-muted font-medium text-foreground'

/** 左栏「工作台」弹出来那一条：只有图标的竖胶囊（用户 10-25 图一）。 */
const PICKER_BUTTON_CLASS =
  'flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus [&>svg]:size-4.5'

const PICKER_ACTIVE_CLASS = 'bg-fill-strong text-foreground'

function benchIndex(id: string | undefined): number {
  return STUDIO_SHELL_BENCH_IDS.indexOf(id as StudioShellBenchId)
}

export function activeBenchId(pathname: string): string | undefined {
  return activeShellTool(pathname)?.id
}

/**
 * 台的「推」与「滑」（第 9f 步 9f-4）：
 * - 推：从只有对话到开着台，整一栏台从右边推进来；收台时先退出去再换地址（退的同时先把
 *   对话页取好，退完一换就到）。
 * - 滑：换台时旧台往反方向滑走一小拍（`slideOutS`），**同时**换地址 —— 滑走和取新台并行，
 *   ⛔ 先滑完再去取（10-26 实测串行要多等一整段）。新台从它在台条上的方向滑进来（`slideS`）。
 *   地址不是从台条换的（后退、列表里点了别的对话）就只有进来那一段。
 * ⚠ 动的是 transform / opacity；进场都在 layout effect 里起，⛔ 先闪一帧到位的样子。
 */
export function useStudioBenchMotion({
  bench,
  activeId,
  columnRef,
  contentRef,
}: {
  bench: boolean
  activeId: string | undefined
  columnRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
}) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { sessionId } = useStudioOperatorState()
  const previous = useRef<{ bench: boolean; id: string | undefined } | null>(
    null,
  )
  const leaving = useRef(false)

  useLayoutEffect(() => {
    const before = previous.current
    previous.current = { bench, id: activeId }
    leaving.current = false
    const column = columnRef.current
    const content = contentRef.current
    if (!before || !bench || !column || !content) return
    if (reduceMotion) {
      column.style.transform = ''
      content.style.transform = ''
      content.style.opacity = ''
      return
    }
    if (!before.bench) {
      content.style.opacity = ''
      content.style.transform = ''
      shellEnter(column, { x: '100%' }, SHELL_MOTION.pushS)
      return
    }
    if (before.id === activeId) return
    const dir = benchIndex(activeId) >= benchIndex(before.id) ? 1 : -1
    shellEnter(
      content,
      { x: dir * SHELL_MOTION.slideOffsetPx, opacity: 0 },
      SHELL_MOTION.slideS,
    )
  }, [activeId, bench, columnRef, contentRef, reduceMotion])

  /** 收台：先往右退出去，再回到只有对话。 */
  const closeBench = useCallback(async () => {
    const column = columnRef.current
    if (leaving.current) return
    leaving.current = true
    const href = studioConversationHref(sessionId)
    router.prefetch(href)
    if (column && !reduceMotion) {
      await shellLeave(column, { x: '100%' }, SHELL_MOTION.pushS)
    }
    router.push(href)
    restoreIfStuck(previous, { bench: true, id: activeId }, leaving, column)
  }, [activeId, columnRef, reduceMotion, router, sessionId])

  /** 换台：旧台往反方向滑走、同时换地址（新台进来那一段在上面的 effect 里）。 */
  const switchBench = useCallback(
    async (item: ShellNavItem) => {
      if (item.id === activeId || leaving.current) return
      const href = studioBenchHref(item.href, sessionId)
      const content = contentRef.current
      leaving.current = true
      router.push(href)
      if (content && !reduceMotion) {
        const dir = benchIndex(item.id) >= benchIndex(activeId) ? 1 : -1
        await shellLeave(
          content,
          { x: -dir * SHELL_MOTION.slideOffsetPx, opacity: 0 },
          SHELL_MOTION.slideOutS,
        )
      }
      restoreIfStuck(previous, { bench: true, id: activeId }, leaving, content)
    },
    [activeId, contentRef, reduceMotion, router, sessionId],
  )

  return { closeBench, switchBench }
}

/**
 * 先动了、地址却没换成（跳转被拦、点的就是当前这一页）：过一会儿还停在原处就放回来，
 * ⛔ 台一直空着 / 一直在屏幕外。
 */
function restoreIfStuck(
  previous: RefObject<{ bench: boolean; id: string | undefined } | null>,
  from: { bench: boolean; id: string | undefined },
  leaving: RefObject<boolean>,
  element: HTMLElement | null,
) {
  window.setTimeout(() => {
    const now = previous.current
    if (!element || !now || now.bench !== from.bench || now.id !== from.id)
      return
    leaving.current = false
    element.style.transform = ''
    element.style.opacity = ''
  }, STUCK_RESTORE_MS)
}

/** 换地址一般几百毫秒内落定；过了这么久还在原处就当没换成。 */
const STUCK_RESTORE_MS = 2000

/**
 * 两指横滑换台（桌面触控板，9f-4）：一次手势只换一格；台里本来能横着滚的地方先让它自己滚。
 * ⛔ 画布台（两指滑是平移画布，owner 10-24）。
 */
export function useStudioBenchSwipe({
  contentRef,
  activeId,
  enabled,
  onSwitch,
}: {
  contentRef: RefObject<HTMLDivElement | null>
  activeId: string | undefined
  enabled: boolean
  onSwitch: (item: ShellNavItem) => void
}) {
  const onSwitchRef = useRef(onSwitch)
  useEffect(() => {
    onSwitchRef.current = onSwitch
  }, [onSwitch])

  useEffect(() => {
    const content = contentRef.current
    if (!content || !enabled || activeId === 'canvas') return
    let total = 0
    let fired = false
    let idle: number | undefined

    const onWheel = (event: WheelEvent) => {
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        total = 0
        fired = false
      }, STUDIO_SHELL_SWIPE.idleMs)
      if (fired || event.ctrlKey) return
      const { deltaX, deltaY } = event
      if (Math.abs(deltaX) < Math.abs(deltaY) * STUDIO_SHELL_SWIPE.dominance)
        return
      if (scrollsSideways(event.target, content)) {
        total = 0
        return
      }
      total += deltaX
      if (Math.abs(total) < STUDIO_SHELL_SWIPE.thresholdPx) return
      fired = true
      const next = BENCH_ITEMS[benchIndex(activeId) + (total > 0 ? 1 : -1)]
      total = 0
      if (next) onSwitchRef.current(next)
    }

    content.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      content.removeEventListener('wheel', onWheel)
      window.clearTimeout(idle)
    }
  }, [activeId, contentRef, enabled])
}

/**
 * 从手指底下往上到台框，有没有一层能横着滚。⚠ 滚到头也算（用户 10-25：在「出过的图」那一排
 * 滑到头就换了台）—— 手指在横排上，这一下就归横排。
 */
function scrollsSideways(
  target: EventTarget | null,
  root: HTMLElement,
): boolean {
  let node = target instanceof Element ? target : null
  while (node && node !== root) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}

/**
 * 台条（ui-spec §1 / §9「切台」）：开着台时竖着浮在白板右边、上下居中（盖在台上，⛔ 单独占一列；
 * 平时收成一道细线，鼠标移过去才浮出） —— 图片 · LoRA ·
 * 视频 · 3D · 画布，同时只开一个台。⛔ 台顶上的切换条、⛔ 台标题。首页也摆（用户 10-26：左栏
 * 不再有「工作台」）。点别的 = 换台（滑过去），点当前那颗 = 收台。
 */
export function StudioBenchRail({
  activeId,
  onSwitch,
  onClose,
}: {
  activeId?: string
  onSwitch?: (item: ShellNavItem) => void
  onClose?: () => void
}) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const { sessionId } = useStudioOperatorState()
  const intent = useIntentPrefetch()

  return (
    <nav
      aria-label={t('benches')}
      data-testid="studio-bench-rail"
      // 浮在台上面、⛔ 单独占一列（用户 10-25）；平时只留右边缘一道细线，鼠标移过去 / 键盘
      // 走到才浮出那张白卡（用户 10-25 ①：浮着的卡挡住了图片台右边那列工具）。外层点不着，
      // 点得着的只有细线那一条感应区和浮出来的卡。
      className="group/rail pointer-events-none absolute inset-y-0 right-0 z-20 hidden items-center desk:flex"
    >
      <span
        aria-hidden
        data-testid="studio-bench-rail-handle"
        className="pointer-events-auto absolute inset-y-1/3 right-0 flex w-4 items-center justify-center"
      >
        <span className="h-12 w-1 rounded-full bg-ink-2 opacity-40 transition-opacity duration-base ease-standard group-hover/rail:opacity-0 group-focus-within/rail:opacity-0 motion-reduce:transition-none" />
      </span>
      <div className="pointer-events-none mr-3 flex translate-x-2 flex-col gap-0.5 rounded-16 bg-raise p-1.5 opacity-0 shadow-soft transition duration-base ease-standard group-hover/rail:pointer-events-auto group-hover/rail:translate-x-0 group-hover/rail:opacity-100 group-focus-within/rail:pointer-events-auto group-focus-within/rail:translate-x-0 group-focus-within/rail:opacity-100 motion-reduce:transition-none">
        {BENCH_ITEMS.map((item) => {
          const Icon = item.icon
          const label = tAll(item.labelKey)
          const active = item.id === activeId
          return (
            <BarTip key={item.id} label={active ? t('closeBench') : label}>
              <Link
                href={studioBenchHref(item.href, sessionId)}
                prefetch={false}
                {...intent(studioBenchHref(item.href, sessionId))}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                data-bench={item.id}
                onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) return
                  if (active && onClose) {
                    event.preventDefault()
                    onClose()
                    return
                  }
                  if (activeId && onSwitch) {
                    event.preventDefault()
                    onSwitch(item)
                  }
                }}
                className={cn(RAIL_BUTTON_CLASS, active && RAIL_ACTIVE_CLASS)}
              >
                <Icon />
                <span aria-hidden>{label}</span>
              </Link>
            </BarTip>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * 左栏「工作台」点开的那一条（用户 10-25）：竖着一排台图标，点一个进那个台；
 * 当前开着的那颗再点 = 收台、回到对话。
 */
export function StudioBenchPicker({
  activeId,
  onPicked,
}: {
  activeId?: string
  onPicked?: () => void
}) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const { sessionId } = useStudioOperatorState()

  return (
    <nav
      aria-label={t('benches')}
      data-testid="studio-bench-picker"
      className="flex flex-col gap-1 rounded-full bg-raise p-1 shadow-soft"
    >
      {BENCH_ITEMS.map((item) => {
        const Icon = item.icon
        const label = tAll(item.labelKey)
        const active = item.id === activeId
        const href = active
          ? studioConversationHref(sessionId)
          : studioBenchHref(item.href, sessionId)
        return (
          <BarTip
            key={item.id}
            label={active ? t('closeBench') : label}
            side="right"
          >
            <Link
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              data-bench={item.id}
              onClick={onPicked}
              className={cn(PICKER_BUTTON_CLASS, active && PICKER_ACTIVE_CLASS)}
            >
              <Icon />
            </Link>
          </BarTip>
        )
      })}
    </nav>
  )
}

/** 库的那几样（左栏「库」弹出的那一排，用户 10-25）：LoRA · 酒馆 · 标签 · 音色。 */
const LIBRARY_PICKER_ITEMS = STUDIO_LIBRARY_TAB_IDS.flatMap((id) =>
  STUDIO_LIBRARY_ITEMS.filter((item) => item.id === id),
)

/**
 * 左栏「库」点开的那一条（用户 10-25：跟「工作台」一样，点一下出一排）：竖排图标，点一个进那个库。
 * 库开着时换一个 = 换叠层里那一页，⛔ 多压一层历史。
 */
export function StudioLibraryPicker({
  activeId,
  replace,
  onPicked,
}: {
  activeId: StudioLibraryCategoryId | null
  /** 库已经开着：换一个用 replace。 */
  replace: boolean
  onPicked?: () => void
}) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()

  return (
    <nav
      aria-label={t('library')}
      data-testid="studio-library-picker"
      className="flex flex-col gap-1 rounded-full bg-raise p-1 shadow-soft"
    >
      {LIBRARY_PICKER_ITEMS.map((item) => {
        const Icon = item.icon
        const label = tAll(item.labelKey)
        const active = item.id === activeId
        return (
          <BarTip key={item.id} label={label} side="right">
            <Link
              href={studioLibraryPath(item.id as StudioLibraryCategoryId)}
              replace={replace}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              data-library={item.id}
              onClick={onPicked}
              className={cn(PICKER_BUTTON_CLASS, active && PICKER_ACTIVE_CLASS)}
            >
              <Icon />
            </Link>
          </BarTip>
        )
      })}
    </nav>
  )
}

/**
 * 对话收起时（用户 10-25 ① A）：助手头像落在台的左上角，再点展开。点哪颗收、点同一颗开 ——
 * 对话头里那颗飞过来（Motion `layoutId`）。台顶那一行（`data-bench-header`）同一拍往右让位，
 * 头像按那一行的实际位置摆：上下居中、左边对齐它让位前的起点（`--bench-header-inset`），
 * 各台那一行高低不一也对得齐（用户 10-25：「不在一个平行线上」）。找不到那一行就退回板头位置。
 */
export function StudioShellExpandChat({ onExpand }: { onExpand: () => void }) {
  const t = useTranslations('StudioShell')
  const ref = useRef<HTMLButtonElement>(null)
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const button = ref.current
    const host = button?.offsetParent
    if (!button || !(host instanceof HTMLElement)) return
    const place = () => {
      const row = host.querySelector<HTMLElement>('[data-bench-header]')
      if (!row) {
        setSpot(null)
        return
      }
      const hostRect = host.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      const inset =
        Number.parseFloat(
          getComputedStyle(row).getPropertyValue('--bench-header-inset'),
        ) || 0
      setSpot({
        top:
          rowRect.top -
          hostRect.top +
          (rowRect.height - button.offsetHeight) / 2,
        left: rowRect.left - hostRect.left + inset,
      })
    }
    place()
    if (typeof ResizeObserver === 'undefined') return
    // 对话往左收的那一拍台在挪、白板没变大小：盯着那一行自己（它跟着台变宽）。
    const observer = new ResizeObserver(place)
    observer.observe(host)
    const row = host.querySelector<HTMLElement>('[data-bench-header]')
    if (row) observer.observe(row)
    // 宽度不变的那一行（画布左上角那颗药丸）只是被挪过来：收完那一拍的过渡结束再摆一次。
    host.addEventListener('transitionend', place)
    return () => {
      observer.disconnect()
      host.removeEventListener('transitionend', place)
    }
  }, [])

  return (
    <BarTip label={t('expandChat')} side="right">
      <button
        ref={ref}
        type="button"
        aria-label={t('expandChat')}
        data-testid="studio-shell-expand-chat"
        onClick={onExpand}
        style={spot ?? undefined}
        className="absolute top-2.5 left-3 z-20 hidden size-8 rounded-full transition-transform duration-fast ease-standard active:scale-96 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none desk:block"
      >
        <StudioOperatorCurrentAvatar fly />
      </button>
    </BarTip>
  )
}

function BarTip({
  label,
  side = 'left',
  children,
}: {
  label: string
  side?: 'left' | 'right'
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
