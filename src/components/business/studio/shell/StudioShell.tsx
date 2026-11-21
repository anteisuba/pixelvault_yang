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
  type RefObject,
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
  STUDIO_SHELL_PULL_ANCHOR_ATTR,
  STUDIO_SHELL_PULL_ANCHOR_SELECTOR,
  STUDIO_SHELL_SPLIT,
  readStudioShellPullAnchor,
  studioShellPullAnchor,
  studioShellPullCompensation,
  studioShellPullSlides,
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
import { StudioOperatorDock } from '@/features/assistant'
import { HomeDraftBench } from '@/components/business/studio/shell/HomeDraftBench'
import { StudioConversationList } from '@/components/business/studio/shell/StudioConversationList'
import {
  StudioLibraryAssistantOpenContext,
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
  StudioBenchNavContext,
  StudioShellExpandChat,
  activeBenchId,
  useStudioBenchMotion,
  useStudioBenchSwipe,
  type StudioBenchNav,
} from '@/components/business/studio/shell/StudioShellBench'
import {
  StudioShellHistoryKey,
  StudioShellPersonaKey,
} from '@/components/business/studio/shell/StudioShellHistoryKeys'
import { useHomeOperatorHost } from '@/features/assistant/hooks'
import { useIsDesktopShell } from '@/hooks/use-mobile'
import { useStudioConversationBenchSync } from '@/hooks/use-studio-conversation-bench'
import { useStudioConversationUrl } from '@/hooks/use-studio-conversation-url'
import { useStudioOperatorActions } from '@/features/assistant/hooks'
import {
  useStudioOperatorHistoryView,
  type StudioOperatorHistoryRestore,
} from '@/hooks/use-studio-operator-history'
import { useStudioOperatorSelector } from '@/hooks/use-studio-operator-store'
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

/** 对话 | 台 之间那根线的宽（`StudioShellDivider` 的 `w-px`）：「拉」时台要多走这一截。 */
const SHELL_DIVIDER_PX = 1

