'use client'

import {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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
import { StudioOperatorCurrentAvatar } from '@/features/assistant'
import { STUDIO_SHELL_AVATAR_ATTR } from '@/components/business/studio/shell/StudioShellAvatarFlight'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { useRouter } from '@/i18n/navigation'
import { shellEnter, shellLeave } from '@/lib/studio-shell-motion'
import {
  studioBenchHref,
  studioConversationHref,
} from '@/lib/studio-shell-route'

/** 外壳左栏「工作台」那一组的几个台，按 `STUDIO_SHELL_BENCH_IDS` 的顺序（两指滑换台也按它）。 */
export const STUDIO_SHELL_BENCH_ITEMS: readonly ShellNavItem[] =
  STUDIO_SHELL_BENCH_IDS.flatMap((id) =>
    SHELL_NAV_TOOLS.filter((item) => item.id === id),
  )

/**
 * 左栏的台那几颗借台框里的「推 / 滑」（owner 11-04：台的入口搬进左栏）：左栏在台框外面，
 * 台框（`StudioShellStage`）挂上时把这两样登记进来；没登记（设置等页的左栏）就照常跳地址。
 */
export interface StudioBenchNav {
  switchBench(item: ShellNavItem): void
  closeBench(): void
}

export const StudioBenchNavContext =
  createContext<RefObject<StudioBenchNav | null> | null>(null)

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
      const next =
        STUDIO_SHELL_BENCH_ITEMS[benchIndex(activeId) + (total > 0 ? 1 : -1)]
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
 * 对话收起时（用户 10-25 ① A）：助手头像落在台的左上角，再点展开。点哪颗收、点同一颗开 ——
 * 对话头里那颗飞过来（`StudioShellAvatarFlight`，落点照这里同一套算法算）。台顶那一行（`data-bench-header`）同一拍往右让位，
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
    <BarTip label={t('expandChat')}>
      <button
        ref={ref}
        type="button"
        aria-label={t('expandChat')}
        data-testid="studio-shell-expand-chat"
        {...{ [STUDIO_SHELL_AVATAR_ATTR]: 'bench' }}
        onClick={onExpand}
        style={spot ?? undefined}
        className="absolute top-2.5 left-3 z-20 hidden size-8 rounded-full transition-transform duration-fast ease-standard active:scale-96 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none lg:block"
      >
        <StudioOperatorCurrentAvatar />
      </button>
    </BarTip>
  )
}

function BarTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
