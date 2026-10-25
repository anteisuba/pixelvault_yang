'use client'

import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  DURATION_MS,
  EASE_STANDARD_CSS,
  SHELL_MOTION,
} from '@/constants/motion'
import {
  NEW_VOICE_ROOM_PATH,
  ROUTES,
  STUDIO_CONVERSATION_QUERY,
} from '@/constants/routes'
import {
  STUDIO_SHELL_SPLIT,
  type StudioShellOverlayId,
  type StudioShellRouteKind,
} from '@/constants/studio-shell'
import { StudioLibraryPickProvider } from '@/contexts/studio-library-pick'
import {
  StudioOperatorDockPlacementProvider,
  StudioOperatorHostSlotProvider,
  type StudioOperatorDockPlacement,
  type StudioOperatorHost,
} from '@/contexts/studio-operator-host'
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import { HomeDraftBench } from '@/components/business/studio/shell/HomeDraftBench'
import { StudioConversationList } from '@/components/business/studio/shell/StudioConversationList'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import {
  StudioBenchRail,
  StudioShellExpandChat,
  activeBenchId,
  useStudioBenchMotion,
  useStudioBenchSwipe,
} from '@/components/business/studio/shell/StudioShellBench'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { useHomeOperatorHost } from '@/hooks/use-home-operator-host'
import { useIsDesk } from '@/hooks/use-mobile'
import { useStudioConversationBenchSync } from '@/hooks/use-studio-conversation-bench'
import { useStudioConversationUrl } from '@/hooks/use-studio-conversation-url'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import {
  useStudioOperatorHistoryView,
  type StudioOperatorHistoryRestore,
} from '@/hooks/use-studio-operator-history'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { useStudioShellSplit } from '@/hooks/use-studio-shell-split'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  conversationIdFromPath,
  shellOverlayFromPath,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'
import { setActiveStudioConversation } from '@/lib/studio-active-conversation'
import { cn } from '@/lib/utils'

/**
 * 白板（ui-spec §1）：对话和台合成一整块，落在灰底上（上下右留 8），圆角 20 + `ring`。
 * `bench-screen-h` 把板里按整屏写的高（`var(--screen-h, 100svh)`）扣掉这上下 8。
 */
