'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  SHELL_NAV_TOOLS,
  activeShellTool,
  type ShellNavItem,
} from '@/constants/navigation'
import { SHELL_MOTION } from '@/constants/motion'
import {
  STUDIO_SHELL_BENCH_IDS,
  STUDIO_SHELL_SWIPE,
  type StudioShellBenchId,
} from '@/constants/studio-shell'
import { ChevronLeft, X } from '@/components/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useStudioOperatorHistoryView } from '@/hooks/use-studio-operator-history'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { Link, useRouter } from '@/i18n/navigation'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
import { shellEnter, shellLeave } from '@/lib/studio-shell-motion'
import {
  studioBenchHref,
  studioConversationHref,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/** 台条上的五个台，按 `STUDIO_SHELL_BENCH_IDS` 的顺序。 */
const BENCH_ITEMS: readonly ShellNavItem[] = STUDIO_SHELL_BENCH_IDS.flatMap(
  (id) => SHELL_NAV_TOOLS.filter((item) => item.id === id),
)

const BAR_BUTTON_CLASS =
  'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4 [&>svg]:shrink-0'

const RAIL_BUTTON_CLASS =
  'flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4.5'

function benchIndex(id: string | undefined): number {
  return STUDIO_SHELL_BENCH_IDS.indexOf(id as StudioShellBenchId)
}

export function activeBenchId(pathname: string): string | undefined {
  return activeShellTool(pathname)?.id
}

/**
 * 台的「推」与「滑」（第 9f 步 9f-4）：
 * - 推：从只有对话到开着台，整一栏台从右边推进来；收台时先退出去再换地址。
 * - 滑：换台时旧台往反方向滑走一小拍（`slideOutS`）再换地址，新台从它在台条上的方向
 *   滑进来（`slideS`）。地址不是从台条换的（后退、列表里点了别的对话）就只有进来那一段。
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
    if (column && !reduceMotion) {
      await shellLeave(column, { x: '100%' }, SHELL_MOTION.pushS)
    }
    router.push(studioConversationHref(sessionId))
    restoreIfStuck(previous, { bench: true, id: activeId }, leaving, column)
  }, [activeId, columnRef, reduceMotion, router, sessionId])

  /** 换台：旧台先往反方向滑走，再换地址（新台进来那一段在上面的 effect 里）。 */
  const switchBench = useCallback(
    async (item: ShellNavItem) => {
      if (item.id === activeId || leaving.current) return
      const href = studioBenchHref(item.href, sessionId)
      const content = contentRef.current
      leaving.current = true
      if (content && !reduceMotion) {
        const dir = benchIndex(item.id) >= benchIndex(activeId) ? 1 : -1
        await shellLeave(
          content,
          { x: -dir * SHELL_MOTION.slideOffsetPx, opacity: 0 },
          SHELL_MOTION.slideOutS,
        )
      }
      router.push(href)
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
      if (scrollsSideways(event.target, content, deltaX)) {
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

/** 从手指底下往上到台框，有没有一层还能往这个方向横着滚。 */
function scrollsSideways(
  target: EventTarget | null,
  root: HTMLElement,
  deltaX: number,
): boolean {
  let node = target instanceof Element ? target : null
  while (node && node !== root) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') {
        const atStart = node.scrollLeft <= 0
        const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1
        if ((deltaX < 0 && !atStart) || (deltaX > 0 && !atEnd)) return true
      }
    }
    node = node.parentElement
  }
  return false
}

/**
 * 台顶那一条（台开着，≥1024）：左「‹ 对话名」（对话收起时）、中间五个台、右「收起台」。
 */
export function StudioBenchBar({
  activeId,
  conversationHidden,
  onExpandConversation,
  onSwitch,
  onClose,
}: {
  activeId: string | undefined
  conversationHidden: boolean
  onExpandConversation: () => void
  onSwitch: (item: ShellNavItem) => void
  onClose: () => void
}) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const tOperator = useTranslations('StudioOperator')
  const history = useStudioOperatorHistoryView()
  const { sessionId } = useStudioOperatorState()
  const session = history?.sessions.find((item) => item.id === sessionId)
  const title = session
    ? (deriveAssistantConversationTitle(session.title) ??
      tOperator('history.untitled'))
    : t('backToChat')

  return (
    <nav
      aria-label={t('benches')}
      data-testid="studio-bench-rail"
      data-placement="top"
      className="hidden h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-2 desk:flex"
    >
      {conversationHidden ? (
        <button
          type="button"
          aria-label={t('backToChat')}
          title={title}
          data-testid="studio-shell-expand-chat"
          onClick={onExpandConversation}
          className={cn(BAR_BUTTON_CLASS, 'mr-1 max-w-48 pl-1.5')}
        >
          <ChevronLeft />
          <span className="truncate">{title}</span>
        </button>
      ) : null}
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none">
        {BENCH_ITEMS.map((item) => {
          const Icon = item.icon
          const label = tAll(item.labelKey)
          const active = item.id === activeId
          return (
            <Link
              key={item.id}
              href={studioBenchHref(item.href, sessionId)}
              aria-current={active ? 'page' : undefined}
              data-bench={item.id}
              onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return
                event.preventDefault()
                onSwitch(item)
              }}
              className={cn(
                BAR_BUTTON_CLASS,
                active && 'bg-muted font-medium text-foreground',
              )}
            >
              <Icon />
              {label}
            </Link>
          )
        })}
      </div>
      <BarTip label={t('closeBench')}>
        <button
          type="button"
          aria-label={t('closeBench')}
          data-testid="studio-shell-close-bench"
          onClick={onClose}
          className={cn(BAR_BUTTON_CLASS, 'ml-auto size-8 justify-center px-0')}
        >
          <X />
        </button>
      </BarTip>
    </nav>
  )
}

/** 没开台时贴在右边的那一条（竖着）：点哪个台，那个台从右边推进来。 */
export function StudioBenchRail() {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const { sessionId } = useStudioOperatorState()

  return (
    <nav
      aria-label={t('benches')}
      data-testid="studio-bench-rail"
      data-placement="side"
      className="order-last hidden w-12 shrink-0 flex-col items-center gap-1 py-2 desk:flex"
    >
      {BENCH_ITEMS.map((item) => {
        const Icon = item.icon
        const label = tAll(item.labelKey)
        return (
          <BarTip key={item.id} label={label} side="left">
            <Link
              href={studioBenchHref(item.href, sessionId)}
              aria-label={label}
              data-bench={item.id}
              className={RAIL_BUTTON_CLASS}
            >
              <Icon />
            </Link>
          </BarTip>
        )
      })}
    </nav>
  )
}

function BarTip({
  label,
  side = 'bottom',
  children,
}: {
  label: string
  side?: 'left' | 'bottom'
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
