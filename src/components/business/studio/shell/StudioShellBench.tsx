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
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
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
 * 台条（ui-spec §1 / §9「切台」）：开着台时竖着贴在白板右边、上下居中 —— 图片 · LoRA ·
 * 视频 · 3D · 画布，同时只开一个台。⛔ 台顶上的切换条、⛔ 台标题。首页不摆（用户 10-25：
 * 一开始交给左栏「工作台」）。点别的 = 换台（滑过去），点当前那颗 = 收台。
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

  return (
    <nav
      aria-label={t('benches')}
      data-testid="studio-bench-rail"
      className="order-last hidden w-18 shrink-0 items-center justify-center desk:flex"
    >
      <div className="flex flex-col gap-0.5 rounded-16 bg-raise p-1.5 shadow-soft">
        {BENCH_ITEMS.map((item) => {
          const Icon = item.icon
          const label = tAll(item.labelKey)
          const active = item.id === activeId
          return (
            <BarTip key={item.id} label={active ? t('closeBench') : label}>
              <Link
                href={studioBenchHref(item.href, sessionId)}
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
        return (
          <BarTip
            key={item.id}
            label={active ? t('closeBench') : label}
            side="right"
          >
            <Link
              href={
                active
                  ? studioConversationHref(sessionId)
                  : studioBenchHref(item.href, sessionId)
              }
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

/**
 * 对话收起时（ui-spec §1）：助手头像浮到台的左上角，再点展开。
 */
export function StudioShellExpandChat({ onExpand }: { onExpand: () => void }) {
  const t = useTranslations('StudioShell')
  const tOperator = useTranslations('StudioOperator')
  const history = useStudioOperatorHistoryView()
  const { sessionId } = useStudioOperatorState()
  const { persona } = useAssistantPersona()
  const session = history?.sessions.find((item) => item.id === sessionId)
  const title = session
    ? (deriveAssistantConversationTitle(session.title) ??
      tOperator('history.untitled'))
    : t('backToChat')

  return (
    <BarTip label={title}>
      <button
        type="button"
        aria-label={t('backToChat')}
        data-testid="studio-shell-expand-chat"
        onClick={onExpand}
        // ⭐ 和对话头里那颗头像同一个位置、同一个长相（板头 52 高、左 12）：对话栏往左收到
        //   底时头像看起来没动，⛔ 收完再在别处冒出一颗。
        className="absolute top-2.5 left-3 z-20 hidden size-8 place-items-center overflow-hidden rounded-full bg-muted text-foreground transition-transform duration-fast ease-standard active:scale-96 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none desk:grid"
      >
        <AssistantAvatarGlyph presetId={persona.avatarPreset ?? null} />
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