const SHELL_BOARD_CLASS =
  'bench-screen-h relative min-w-0 desk:my-2 desk:mr-2 desk:flex-1 desk:rounded-20 desk:bg-background desk:shadow-ring'

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
 *   往右拖到底收起台（回到只有对话）。台开着时台条横在台顶，没开台时竖着贴右边（9f-4）。
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
  const isDesk = useIsDesk()
  /**
   * 手机 / 平板（<1024）直接打开库（旧地址 308 过来、底栏点「素材」…）：没有台可留，
   * 就地当一整页画，⛔ 盖满屏的叠层 —— 与搬进库之前那一页长得一样，底栏照旧（9f-2e）。
   * 从台上点开（`base` 有值）照旧叠上来，关掉回到台。
   */
  const libraryInPlace =
    isDesk === false && routeKind === 'library' && base === null
  const kind = libraryInPlace ? 'page' : (base?.kind ?? 'home')
  const plainHomeHost = useHomeOperatorHost()
  /** 首页那份小配方（第 9g 步）挂好之前 / 台开着时，面板拿只能聊天的那张脸。 */
  const [draftHost, setDraftHost] = useState<StudioOperatorHost | null>(null)
  const homeHost = kind === 'home' && draftHost ? draftHost : plainHomeHost
  const [restore] = useState(() => initialRestore(pathname))
  const [libraryTarget, setLibraryTarget] = useState<HTMLElement | null>(null)
  const [libraryCategory, setLibraryCategory] =
    useState<StudioShellOverlayId | null>(null)
  const libraryOpen = libraryCategory !== null
  /** 库里右上「助手」开着（对话从右边出来）；库收掉就复位。 */
  const [libraryAssistantOpen, setLibraryAssistantOpen] = useState(false)
  if (!libraryOpen && libraryAssistantOpen) setLibraryAssistantOpen(false)
  const cameFromShell = base !== null
  const libraryContext = useMemo(
    () => ({
      target: libraryTarget,
      inPlace: libraryInPlace ? shellOverlayFromPath(pathname) : null,
      setOpenCategory: setLibraryCategory,
      // 从外壳里点开的 → 后退回到进来之前那一页（台还在）；直接打开的 → 回首页。
      close: () => (cameFromShell ? router.back() : router.push(ROUTES.STUDIO)),
      assistantOpen: libraryAssistantOpen,
      setAssistantOpen: setLibraryAssistantOpen,
    }),
    [
      cameFromShell,
      libraryAssistantOpen,
      libraryInPlace,
      libraryTarget,
      pathname,
      router,
    ],
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
      className="fixed inset-0 z-40 empty:hidden desk:absolute desk:overflow-hidden desk:inset-y-0 desk:right-auto desk:left-0 desk:z-10 desk:w-(--library-width)"
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
                className="desk:flex desk:h-svh desk:overflow-hidden desk:bg-surface-sunken"
              >
                <StudioConversationList className="hidden desk:flex" />
                {kind === 'page' ? (
                  <div
                    className={cn(SHELL_BOARD_CLASS, 'desk:overflow-y-auto')}
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
                    libraryAssistantOpen={libraryAssistantOpen}
                    libraryLayer={libraryLayer}
                  >
                    {children}
                  </StudioShellStage>
                )}
                {library}
                {kind === 'home' ? (
                  <HomeDraftBench onHost={setDraftHost} />
                ) : null}
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

/**
 * 地址 ↔ 当前对话；这段对话开着哪个台（9f-3）；出图请求带上哪段对话（9f-3）。
 * 单独一颗：`useSearchParams` 要进 Suspense，⛔ 拖着整个外壳进去。
 */
function StudioConversationUrlSync() {
  const history = useStudioOperatorHistoryView()
  const actions = useStudioOperatorActions()
  const { sessionId } = useStudioOperatorState()
  useStudioConversationUrl({ history, actions })
  useStudioConversationBenchSync()
  useEffect(() => {
    setActiveStudioConversation(sessionId)
  }, [sessionId])
  useEffect(() => () => setActiveStudioConversation(null), [])
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
  libraryAssistantOpen,
  libraryLayer,
  children,
}: {
  kind: 'home' | 'bench'
  /** 台条认哪一个台：库叠着时地址是 `/library/…`，按底下那一页认。 */
  benchPathname: string
  shellDock: boolean
  libraryOpen: boolean
  /** 库里叫出了助手：对话贴到白板右边，库让出那一块。 */
  libraryAssistantOpen: boolean
  libraryLayer: ReactNode
  children: ReactNode
}) {
  const t = useTranslations('StudioShell')
  const reduceMotion = useReducedMotion()
  const { split, setConversationPx, setConversationCollapsed } =
    useStudioShellSplit()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const bench = kind === 'bench'
  const activeId = bench ? activeBenchId(benchPathname) : undefined
  const { history: chatHistory, entries: chatEntries } =
    useStudioOperatorState()
  const hasChat =
    chatHistory.length > 0 || chatEntries.some((entry) => entry.kind === 'user')
  /**
   * 从首页点进台（用户 10-25）：这段对话聊过 → 对话和台并排；还没聊过 → 台直接全屏
   *（对话收起，头像在台左上角）。⚠ 只在「没台 → 有台」那一下定，进台之后照用户自己拖的。
   */
  const benchBefore = useRef(bench)
  useLayoutEffect(() => {
    const entering = bench && !benchBefore.current
    benchBefore.current = bench
    if (entering) setConversationCollapsed(!hasChat)
  }, [bench, hasChat, setConversationCollapsed])
  const { closeBench, switchBench } = useStudioBenchMotion({
    bench,
    activeId,
    columnRef,
    contentRef,
  })
  useStudioBenchSwipe({
    contentRef,
    activeId,
    enabled: bench && !libraryOpen,
    onSwitch: switchBench,
  })
  /** 拖着线：宽跟手、⛔ 动画；松手 / 键盘 / 双击才走「拉」那一段。 */
  const [dragging, setDragging] = useState(false)
  /** 拖过头、松手就会收起的那一边（变淡提示）。 */
  const [collapsePreview, setCollapsePreview] =
    useState<StudioShellCollapseSide>(null)
  /** 「拉」：对话栏宽在 0 和记住的宽之间走这一段。 */
  const [pulling, setPulling] = useState<'collapse' | 'expand' | null>(null)
  /** 拖过头收台：台退出去、回到只有对话之后，再把对话栏记住的宽放回按下那一刻的。 */
  const restoreAfterClose = useRef<number | null>(null)
  useEffect(() => {
    if (bench || restoreAfterClose.current === null) return
    setConversationPx(restoreAfterClose.current)
    restoreAfterClose.current = null
  }, [bench, setConversationPx])

  const collapseConversation = () => {
    if (reduceMotion) {
      setConversationCollapsed(true)
      return
    }
    setPulling('collapse')
    window.setTimeout(() => {
      setConversationCollapsed(true)
      setPulling(null)
    }, SHELL_MOTION.pullMs)
  }
  const expandConversation = () => {
    setConversationCollapsed(false)
    if (reduceMotion) return
    setPulling('expand')
    // 先按 0 宽画一帧，下一帧再放回记住的宽，宽的过渡才有起点。
    requestAnimationFrame(() => requestAnimationFrame(() => setPulling(null)))
  }

  // 库是整页（ui-spec §9）：盖满白板；叫出助手时对话按记住的宽贴到右边。
  const conversationHidden =
    bench && split.conversationCollapsed && !libraryOpen
  const conversationWidth = `${split.conversationPx}px`
  const libraryChat = libraryOpen && libraryAssistantOpen
  const pullTransition =
    dragging || reduceMotion
      ? undefined
      : `width ${SHELL_MOTION.pullMs}ms ${EASE_STANDARD_CSS}, opacity ${DURATION_MS.fast}ms ${EASE_STANDARD_CSS}`

  return (
    <div
      ref={stageRef}
      data-testid="studio-shell-stage"
      className={cn(SHELL_BOARD_CLASS, 'desk:flex desk:overflow-hidden')}
      style={libraryWidth(
        libraryChat ? `calc(100% - ${conversationWidth})` : '100%',
      )}
    >
      <section
        aria-label={t('conversations')}
        data-testid="studio-shell-conversation"
        className={cn(
          'relative min-h-0 min-w-0 flex-col',
          bench
            ? 'hidden desk:flex desk:shrink-0 desk:overflow-hidden'
            : 'flex h-page flex-1',
          conversationHidden && 'desk:hidden',
          libraryOpen && !libraryAssistantOpen && 'desk:hidden',
          libraryChat &&
            'desk:absolute desk:inset-y-0 desk:right-0 desk:z-20 desk:flex desk:border-l desk:border-border',
        )}
        style={
          libraryChat
            ? { width: conversationWidth }
            : bench
              ? {
                  width: pulling ? 0 : conversationWidth,
                  maxWidth: `calc(100% - ${STUDIO_SHELL_SPLIT.minBenchPx}px)`,
                  opacity:
                    collapsePreview === 'conversation'
                      ? SHELL_MOTION.collapsePreviewOpacity
                      : undefined,
                  transition: pullTransition,
                }
              : undefined
        }
      >
        {shellDock && !bench ? <StudioHomeModeSwitch /> : null}
        {shellDock ? (
          <StudioOperatorDock
            variant="column"
            onCollapseColumn={bench ? collapseConversation : undefined}
          />
        ) : null}
      </section>

      {bench && !conversationHidden && !libraryOpen ? (
        <StudioShellDivider
          stageRef={stageRef}
          conversationPx={split.conversationPx}
          onResize={setConversationPx}
          onDraggingChange={setDragging}
          onPreviewCollapse={setCollapsePreview}
          onCollapseConversation={collapseConversation}
          onCloseBench={(restorePx) => {
            restoreAfterClose.current = restorePx
            void closeBench()
          }}
        />
      ) : null}

      {libraryOpen || !bench ? null : (
        <StudioBenchRail
          activeId={activeId}
          onSwitch={(item) => void switchBench(item)}
          onClose={() => void closeBench()}
        />
      )}

      <div
        ref={columnRef}
        data-testid="studio-shell-bench-column"
        className={cn(
          'min-w-0 flex-1 flex-col',
          bench ? 'block desk:flex desk:h-full' : 'hidden',
        )}
        style={{
          opacity:
            collapsePreview === 'bench'
              ? SHELL_MOTION.collapsePreviewOpacity
              : undefined,
          transition: pullTransition,
        }}
      >
        {conversationHidden ? (
          <StudioShellExpandChat onExpand={expandConversation} />
        ) : null}
        <div
          ref={contentRef}
          data-testid="studio-shell-bench"
          className="relative min-w-0 desk:min-h-0 desk:flex-1 desk:overscroll-x-none desk:contain-layout"
        >
          {children}
        </div>
      </div>
      {libraryLayer}
    </div>
  )
}