/** 「拉」的兜底：比动画多等这么久还没播完（后台标签页）就直接落定（同 `shellLeave`）。 */
const SHELL_PULL_GRACE_MS = 150

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
 *   往右拖到底收起台（回到只有对话）。开台 / 换台 / 收台都走左栏（owner 11-04，ui-spec §1）。
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
   * 手机（<768）上库一律就地当一整页画，⛔ 盖满屏的叠层 —— 与搬进库之前那一页长得一样，
   * 底栏照旧（9f-2e）。直接打开（旧地址 308 过来、底栏点「素材」…）库就是 `children`；
   * 从台上软跳转过来（工作台顶栏 ←、台上的库链接）库在 `@library` 那一格，台不画。
   * ⚠ 手机上叠层既没有关闭键、又盖住底栏（z-40 同层、后挂在上）：工作台 ← 回素材页
   *   底栏整条不见（bug-mobile-tabbar，2026-11-02）。后退照旧回到台。
   */
  const libraryInPlace = isDesk === false && routeKind === 'library'
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
  /** 库里左上那颗助手头像叫出了对话（对话从左边出来）；库收掉就复位。 */
  const [libraryAssistantOpen, setLibraryAssistantOpen] = useState(false)
  if (!libraryOpen && libraryAssistantOpen) setLibraryAssistantOpen(false)
  /** 稳定引用：对话那一栏按它记住 Dock 元素，外壳每次重渲 ⛔ 拖着整块面板一起重渲。 */
  const closeLibraryAssistant = useCallback(
    () => setLibraryAssistantOpen(false),
    [],
  )
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
      // ⚠ 开没开着走单独的 `StudioLibraryAssistantOpenContext`：放在这里，库里叫出 / 收起助手
      //   那一下所有读这份 context 的库页（素材页上千张格子）整页跟着重渲（用户 11-18 量到 450–580ms 不出帧）。
      setAssistantOpen: setLibraryAssistantOpen,
    }),
    [
      cameFromShell,
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
   * 对话头那几颗键（owner 11-04）：最左一颗「记录」—— 首页、台上、手机同一颗、同一个下拉，
   * ⛔ 框里不再摊一列记录，也 ⛔ 和左栏的「去哪儿」混在一起。
   */
  const headerSlots = useMemo<StudioShellHeaderSlots>(
    () => ({
      history: <StudioShellHistoryKey />,
      persona: <StudioShellPersonaKey />,
    }),
    [],
  )
  /** 左栏换台 / 收台借台框的「推 / 滑」（左栏在台框外面，台框在场时把两只手挂上来）。 */
  const benchNavRef = useRef<StudioBenchNav | null>(null)

  /**
   * 库的落点。⚠ `left` / `width` 只在落定时跳一次（开合的那一段走 `StudioShellStage` 里的
   * transform），⛔ 再给它们挂过渡：每帧一次整页库（上千张格子）的重排（用户 11-18）。
   */
  const libraryLayer = (
    <div
      ref={setLibraryTarget}
      data-testid="studio-library-target"
      className="fixed inset-0 z-40 empty:hidden lg:absolute lg:overflow-hidden lg:inset-y-0 lg:right-auto lg:left-(--library-left) lg:z-10 lg:w-(--library-width) lg:bg-background lg:pr-(--library-pad)"
    />
  )
  /**
   * 左栏、首页那份小配方按元素记住：库里叫出 / 收起助手只改外壳这一格 state，⛔ 顺手把它们重渲一遍。
   * （它们要的东西都从 context / store 读，⛔ 靠外壳重渲取新值。）
   */
  const conversationList = useMemo(
    () => <StudioConversationList className="hidden lg:flex" />,
    [],
  )
  const homeDraftBench = useMemo(
    () => <HomeDraftBench onHost={setDraftHost} />,
    [],
  )

  return (
    <StudioOperatorDockPlacementProvider value={placement}>
      <StudioBenchNavContext.Provider value={benchNavRef}>
        <StudioShellHeaderSlotsProvider value={headerSlots}>
          <StudioLibraryTargetContext.Provider value={libraryContext}>
            <StudioLibraryAssistantOpenContext.Provider
              value={libraryAssistantOpen}
            >
              <StudioLibraryPickProvider>
                <StudioOperatorHostSlotProvider fallback={homeHost}>
                  {() => (
                    <div
                      data-testid="studio-shell"
                      data-kind={kind}
                      data-library={libraryCategory ?? undefined}
                      className="lg:flex lg:h-svh lg:overflow-hidden lg:bg-surface-sunken"
                    >
                      {conversationList}
                      {kind === 'page' ? (
                        <div
                          className={cn(
                            SHELL_BOARD_CLASS,
                            'lg:overflow-y-auto',
                          )}
                          style={libraryWidth('100%')}
                        >
                          {/* 从台上过来的：`children` 还是那张台，库在 `@library` 那一格就地画。 */}
                          {base === null ? children : null}
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
                          benchNavRef={benchNavRef}
                          onCloseLibraryAssistant={closeLibraryAssistant}
                        >
                          {children}
                        </StudioShellStage>
                      )}
                      <StudioLibrarySlotContext.Provider value>
                        {library}
                      </StudioLibrarySlotContext.Provider>
                      {kind === 'home' ? homeDraftBench : null}
                    </div>
                  )}
                </StudioOperatorHostSlotProvider>
              </StudioLibraryPickProvider>
            </StudioLibraryAssistantOpenContext.Provider>
          </StudioLibraryTargetContext.Provider>
        </StudioShellHeaderSlotsProvider>
      </StudioBenchNavContext.Provider>
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
  const sessionId = useStudioOperatorSelector((state) => state.sessionId)
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
function libraryWidth(
  width: string,
  left = '0px',
  /** 右边垫出的那一截（收起助手那一段：落点放宽、内容宽不变，见 `libraryPull`）。 */
  pad = '0px',
): CSSProperties {
  return {
    '--library-width': width,
    '--library-left': left,
    '--library-pad': pad,
  } as CSSProperties
}

function StudioShellStage({
  kind,
  benchPathname,
  shellDock,
  libraryOpen,
  libraryAssistantOpen,
  libraryLayer,
  benchNavRef,
  onCloseLibraryAssistant,
  children,
}: {
  kind: 'home' | 'bench'
  /** 台条认哪一个台：库叠着时地址是 `/library/…`，按底下那一页认。 */
  benchPathname: string
  shellDock: boolean
  libraryOpen: boolean
  /** 库里叫出了助手：对话贴在白板左边（和工作台、首页一致），库往右让出那一块。 */
  libraryAssistantOpen: boolean
  libraryLayer: ReactNode
  /** 左栏借这两只手换台 / 收台（`StudioBenchNavContext`）。 */
  benchNavRef: RefObject<StudioBenchNav | null>
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
  /** 「拉」时台那一列以什么为锚平移（画布靠左，其余居中，见 `studioShellPullAnchor`）。 */
  const pullAnchor = studioShellPullAnchor(activeId)
  /**
   * 从首页点进台：对话一律和台并排（owner 11-19「都展开」）。
   * ⚠ 只在「没台 → 有台」那一下定，进台之后照用户自己拖的。
   */
  const benchBefore = useRef(bench)
  useLayoutEffect(() => {
    const entering = bench && !benchBefore.current
    benchBefore.current = bench
    if (entering) setConversationCollapsed(false)
  }, [bench, setConversationCollapsed])
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
  useEffect(() => {
    benchNavRef.current = {
      switchBench: (item) => void switchBench(item),
      closeBench: () => void closeBench(),
    }
    return () => {
      benchNavRef.current = null
    }
  }, [benchNavRef, closeBench, switchBench])
  /** 拖着线：宽跟手、⛔ 动画；松手 / 键盘 / 双击才走「拉」那一段。 */
  const [dragging, setDragging] = useState(false)
  /** 拖过头、松手就会收起的那一边（变淡提示）。 */
  const [collapsePreview, setCollapsePreview] =
    useState<StudioShellCollapseSide>(null)
  /**
   * 「拉」：对话收起 / 展开那一段（用户 11-18 真机：工作台分一到三步跳过去）。
   * ⭐ 只动 transform（WAAPI，合成线程跑，主线程忙也不掉帧）：这一段里对话栏浮起来、
   *   宽钉在原宽、画在台那一列上面，台那一列按「收完」的宽排一次，两块用同一段时长、同一条缓动一起平移；
   *   ⛔ 再动对话栏的 `width` —— 那是每帧一次整块台（大图 / 视频 / 3D）的重排。
   *   台的重排只剩一次：收起在起步那一帧（台已被平移到原位，看不出），展开在落定那一帧。
   */
  const [pulling, setPulling] = useState<'collapse' | 'expand' | null>(null)
  /** 回调里读（⛔ 进依赖：回调一变，记住的 Dock 元素就跟着重渲）。 */
  const pullingRef = useRef(pulling)
  useLayoutEffect(() => {
    pullingRef.current = pulling
  }, [pulling])
  /** 拖过头收台：台退出去、回到只有对话之后，再把对话栏记住的宽放回按下那一刻的。 */
  const restoreAfterClose = useRef<number | null>(null)
  useEffect(() => {
    if (bench || restoreAfterClose.current === null) return
    setConversationPx(restoreAfterClose.current)
    restoreAfterClose.current = null
  }, [bench, setConversationPx])

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

  /** 点下去这一拍就起步（⛔ 等两帧 rAF / 等面板排版）：只记一个状态，平移在下面的 layout effect 里挂。 */
  const collapseConversation = useCallback(() => {
    if (pullingRef.current) return
    if (reduceMotion) {
      setConversationCollapsed(true)
      return
    }
    takeOff('header', 'bench')
    setPulling('collapse')
  }, [reduceMotion, setConversationCollapsed, takeOff])
  const expandConversation = useCallback(() => {
    if (pullingRef.current) return
    setConversationCollapsed(false)
    if (reduceMotion) return
    takeOff('bench', 'header')
    setPulling('expand')
  }, [reduceMotion, setConversationCollapsed, takeOff])

  /**
   * 「拉」的那两条平移。对话栏这一段里是浮起来的（宽 = 开着时的宽，与在流里时同一条
   * `maxWidth`），台那一列铺满白板；`shift` = 栏宽 + 分隔线，台那一列走多少按锚（owner 11-21
   * 「回收时闪一下」：整列走 `shift` 只让靠左的内容对得上，居中内容起步 / 落定各跳 shift/2）：
   * · 收起：栏 0 → −shift；台 居中锚 +shift/2 → 0、靠左锚（画布）+shift → 0
   *   （起步那一帧台已按收完的整宽排好，居中内容正好在原处）。
   * · 展开：栏 −shift → 0；台 居中锚 0 → +shift/2、靠左锚 0 → +shift
   *   （落定那一帧台才按并排的宽重排，同一帧撤掉平移，居中内容正好在落点）。
   * ⚠ 居中锚下台那一列左边 shift/2 那一截压在滑动中的对话栏底下：栏这一段里 `z-10` 画在列上面、
   *   底色不透明（`bg-surface-companion`）；列右边多出来的那截由白板 `overflow-hidden` 裁掉。
   * ⚠ `fill: 'forwards'` 把终点钉住，直到 `pulling` 回到 null 的那次提交里（cleanup）才撤 ——
   *   ⛔ 先撤平移再换布局，中间闪一帧。
   * ⚠ 没有 `element.animate`（jsdom）就直接落到终点。
   */
  useLayoutEffect(() => {
    if (!pulling) return
    const section = conversationRef.current
    const column = columnRef.current
    const finish = () => {
      if (pulling === 'collapse') setConversationCollapsed(true)
      setPulling(null)
    }
    if (!section || !column) {
      finish()
      return
    }
    const shift = section.offsetWidth + SHELL_DIVIDER_PX
    const slides = studioShellPullSlides(pulling, shift, pullAnchor)
    // 与列锚不同的常驻块（画布的底栏 / 停靠区 / 右上剪辑台 / 小地图，一般台靠左的那一行…）
    // 自己声明锚：同一段里叠一条补偿平移（`composite: 'add'`，⛔ 盖掉它自己定位用的 transform）。
    // 只收起步这一刻在场的；⚠ 打标的块不互相嵌套（见 `STUDIO_SHELL_PULL_ANCHOR_ATTR`）。
    const compensations = Array.from(
      column.querySelectorAll<HTMLElement>(STUDIO_SHELL_PULL_ANCHOR_SELECTOR),
    ).flatMap((element): ShellPullSlide[] => {
      const anchor = readStudioShellPullAnchor(
        element.getAttribute(STUDIO_SHELL_PULL_ANCHOR_ATTR),
      )
      const slide =
        anchor &&
        studioShellPullCompensation(pulling, shift, pullAnchor, anchor)
      return slide ? [[element, ...slide, 'add']] : []
    })
    return runShellPull(
      [
        [section, ...slides.conversation],
        [column, ...slides.column],
        ...compensations,
      ],
      finish,
    )
  }, [pulling, pullAnchor, setConversationCollapsed])

  // 库是整页（ui-spec §9）：盖满白板；叫出助手时对话按记住的宽贴在左边、库往右让。
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
  /**
   * 库里叫出助手（所有库，owner 2026-11-18：和工作台、首页一致）：对话照首页那样从左排开
   *（⛔ 浮在库上），库从它右边开始。
   */
  const libraryChat = libraryOpen && libraryAssistantOpen
  /**
   * 库里的「拉」（用户 11-18 真机：素材页点下去 450–580ms 不出帧、再一步跳过去）：和工作台同一套 ——
   * 对话栏浮起来贴左边，两块只动 transform，⭐ **先动、后排**：库内容的宽在这一段里一律不变，
   * 落定那一帧才换（整页库换宽 = 各页按宽重算格子的那次重渲，起步那一帧做它 = 动画等它排完才出第一帧）。
   * · 叫出：库照整宽，栏 −W → 0，库 0 → +W（右边那截被白板裁掉）；落定后库按「让出 W」重排。
   * · 收起：库照窄宽（`left: W`，内容宽仍 100%−W），落点右边垫出 W（`--library-pad`，底色同库）
   *   把空出来的那截盖住；栏 0 → −W，库 0 → −W；落定后库按整宽重排。
   * ⛔ 给落点的 `left` / `width` 挂过渡（每帧一次整页重排）。
   * 在渲染里派生（⛔ effect 里 setState 多等一帧）：开着的那一下就进「拉」。
   */
  const [prevLibraryChat, setPrevLibraryChat] = useState(libraryChat)
  const [libraryPull, setLibraryPull] = useState<'open' | 'close' | null>(null)
  if (prevLibraryChat !== libraryChat) {
    setPrevLibraryChat(libraryChat)
    setLibraryPull(
      libraryOpen && !reduceMotion ? (libraryChat ? 'open' : 'close') : null,
    )
  }
  if (!libraryOpen && libraryPull !== null) setLibraryPull(null)
  const libraryPullRef = useRef(libraryPull)
  useLayoutEffect(() => {
    libraryPullRef.current = libraryPull
  }, [libraryPull])
  useLayoutEffect(() => {
    if (!libraryPull) return
    const section = conversationRef.current
    const layer = stageRef.current?.querySelector<HTMLElement>(
      '[data-testid="studio-library-target"]',
    )
    const finish = () => setLibraryPull(null)
    // <1024 库是盖满屏幕的 `fixed` 叠层、对话不在它左边：⛔ 平移（会把整屏的库推出去 400px）。
    if (!section || !layer || getComputedStyle(layer).position !== 'absolute') {
      finish()
      return
    }
    const shift = section.offsetWidth
    return runShellPull(
      libraryPull === 'open'
        ? [
            [section, -shift, 0],
            [layer, 0, shift],
          ]
        : [
            [section, 0, -shift],
            [layer, 0, -shift],
          ],
      finish,
    )
  }, [libraryPull])
  /** 这一段里再点收起 ⛔ 叠一段（叫出时反向由头像那颗键触发，派生里会接上）。 */
  const closeLibraryChat = useCallback(() => {
    if (libraryPullRef.current) return
    onCloseLibraryAssistant()
  }, [onCloseLibraryAssistant])
  const libraryChatShown = libraryChat || libraryPull !== null
  /** 对话在库左边、库已让出那一块（落定之后）。 */
  const libraryChatSettled = libraryChat && libraryPull === null
  /** 库内容按窄宽排着：叫出落定之后，以及收起的那一段（见上）。 */
  const libraryNarrow = libraryChatSettled || libraryPull === 'close'
  const libraryLayout = libraryNarrow
    ? libraryWidth(
        libraryPull === 'close' ? '100%' : `calc(100% - ${conversationWidth})`,
        conversationWidth,
        libraryPull === 'close' ? conversationWidth : '0px',
      )
    : libraryWidth('100%')
  /** 拖过头变淡那一下；「拉」本身走上面的 transform，⛔ 宽的过渡。 */
  const previewTransition =
    dragging || reduceMotion
      ? undefined
      : `opacity ${DURATION_MS.fast}ms ${EASE_STANDARD_CSS}`
  /**
   * 对话栏浮起来（贴白板左边、宽照旧）：「拉」的那一段，以及收着的时候 ——
   * 收着时 ⛔ `display: none`，只是看不见（`invisible`，读屏与 Tab 都够不着）：
   * 面板一直排着版，点展开那一拍直接起步，⛔ 先等整块面板从零排一遍（用户 11-18：空档 0.4–1.2 秒）。
   */
  const conversationFloating =
    bench && !libraryOpen && (conversationHidden || pulling !== null)
  /**
   * 对话那一栏的 Dock 元素按「收起」回调记住：外壳为「拉」/ 头像飞重渲几次，
   * ⛔ 每次都把整块面板（时间线、输入区）跟着重渲一遍 —— 点下去到起步的空档就在这里。
   */
  const collapseHandler = libraryChatShown
    ? closeLibraryChat
    : bench
      ? collapseConversation
      : undefined
  /**
   * 「收起」走一颗稳定的回调、按 ref 分派：台上开库再叫出助手，收起从「收对话」换成「收库里的助手」，
   * ⛔ 因此换一个 Dock 元素、整块面板重渲。只有「有没有收起键」变了才换。
   */
  const collapseHandlerRef = useRef(collapseHandler)
  useLayoutEffect(() => {
    collapseHandlerRef.current = collapseHandler
  }, [collapseHandler])
  const hasCollapse = libraryChatShown || bench
  const collapseColumn = useCallback(() => collapseHandlerRef.current?.(), [])
  const dock = useMemo(
    () => (
      <StudioOperatorDock
        variant="column"
        onCollapseColumn={hasCollapse ? collapseColumn : undefined}
      />
    ),
    [collapseColumn, hasCollapse],
  )

  return (
    <div
      ref={stageRef}
      data-testid="studio-shell-stage"
      className={cn(
        SHELL_BOARD_CLASS,
        'lg:flex lg:overflow-hidden',
        flight && 'studio-shell-avatar-flying',
      )}
      style={libraryLayout}
    >
      <section
        ref={conversationRef}
        aria-label={t('conversations')}
        data-testid="studio-shell-conversation"
        className={cn(
          'relative min-h-0 min-w-0 flex-col',
          bench
            ? 'hidden lg:flex lg:shrink-0 lg:overflow-hidden lg:bg-surface-companion'
            : 'flex h-page flex-1',
          conversationFloating && 'lg:absolute lg:inset-y-0 lg:left-0',
          // 「拉」的那一段画在台那一列上面：列挂着 transform 自成层叠上下文、DOM 里又靠后，
          // 居中锚下它左边那截会盖住滑动中的栏（见上面的平移注释）。
          conversationFloating && pulling !== null && 'lg:z-10',
          conversationHidden && pulling === null && 'lg:invisible',
          // 库开着而对话不在左边排着（收着 / 「拉」的那一段）：浮起来贴左边，宽照旧；
          // 收着时 ⛔ `display: none`，只是看不见 —— 面板一直排着版，叫出那一拍直接起步。
          libraryOpen &&
            !libraryChatSettled &&
            'lg:absolute lg:inset-y-0 lg:left-0',
          libraryOpen && !libraryChatShown && 'lg:invisible',
          libraryChatShown &&
            'lg:flex lg:flex-none lg:border-r lg:border-border lg:bg-surface-companion',
        )}
        style={
          libraryOpen
            ? { width: conversationWidth }
            : bench
              ? {
                  width: conversationWidth,
                  // 与拖线同一条规矩：放不下两边最小宽时（平板竖拿）对话保住 320，台让。
                  // 浮起来时同一条 `maxWidth`（百分比同样按白板算），宽与在流里时逐像素相同。
                  maxWidth: `max(${STUDIO_SHELL_SPLIT.minConversationPx}px, calc(100% - ${STUDIO_SHELL_SPLIT.minBenchPx}px))`,
                  opacity:
                    collapsePreview === 'conversation'
                      ? SHELL_MOTION.collapsePreviewOpacity
                      : undefined,
                  transition: previewTransition,
                }
              : undefined
        }
      >
        {shellDock ? (
          <div
            data-testid="studio-shell-conversation-body"
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {dock}
          </div>
        ) : null}
      </section>

      {bench && !conversationHidden && !libraryOpen && pulling === null ? (
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
          transition: previewTransition,
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

/**
 * 「拉」的平移（工作台收 / 展对话、库里叫出 / 收起助手共用）：每块从 a 平移到 b，同一段
 * `SHELL_MOTION.pullMs`、同一条缓动，WAAPI 只动 transform（合成线程跑）。走完调 `onDone`；
 * 返回撤销（cleanup 里调）。
 * ⚠ `fill: 'forwards'` 把终点钉住，直到调用方落定那次提交的 cleanup 才撤 —— ⛔ 先撤平移再换布局，中间闪一帧。
 * ⚠ 没有 `element.animate`（jsdom）就直接落到终点。
 * 第四格 `composite`：补偿平移传 `'add'`，叠在元素原有的 transform 上；缺省 `'replace'`。
 */
type ShellPullSlide = readonly [
  element: HTMLElement,
  from: number,
  to: number,
  composite?: CompositeOperation,
]

function runShellPull(
  slides: ReadonlyArray<ShellPullSlide>,
  onDone: () => void,
): (() => void) | undefined {
  if (slides.some(([element]) => typeof element.animate !== 'function')) {
    onDone()
    return undefined
  }
  const timing: KeyframeAnimationOptions = {
    duration: SHELL_MOTION.pullMs,
    easing: EASE_STANDARD_CSS,
    fill: 'forwards',
  }
  const animations = slides.map(([element, a, b, composite = 'replace']) =>
    element.animate(
      [
        { transform: `translate3d(${a}px, 0, 0)` },
        { transform: `translate3d(${b}px, 0, 0)` },
      ],
      { ...timing, composite },
    ),
  )
  let live = true
  const settle = () => {
    if (!live) return
    live = false
    onDone()
  }
  void Promise.all(animations.map((animation) => animation.finished)).then(
    settle,
    // 中途被撤（卸载 / 换台 / 反向）：⛔ 再落状态。
    () => undefined,
  )
  // 兜底（`finished` 迟迟不来）：从动画**真正起步**（`ready`，第一帧提交）起算时长再多一拍，
  // ⛔ 从点击起算 —— 主线程被占着时兜底先到期，会把还没起步的动画直接撤成一步跳（用户 11-18 收起方向）。
  let fallback: number | undefined
  void Promise.all(animations.map((animation) => animation.ready)).then(
    () => {
      if (!live) return
      fallback = window.setTimeout(
        settle,
        SHELL_MOTION.pullMs + SHELL_PULL_GRACE_MS,
      )
    },
    () => undefined,
  )
  // 后台标签页里时间线停着、`ready` 也不来：看不见就直接落到终点，⛔ 卡在半路。
  const onHidden = () => {
    if (document.visibilityState === 'hidden') settle()
  }
  onHidden()
  document.addEventListener('visibilitychange', onHidden)
  return () => {
    live = false
    window.clearTimeout(fallback)
    document.removeEventListener('visibilitychange', onHidden)
    for (const animation of animations) animation.cancel()
  }
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
      {/* 线只有 1px，手感区左右各放宽一截，悬停时浮出居中抓手胶囊。 */}
      <span
        aria-hidden
        className="absolute inset-y-0 -left-1.5 -right-1.5 transition-colors duration-fast ease-standard group-hover:bg-border/60 group-focus-visible:bg-ring/40"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/20 opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 group-focus-visible:bg-ring group-focus-visible:opacity-100"
      />
    </div>
  )
}
