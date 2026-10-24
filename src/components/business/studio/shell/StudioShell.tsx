'use client'

import {
  Suspense,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'

import {
  SHELL_NAV_TOOLS,
  activeShellTool,
  type ShellNavItem,
} from '@/constants/navigation'
import { ROUTES, STUDIO_CONVERSATION_QUERY } from '@/constants/routes'
import {
  STUDIO_SHELL_BENCH_IDS,
  type StudioLibraryCategoryId,
  STUDIO_SHELL_SPLIT,
  type StudioShellRouteKind,
} from '@/constants/studio-shell'
import { StudioLibraryPickProvider } from '@/contexts/studio-library-pick'
import {
  StudioOperatorDockPlacementProvider,
  StudioOperatorHostSlotProvider,
  type StudioOperatorDockPlacement,
} from '@/contexts/studio-operator-host'
import { ChevronLeft, X } from '@/components/icons'
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import { StudioConversationList } from '@/components/business/studio/shell/StudioConversationList'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useHomeOperatorHost } from '@/hooks/use-home-operator-host'
import { useIsDesk } from '@/hooks/use-mobile'
import { useStudioConversationUrl } from '@/hooks/use-studio-conversation-url'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import {
  useStudioOperatorHistoryView,
  type StudioOperatorHistoryRestore,
} from '@/hooks/use-studio-operator-history'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { useStudioShellSplit } from '@/hooks/use-studio-shell-split'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import {
  conversationIdFromPath,
  studioBenchHref,
  studioConversationHref,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/** 台条上的五个台，按 `STUDIO_SHELL_BENCH_IDS` 的顺序。 */
const BENCH_ITEMS: readonly ShellNavItem[] = STUDIO_SHELL_BENCH_IDS.flatMap(
  (id) => SHELL_NAV_TOOLS.filter((item) => item.id === id),
)

/** 台条宽（`w-12`）：首页上库叠层让出这一条。 */
const RAIL_WIDTH_PX = 48

const RAIL_BUTTON_CLASS =
  'flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4.5'

/**
 * 这次页面加载一进来载回哪一段 —— 地址说了算：首页 = 新对话；`/studio/c/<编号>` 与
 * `?c=<编号>` = 那一段；直接进台、地址里没带 = 最近那一段（与改动之前一致）。
 * ⚠ 读 `window.location` 而不是 `useSearchParams`：只在挂上那一拍读一次，⛔ 为它让整个
 *   外壳进 Suspense。服务端那一拍给什么都无所谓（水化在客户端跑）。
 */
function initialRestore(pathname: string): StudioOperatorHistoryRestore {
  const kind = studioShellRouteKind(pathname)
  if (kind === 'home') {
    const id = conversationIdFromPath(pathname)
    return id ? { id } : 'none'
  }
  if (typeof window === 'undefined') return 'latest'
  const id = new URLSearchParams(window.location.search).get(
    STUDIO_CONVERSATION_QUERY,
  )
  return id ? { id } : 'latest'
}

/**
 * `/studio` 的外壳（第 9f 步方向 E「分层」，9f-1）：
 * 左 = 在哪儿（列表）· 中 = 想什么（对话，面板**只挂这一份**）· 右 = 用什么做（台）。
 *
 * - ≥1024 三层摆开：对话与台之间一根分隔线定宽窄（记得住）；往左拖到底收起对话，
 *   往右拖到底收起台（回到只有对话）。台条竖在台的左沿（没开台时贴右边）。
 * - 更窄照旧：台全屏、面板由台自己挂（浮起的那一颗）；首页就是一整页对话。
 * - 台照旧用 `StudioOperatorHostProvider` 包住自己，同一个 Provider 把宿主登记给这里；
 *   没有台在场时面板拿首页那张脸（`useHomeOperatorHost`）。
 *
 * 设计稿：`/mnt/project-files/assistant-reliability/step9f-e.md`；本步范围：`step9f-1-plan.md`。
 */
export function StudioShell({
  children,
  library,
}: {
  children: ReactNode
  /** `@library` 那一格（从外壳里点开库时的拦截路由）；页面自己会传送到落点，这里只是挂着。 */
  library?: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const routeKind = studioShellRouteKind(pathname)
  /**
   * 库叠着时底下是哪一页：进库之前最后那一页（台不卸载）。直接打开库 = 首页。
   * ⚠ 渲染期按地址调整（React 认可的「渲染时修正 state」写法），⛔ 晚一帧。
   */
  const [base, setBase] = useState<{
    kind: Exclude<StudioShellRouteKind, 'library'>
    pathname: string
  } | null>(() =>
    routeKind === 'library' ? null : { kind: routeKind, pathname },
  )
  if (routeKind !== 'library' && base?.pathname !== pathname)
    setBase({ kind: routeKind, pathname })
  const kind = base?.kind ?? 'home'
  const isDesk = useIsDesk()
  const homeHost = useHomeOperatorHost()
  const [restore] = useState(() => initialRestore(pathname))
  const [libraryTarget, setLibraryTarget] = useState<HTMLElement | null>(null)
  const [libraryCategory, setLibraryCategory] =
    useState<StudioLibraryCategoryId | null>(null)
  const libraryOpen = libraryCategory !== null
  const cameFromShell = base !== null
  const libraryContext = useMemo(
    () => ({
      target: libraryTarget,
      setOpenCategory: setLibraryCategory,
      // 从外壳里点开的 → 后退回到进来之前那一页（台还在）；直接打开的 → 回首页。
      close: () => (cameFromShell ? router.back() : router.push(ROUTES.STUDIO)),
    }),
    [cameFromShell, libraryTarget, router],
  )
  const placement = useMemo<StudioOperatorDockPlacement>(
    () => ({
      owner:
        isDesk === undefined
          ? 'pending'
          : isDesk || kind === 'home'
            ? 'shell'
            : 'bench',
      restore,
    }),
    [isDesk, kind, restore],
  )

  const libraryLayer = (
    <div
      ref={setLibraryTarget}
      data-testid="studio-library-target"
      className="fixed inset-0 z-40 empty:hidden desk:absolute desk:inset-y-0 desk:right-auto desk:left-0 desk:z-10 desk:w-(--library-width)"
    />
  )

  return (
    <StudioOperatorDockPlacementProvider value={placement}>
      <StudioLibraryTargetContext.Provider value={libraryContext}>
        <StudioLibraryPickProvider>
          <StudioOperatorHostSlotProvider fallback={homeHost}>
            {() => (
              <div
                data-testid="studio-shell"
                data-kind={kind}
                data-library={libraryCategory ?? undefined}
                className="desk:flex desk:h-svh desk:overflow-hidden"
              >
                <StudioConversationList className="hidden desk:flex" />
                {kind === 'page' ? (
                  <div
                    className="relative min-w-0 desk:h-svh desk:flex-1 desk:overflow-y-auto"
                    style={libraryWidth('100%')}
                  >
                    {children}
                    {libraryLayer}
                  </div>
                ) : (
                  <StudioShellStage
                    kind={kind}
                    benchPathname={base?.pathname ?? ROUTES.STUDIO}
                    shellDock={placement.owner === 'shell'}
                    libraryOpen={libraryOpen}
                    libraryLayer={libraryLayer}
                  >
                    {children}
                  </StudioShellStage>
                )}
                {library}
              </div>
            )}
          </StudioOperatorHostSlotProvider>
        </StudioLibraryPickProvider>
      </StudioLibraryTargetContext.Provider>
      <Suspense fallback={null}>
        <StudioConversationUrlSync />
      </Suspense>
    </StudioOperatorDockPlacementProvider>
  )
}

/** 地址 ↔ 当前对话。单独一颗：`useSearchParams` 要进 Suspense，⛔ 拖着整个外壳进去。 */
function StudioConversationUrlSync() {
  const history = useStudioOperatorHistoryView()
  const actions = useStudioOperatorActions()
  useStudioConversationUrl({ history, actions })
  return null
}

/** 叠层落点的宽（≥1024）：写进 `--library-width`，⛔ 直接写 width（手机上落点是整屏）。 */
function libraryWidth(width: string): CSSProperties {
  return { '--library-width': width } as CSSProperties
}

function StudioShellStage({
  kind,
  benchPathname,
  shellDock,
  libraryOpen,
  libraryLayer,
  children,
}: {
  kind: 'home' | 'bench'
  /** 台条认哪一个台：库叠着时地址是 `/library/…`，按底下那一页认。 */
  benchPathname: string
  shellDock: boolean
  libraryOpen: boolean
  libraryLayer: ReactNode
  children: ReactNode
}) {
  const t = useTranslations('StudioShell')
  const { split, setConversationPx, setConversationCollapsed } =
    useStudioShellSplit()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const bench = kind === 'bench'
  // 库叠着时对话那一栏一定在（库叠在它上面），且至少占一半，⛔ 挤成一条。
  const conversationHidden =
    bench && split.conversationCollapsed && !libraryOpen
  const conversationWidth = libraryOpen
    ? `max(${split.conversationPx}px, 50%)`
    : `${split.conversationPx}px`

  return (
    <div
      ref={stageRef}
      data-testid="studio-shell-stage"
      className="relative min-w-0 desk:flex desk:h-svh desk:flex-1"
      style={libraryWidth(
        bench ? conversationWidth : `calc(100% - ${RAIL_WIDTH_PX}px)`,
      )}
    >
      <section
        aria-label={t('conversations')}
        data-testid="studio-shell-conversation"
        className={cn(
          'min-h-0 min-w-0 flex-col',
          bench ? 'hidden desk:flex desk:shrink-0' : 'flex h-page flex-1',
          conversationHidden && 'desk:hidden',
        )}
        style={
          bench
            ? {
                width: conversationWidth,
                maxWidth: `calc(100% - ${STUDIO_SHELL_SPLIT.minBenchPx}px)`,
              }
            : undefined
        }
      >
        {shellDock ? <StudioOperatorDock variant="column" /> : null}
      </section>

      {bench && !conversationHidden ? (
        <StudioShellDivider
          stageRef={stageRef}
          conversationPx={split.conversationPx}
          onResize={setConversationPx}
          onCollapseConversation={() => setConversationCollapsed(true)}
        />
      ) : null}

      <StudioBenchRail
        kind={kind}
        pathname={benchPathname}
        conversationHidden={conversationHidden}
        onExpandConversation={() => setConversationCollapsed(false)}
      />

      <div
        data-testid="studio-shell-bench"
        className={cn(
          'relative min-w-0 flex-1 desk:contain-layout',
          bench ? 'desk:h-svh' : 'hidden',
        )}
      >
        {children}
      </div>
      {libraryLayer}
    </div>
  )
}

/**
 * 对话 | 台 之间那一根线。拖：定对话栏宽；拖过最小值再多 `collapseSlackPx` = 收起那一边。
 * 键盘：←/→ 一下挪 `keyStepPx`。
 */
function StudioShellDivider({
  stageRef,
  conversationPx,
  onResize,
  onCollapseConversation,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>
  conversationPx: number
  onResize: (px: number) => void
  onCollapseConversation: () => void
}) {
  const t = useTranslations('StudioShell')
  const router = useRouter()
  const { sessionId } = useStudioOperatorState()
  const dragging = useRef(false)
  const { minConversationPx, minBenchPx, collapseSlackPx, keyStepPx } =
    STUDIO_SHELL_SPLIT

  const maxConversationPx = () => {
    const width = stageRef.current?.getBoundingClientRect().width ?? 0
    return Math.max(minConversationPx, width - minBenchPx)
  }

  const closeBench = () => {
    router.push(studioConversationHref(sessionId))
  }

  const place = (px: number) => {
    const max = maxConversationPx()
    if (px < minConversationPx - collapseSlackPx) {
      dragging.current = false
      onCollapseConversation()
      return
    }
    if (px > max + collapseSlackPx) {
      dragging.current = false
      closeBench()
      return
    }
    onResize(Math.min(max, Math.max(minConversationPx, px)))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const left = stageRef.current?.getBoundingClientRect().left ?? 0
    place(event.clientX - left)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -keyStepPx : keyStepPx
    onResize(
      Math.min(
        maxConversationPx(),
        Math.max(minConversationPx, conversationPx + delta),
      ),
    )
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('resize')}
      aria-valuenow={conversationPx}
      aria-valuemin={minConversationPx}
      tabIndex={0}
      data-testid="studio-shell-divider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className="group relative hidden w-px shrink-0 cursor-col-resize touch-none bg-border focus-visible:outline-none desk:block"
    >
      {/* 线只有 1px，手感区左右各放宽一截。 */}
      <span
        aria-hidden
        className="absolute inset-y-0 -left-1.5 -right-1.5 transition-colors duration-fast ease-standard group-hover:bg-border/60 group-focus-visible:bg-ring/40"
      />
    </div>
  )
}

/**
 * 台条（≥1024）：竖在台的左沿；没开台时贴在右边。上面「‹ 回到对话」（对话收起时）、
 * 中间五个台、下面「收起台」。
 * ⚠ 偏离稿子的一处：稿上台条横在台顶 —— 但各台的高度都按整屏写死（`100svh`），
 *   横条会把台底下压出屏，所以 9f-1 先竖着放。
 */
function StudioBenchRail({
  kind,
  pathname,
  conversationHidden,
  onExpandConversation,
}: {
  kind: 'home' | 'bench'
  pathname: string
  conversationHidden: boolean
  onExpandConversation: () => void
}) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const { sessionId } = useStudioOperatorState()
  const activeId = kind === 'bench' ? activeShellTool(pathname)?.id : undefined
  const bench = kind === 'bench'

  return (
    <nav
      aria-label={t('benches')}
      data-testid="studio-bench-rail"
      className={cn(
        'hidden w-12 shrink-0 flex-col items-center gap-1 py-2 desk:flex',
        bench ? 'border-r border-border bg-background' : 'order-last',
      )}
    >
      {conversationHidden ? (
        <RailTip label={t('backToChat')}>
          <button
            type="button"
            aria-label={t('backToChat')}
            data-testid="studio-shell-expand-chat"
            onClick={onExpandConversation}
            className={cn(RAIL_BUTTON_CLASS, 'mb-1')}
          >
            <ChevronLeft />
          </button>
        </RailTip>
      ) : null}
      {BENCH_ITEMS.map((item) => {
        const Icon = item.icon
        const label = tAll(item.labelKey)
        const active = item.id === activeId
        return (
          <RailTip key={item.id} label={label}>
            <Link
              href={studioBenchHref(item.href, sessionId)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                RAIL_BUTTON_CLASS,
                active && 'bg-muted text-foreground',
              )}
            >
              <Icon />
            </Link>
          </RailTip>
        )
      })}
      {bench ? (
        <RailTip label={t('closeBench')}>
          <Link
            href={studioConversationHref(sessionId)}
            aria-label={t('closeBench')}
            data-testid="studio-shell-close-bench"
            className={cn(RAIL_BUTTON_CLASS, 'mt-auto')}
          >
            <X />
          </Link>
        </RailTip>
      ) : null}
    </nav>
  )
}

function RailTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}