type StudioShellCollapseSide = 'conversation' | 'bench' | null

/**
 * 首页顶上「助手 | 配音间」（第 9f 步 9f-3）：配音间是一种对话，切过去就新开一间
 *（`/studio/audio?new=1`，在里面挑角色就能说）；开过的房间都在左边列表里。
 * ⭐ 浮在板头那一行正中（用户 10-25：头像不单独占一行），⛔ 自己再占一行把对话往下压。
 */
function StudioHomeModeSwitch() {
  const t = useTranslations('StudioShell')
  const router = useRouter()
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2.5 z-10 flex justify-center *:pointer-events-auto">
      <LiquidSegmented
        items={[
          { value: 'assistant', label: t('homeAssistant') },
          { value: 'voice', label: t('homeVoiceRoom') },
        ]}
        value="assistant"
        onChange={(mode) => {
          if (mode === 'voice') router.push(NEW_VOICE_ROOM_PATH)
        }}
        ariaLabel={t('homeMode')}
        semantics="tabs"
        size="sm"
      />
    </div>
  )
}

/**
 * 对话 | 台 之间那一根线（「拉」，9f-4）。拖：宽跟手，离默认宽 `snapPx` 以内吸到默认宽；
 * 拖过最小值再多 `collapseSlackPx`，要收起的那一边变淡，**松手才收**（中途拖回来就不收）。
 * 双击回默认宽。键盘：←/→ 一下挪 `keyStepPx`。
 */
