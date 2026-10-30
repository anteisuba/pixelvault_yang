'use client'

import {
  Suspense,
  useCallback,
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
import { ROUTES, STUDIO_CONVERSATION_QUERY } from '@/constants/routes'
import {
  LIBRARY_ASSISTANT_LEFT_CATEGORIES,
  STUDIO_SHELL_SPLIT,
  type StudioShellOverlayId,
  type StudioShellRouteKind,
} from '@/constants/studio-shell'
import { StudioLibraryPickProvider } from '@/contexts/studio-library-pick'
import {
  StudioShellHeaderSlotsProvider,
  type StudioShellHeaderSlots,
} from '@/contexts/studio-shell-header-slots'
import {
  StudioOperatorDockPlacementProvider,
  StudioOperatorHostSlotProvider,
  type StudioOperatorDockPlacement,
  type StudioOperatorHost,
} from '@/contexts/studio-operator-host'
import { StudioOperatorDock } from '@/components/business/studio/assistant-operator'
import { HomeDraftBench } from '@/components/business/studio/shell/HomeDraftBench'
import { StudioConversationList } from '@/components/business/studio/shell/StudioConversationList'
import {
  StudioLibrarySlotContext,
  StudioLibraryTargetContext,
} from '@/components/business/studio/shell/StudioLibraryOverlay'
import {
  measureStudioShellAvatar,
  StudioShellAvatarFlight,
  type StudioShellAvatarFlightPlan,
  type StudioShellAvatarSpot,
} from '@/components/business/studio/shell/StudioShellAvatarFlight'
import {
  StudioBenchRail,
  StudioShellExpandChat,
  activeBenchId,
  useStudioBenchMotion,
  useStudioBenchSwipe,
} from '@/components/business/studio/shell/StudioShellBench'
import {
  SHELL_HISTORY_COLUMN_WIDTH,
  StudioShellHistoryColumn,
} from '@/components/business/studio/shell/StudioShellHistoryColumn'
import {
  StudioShellHistoryExpandKey,
  StudioShellHistoryKey,
  StudioShellPersonaKey,
} from '@/components/business/studio/shell/StudioShellHistoryKeys'
import { useHomeOperatorHost } from '@/hooks/use-home-operator-host'
import { useIsDesktopShell } from '@/hooks/use-mobile'
import { useStudioConversationBenchSync } from '@/hooks/use-studio-conversation-bench'
import { useStudioConversationUrl } from '@/hooks/use-studio-conversation-url'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import {
  useStudioOperatorHistoryView,
  type StudioOperatorHistoryRestore,
} from '@/hooks/use-studio-operator-history'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { setStudioShellAvatar } from '@/hooks/use-studio-shell-avatar'
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
  'bench-screen-h relative min-w-0 lg:my-2 lg:mr-2 lg:flex-1 lg:rounded-20 lg:bg-background lg:shadow-ring'

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
 * - ≥768 三层摆开：对话与台之间一根分隔线定宽窄（记得住）；往左拖到底收起对话，
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
  const isDesk = useIsDesktopShell()
  /**
   * 手机（<768）直接打开库（旧地址 308 过来、底栏点「素材」…）：没有台可留，
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
  /** `@library` 那一格里挂着几份库（拦截路由），见 `StudioLibraryTarget.slotOverlayOpen`。 */
  const [slotOverlays, setSlotOverlays] = useState(0)
  const registerSlotOverlay = useCallback(() => {
    setSlotOverlays((count) => count + 1)
    return () => setSlotOverlays((count) => count - 1)
  }, [])
  /** 库里右上「助手」开着（对话从右边出来）；库收掉就复位。 */
  const [libraryAssistantOpen, setLibraryAssistantOpen] = useState(false)
  if (!libraryOpen && libraryAssistantOpen) setLibraryAssistantOpen(false)
  const cameFromShell = base !== null
  const libraryContext = useMemo(
    () => ({
      target: libraryTarget,
      inPlace: libraryInPlace ? shellOverlayFromPath(pathname) : null,
      slotOverlayOpen: slotOverlays > 0,
      registerSlotOverlay,
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
      registerSlotOverlay,
      router,
      slotOverlays,
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

  /**
   * 框里那一列对话记录（用户 10-26 定稿 v5）：没开台时摊开，一开台自动收起、收台再摊开；
   * 中间用户自己开合照用户的。⚠ 渲染期按 `kind` 调整（⛔ 晚一帧闪一下）。
   */
  const [historyOpen, setHistoryOpen] = useState(kind !== 'bench')
  const [historyKind, setHistoryKind] = useState(kind)
  if (historyKind !== kind) {
    setHistoryKind(kind)
    if (kind === 'bench') setHistoryOpen(false)
    else if (historyKind === 'bench') setHistoryOpen(true)
  }
  /** 对话头那几颗键（用户 10-26：从左栏搬进白板）。 */
  const headerSlots = useMemo<StudioShellHeaderSlots>(
    () => ({
      // 桌面上记录是框里那一列，收起时这里留一颗展开键；手机没有那一列，照旧弹下拉。
      history: isDesk ? (
        historyOpen ? null : (
          <StudioShellHistoryExpandKey onExpand={() => setHistoryOpen(true)} />
        )
      ) : (
        <StudioShellHistoryKey />
      ),
      persona: <StudioShellPersonaKey />,
    }),
    [historyOpen, isDesk],
  )

  const libraryLayer = (
    <div
      ref={setLibraryTarget}
      data-testid="studio-library-target"
      className="fixed inset-0 z-40 empty:hidden lg:absolute lg:overflow-hidden lg:inset-y-0 lg:right-auto lg:left-(--library-left) lg:z-10 lg:w-(--library-width) lg:transition-[left,width] lg:duration-slow lg:ease-standard motion-reduce:transition-none"
    />
  )

  return (
    <StudioOperatorDockPlacementProvider value={placement}>
      <StudioShellHeaderSlotsProvider value={headerSlots}>
        <StudioLibraryTargetContext.Provider value={libraryContext}>
          <StudioLibraryPickProvider>
            <StudioOperatorHostSlotProvider fallback={homeHost}>
              {() => (
                <div
                  data-testid="studio-shell"
                  data-kind={kind}
                  data-library={libraryCategory ?? undefined}
                  className="lg:flex lg:h-svh lg:overflow-hidden lg:bg-surface-sunken"
                >
                  <StudioConversationList className="hidden lg:flex" />
                  {kind === 'page' ? (
                    <div
                      className={cn(SHELL_BOARD_CLASS, 'lg:overflow-y-auto')}
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
                      libraryAssistantLeft={
                        libraryCategory !== null &&
                        (
                          LIBRARY_ASSISTANT_LEFT_CATEGORIES as readonly string[]
                        ).includes(libraryCategory)
                      }
                      libraryLayer={libraryLayer}
                      historyOpen={historyOpen}
                      onCloseHistory={() => setHistoryOpen(false)}
                      onCloseLibraryAssistant={() =>
                        setLibraryAssistantOpen(false)
                      }
                    >
                      {children}
                    </StudioShellStage>
                  )}
                  <StudioLibrarySlotContext.Provider value>
                    {library}
                  </StudioLibrarySlotContext.Provider>
                  {kind === 'home' ? (
                    <HomeDraftBench onHost={setDraftHost} />
                  ) : null}
                </div>
              )}
            </StudioOperatorHostSlotProvider>
          </StudioLibraryPickProvider>
        </StudioLibraryTargetContext.Provider>
      </StudioShellHeaderSlotsProvider>
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

/**
 * 叠层落点的宽与左边距（≥768）：写进 `--library-width` / `--library-left`，⛔ 直接写
 * width / left（手机上落点是整屏）。助手贴左的那几页，库往右让出对话那一栏。
 */
function libraryWidth(width: string, left = '0px'): CSSProperties {
  return { '--library-width': width, '--library-left': left } as CSSProperties
}

function StudioShellStage({
  kind,
  benchPathname,
  shellDock,
  libraryOpen,
  libraryAssistantOpen,
  libraryAssistantLeft,
  libraryLayer,
  historyOpen,
  onCloseHistory,
  onCloseLibraryAssistant,
  children,
}: {
  kind: 'home' | 'bench'
  /** 台条认哪一个台：库叠着时地址是 `/library/…`，按底下那一页认。 */
  benchPathname: string
  shellDock: boolean
  libraryOpen: boolean
  /** 库里叫出了助手：对话贴到白板右边，库让出那一块。 */
  libraryAssistantOpen: boolean
  /** 这一页的助手贴左边（`LIBRARY_ASSISTANT_LEFT_CATEGORIES`），库往右让。 */
  libraryAssistantLeft: boolean
  libraryLayer: ReactNode
  historyOpen: boolean
  onCloseHistory(): void
  /** 库里叫出的助手收回去（对话头的「收起」在库里就是它）。 */
  onCloseLibraryAssistant(): void
  children: ReactNode
}) {
  const t = useTranslations('StudioShell')
  const reduceMotion = useReducedMotion()
  const { split, setConversationPx, setConversationCollapsed } =
    useStudioShellSplit()
  const stageRef = useRef<HTMLDivElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const conversationRef = useRef<HTMLElement | null>(null)
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

  /**
   * 「拉」的那一段里对话正文按开着时的宽钉住、贴右边（用户 10-27 嫌卡）：栏宽在变，
   * 里面的字 ⛔ 跟着一帧帧重新换行，整块像滑出去 / 滑进来。
   */
  const openWidth = useRef<number | null>(null)
  const [pinnedPx, setPinnedPx] = useState<number | null>(null)

  /** 头像飞的那一拍（用户 10-27：⛔ 消失又出现）：起飞时量好原位，替身追到落点。 */
  const [flight, setFlight] = useState<StudioShellAvatarFlightPlan | null>(null)
  const endFlight = useCallback(() => setFlight(null), [])
  const takeOff = useCallback(
    (from: StudioShellAvatarSpot, to: StudioShellAvatarSpot) => {
      const rect = measureStudioShellAvatar(stageRef.current, from)
      if (rect) setFlight({ from: rect, to })
    },
    [],
  )

  const collapseConversation = () => {
    if (reduceMotion) {
      setConversationCollapsed(true)
      return
    }
    takeOff('header', 'bench')
    openWidth.current = conversationRef.current?.offsetWidth || null
    setPinnedPx(openWidth.current)
    setPulling('collapse')
    window.setTimeout(() => {
      setConversationCollapsed(true)
      setPulling(null)
      setPinnedPx(null)
    }, SHELL_MOTION.pullMs)
  }
  const expandConversation = useCallback(() => {
    setConversationCollapsed(false)
    if (reduceMotion) return
    takeOff('bench', 'header')
    // 还没在这台上开过对话（进台就收着）：按记住的宽、给台留够最小宽估一个。
    const stageWidth = stageRef.current?.clientWidth
    setPinnedPx(
      openWidth.current ??
        (stageWidth
          ? Math.max(
              STUDIO_SHELL_SPLIT.minConversationPx,
              Math.min(
                split.conversationPx,
                stageWidth - STUDIO_SHELL_SPLIT.minBenchPx,
              ),
            )
          : null),
    )
    setPulling('expand')
    // 先按 0 宽画一帧，下一帧再放回记住的宽，宽的过渡才有起点；走完那一段再松开钉住的宽。
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setPulling(null)
        window.setTimeout(() => setPinnedPx(null), SHELL_MOTION.pullMs)
      }),
    )
  }, [reduceMotion, setConversationCollapsed, split.conversationPx, takeOff])

  // 库是整页（ui-spec §9）：盖满白板；叫出助手时对话按记住的宽贴到右边。
  const conversationHidden =
    bench && split.conversationCollapsed && !libraryOpen
  // 头像在哪（用户 10-25 ① A）：一往左收就飞到台左上角，点它展开、飞回对话头。
  const avatarDocked = conversationHidden || pulling === 'collapse'
  useEffect(() => {
    setStudioShellAvatar({
      docked: avatarDocked,
      expand: conversationHidden ? expandConversation : null,
    })
  }, [avatarDocked, conversationHidden, expandConversation])
  useEffect(
    () => () => setStudioShellAvatar({ docked: false, expand: null }),
    [],
  )
  const conversationWidth = `${split.conversationPx}px`
  const libraryChat = libraryOpen && libraryAssistantOpen
  /**
   * 助手贴左的那几页（角色，第 ① 步）：记录列 + 对话照首页那样从左排开（⛔ 浮在库上），
   * 库从它们右边开始；记录列能开合，库跟着让。
   */
  const libraryChatLeft = libraryChat && libraryAssistantLeft
  const historyShown =
    historyOpen && !conversationHidden && (!libraryOpen || libraryChatLeft)
  const libraryLeft = libraryChatLeft
    ? historyShown
      ? `calc(${conversationWidth} + ${SHELL_HISTORY_COLUMN_WIDTH})`
      : conversationWidth
    : '0px'
  const pullTransition =
    dragging || reduceMotion
      ? undefined
      : `width ${SHELL_MOTION.pullMs}ms ${EASE_STANDARD_CSS}, opacity ${DURATION_MS.fast}ms ${EASE_STANDARD_CSS}`

  return (
    <div
      ref={stageRef}
      data-testid="studio-shell-stage"
      className={cn(
        SHELL_BOARD_CLASS,
        'lg:flex lg:overflow-hidden',
        flight && 'studio-shell-avatar-flying',
      )}
      style={libraryWidth(
        libraryChatLeft
          ? `calc(100% - ${libraryLeft})`
          : libraryChat
            ? `calc(100% - ${conversationWidth})`
            : '100%',
        libraryLeft,
      )}
    >
      <StudioShellHistoryColumn open={historyShown} onClose={onCloseHistory} />

      <section
        ref={conversationRef}
        aria-label={t('conversations')}
        data-testid="studio-shell-conversation"
        className={cn(
          'relative min-h-0 min-w-0 flex-col',
          bench
            ? 'hidden lg:flex lg:shrink-0 lg:overflow-hidden'
            : 'flex h-page flex-1',
          conversationHidden && 'lg:hidden',
          libraryOpen && !libraryAssistantOpen && 'lg:hidden',
          libraryChat &&
            (libraryChatLeft
              ? 'lg:flex lg:flex-none lg:border-r lg:border-border'
              : 'lg:absolute lg:inset-y-0 lg:right-0 lg:z-20 lg:flex lg:border-l lg:border-border'),
        )}
        style={
          libraryChat
            ? { width: conversationWidth }
            : bench
              ? {
                  width: pulling ? 0 : conversationWidth,
                  // 与拖线同一条规矩：放不下两边最小宽时（平板竖拿）对话保住 320，台让。
                  maxWidth: `max(${STUDIO_SHELL_SPLIT.minConversationPx}px, calc(100% - ${STUDIO_SHELL_SPLIT.minBenchPx}px))`,
                  opacity:
                    collapsePreview === 'conversation'
                      ? SHELL_MOTION.collapsePreviewOpacity
                      : undefined,
                  transition: pullTransition,
                }
              : undefined
        }
      >
        {shellDock ? (
          <div
            data-testid="studio-shell-conversation-body"
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col',
              pinnedPx !== null && 'lg:absolute lg:inset-y-0 lg:right-0',
            )}
            style={pinnedPx !== null ? { width: `${pinnedPx}px` } : undefined}
          >
            <StudioOperatorDock
              variant="column"
              onCollapseColumn={
                libraryChat
                  ? onCloseLibraryAssistant
                  : bench
                    ? collapseConversation
                    : undefined
              }
            />
          </div>
        ) : null}
      </section>

      {bench && !conversationHidden && !libraryOpen ? (
        <StudioShellDivider
          stageRef={stageRef}
          conversationRef={conversationRef}
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

      {/* 首页也摆（用户 10-26 定稿 v5：左栏不再有「工作台」，开台只走这一条）。 */}
      {libraryOpen ? null : (
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
          bench ? 'block lg:flex lg:h-full' : 'hidden',
          avatarDocked && 'studio-shell-chat-collapsed',
        )}
        style={{
          opacity:
            collapsePreview === 'bench'
              ? SHELL_MOTION.collapsePreviewOpacity
              : undefined,
          transition: pullTransition,
        }}
      >
        {bench && avatarDocked ? (
          <StudioShellExpandChat onExpand={expandConversation} />
        ) : null}
        <div
          ref={contentRef}
          data-testid="studio-shell-bench"
          className="relative min-w-0 lg:min-h-0 lg:flex-1 lg:overscroll-x-none lg:contain-layout"
        >
          {children}
        </div>
      </div>
      {libraryLayer}
      <StudioShellAvatarFlight
        plan={flight}
        rootRef={stageRef}
        onLanded={endFlight}
      />
    </div>
  )
}

type StudioShellCollapseSide = 'conversation' | 'bench' | null

/**
 * 对话 | 台 之间那一根线（「拉」，9f-4）。拖：宽跟手，离默认宽 `snapPx` 以内吸到默认宽；
 * 拖过最小值再多 `collapseSlackPx`，要收起的那一边变淡，**松手才收**（中途拖回来就不收）。
 * 双击回默认宽。键盘：←/→ 一下挪 `keyStepPx`。
 */
function StudioShellDivider({
  stageRef,
  conversationRef,
  conversationPx,
  onResize,
  onDraggingChange,
  onPreviewCollapse,
  onCollapseConversation,
  onCloseBench,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>
  /** 宽从对话栏左缘量起：左边摊着记录那一列时，⛔ 从白板左缘量。 */
  conversationRef: React.RefObject<HTMLElement | null>
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
    const stage = stageRef.current?.getBoundingClientRect()
    const left = conversationRef.current?.getBoundingClientRect().left
    const width = stage ? stage.right - (left ?? stage.left) : 0
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
    const left =
      conversationRef.current?.getBoundingClientRect().left ??
      stageRef.current?.getBoundingClientRect().left ??
      0
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
      className="group relative hidden w-px shrink-0 cursor-col-resize touch-none bg-border focus-visible:outline-none lg:block"
    >
      {/* 线只有 1px，手感区左右各放宽一截。 */}
      <span
        aria-hidden
        className="absolute inset-y-0 -left-1.5 -right-1.5 transition-colors duration-fast ease-standard group-hover:bg-border/60 group-focus-visible:bg-ring/40"
      />
    </div>
  )
}