function StudioShellDivider({
  stageRef,
  conversationPx,
  onResize,
  onDraggingChange,
  onPreviewCollapse,
  onCollapseConversation,
  onCloseBench,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>
  conversationPx: number
  onResize: (px: number) => void
  onDraggingChange: (dragging: boolean) => void
  onPreviewCollapse: (side: StudioShellCollapseSide) => void
  onCollapseConversation: () => void
  /** 收台；`restorePx` = 回到只有对话之后，对话栏记住的宽放回这个。 */
  onCloseBench: (restorePx: number) => void
}) {
  const t = useTranslations('StudioShell')
  const dragging = useRef(false)
  const pending = useRef<StudioShellCollapseSide>(null)
  /** 按下那一刻的宽：拖过头收起时记住的是它，⛔ 拖过头那一下压到的最小 / 最大宽。 */
  const startPx = useRef(conversationPx)
  const {
    minConversationPx,
    minBenchPx,
    collapseSlackPx,
    keyStepPx,
    snapPx,
    defaultConversationPx,
  } = STUDIO_SHELL_SPLIT

  const maxConversationPx = () => {
    const width = stageRef.current?.getBoundingClientRect().width ?? 0
    return Math.max(minConversationPx, width - minBenchPx)
  }

  const preview = (side: StudioShellCollapseSide) => {
    if (pending.current === side) return
    pending.current = side
    onPreviewCollapse(side)
  }

  const place = (px: number) => {
    const max = maxConversationPx()
    if (px < minConversationPx - collapseSlackPx) {
      preview('conversation')
      onResize(minConversationPx)
      return
    }
    if (px > max + collapseSlackPx) {
      preview('bench')
      onResize(max)
      return
    }
    preview(null)
    const snapped =
      Math.abs(px - defaultConversationPx) <= snapPx &&
      defaultConversationPx <= max
        ? defaultConversationPx
        : px
    onResize(Math.min(max, Math.max(minConversationPx, snapped)))
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    startPx.current = conversationPx
    onDraggingChange(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const left = stageRef.current?.getBoundingClientRect().left ?? 0
    place(event.clientX - left)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (!dragging.current) return
    dragging.current = false
    onDraggingChange(false)
    const side = pending.current
    preview(null)
    if (event.type === 'pointercancel') return
    if (side === 'conversation') {
      onResize(startPx.current)
      onCollapseConversation()
    }
    if (side === 'bench') onCloseBench(startPx.current)
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
      onDoubleClick={() =>
        onResize(Math.min(maxConversationPx(), defaultConversationPx))
      }
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
