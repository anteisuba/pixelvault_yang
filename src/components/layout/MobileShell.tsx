'use client'

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { motion, useAnimate, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  MOBILE_CREATE_LONG_PRESS_MS,
  MOBILE_EDGE_SWIPE,
  MOBILE_TABS,
  SHELL_NAV_TOOLS,
  activeShellTool,
  isShellNavItemActive,
  isStudioBenchPath,
  type ShellNavItem,
} from '@/constants/navigation'
import { motionTransition, springTransition } from '@/constants/motion'
import { ROUTES } from '@/constants/routes'
import { ArrowLeft, ChevronDown, Plus } from '@/components/icons'
import { SidebarInset } from '@/components/ui/sidebar'
import { MobileToolSheet } from '@/components/layout/MobileToolSheet'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import {
  useLastChatPath,
  useLastStudioToolId,
  useMobileReturnPath,
  useRecordMobileNav,
} from '@/hooks/use-mobile-nav-memory'
import {
  useMobileTabBarActionsActive,
  useMobileTabBarActionsHost,
} from '@/hooks/use-mobile-tabbar-actions'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'
import { useMobileTabBarHidden } from '@/hooks/use-mobile-tabbar-hidden'
import { useWindowScrollAway } from '@/hooks/use-window-scroll-away'
import { useToastLift } from '@/hooks/use-toast-lift'
import { isStudioShellPath } from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/**
 * 手机（<768）的导航壳 —— 方向 P3「底栏」（owner 2026-10-07 选 P3，2026-10-09
 * 手机稿 v10 定稿，`docs/references/pages/app-shell.md` §6）。
 *
 * - **页面上**：浮起的胶囊底栏 `对话 · 素材 · 画廊 · 角色 · 我的` + 右边一颗黑圆 ＋（手机 iOS 稿，
 *   owner 2026-10-16 选 B；「对话」2026-11-12 加在最前，对话页也带底栏）。＋ 拉起一张底部卡（`MobileToolSheet`：顶上一句话出图 + 七个台，上次用的
 *   那个标「上次」），长按 ＋ 直接进上次的工具。
 * - **台里**（`/studio/**` 除了对话页）：底栏收起，顶上一条 `← · 图片 ▾ · （助手）`。
 *   ← 回到进来之前那一页；中间就地换工具；右端那一格留给助手头像（它自己 fixed 上来）。
 *
 * ⚠ 768–1023 是平板，走桌面侧栏（owner 2026-10-09 平板 = 缩小版电脑），不走这个壳。
 * ⛔ 条目只来自 `src/constants/navigation.ts`，这里不抄第二份。
 * ⛔ 账号菜单不挂在底栏：它在「我的」页封面右上的 ⚙（v10「我的」稿）。
 */

/** `/settings` 与它的分区页（自己画白板，主卡不再浮起）。 */
function isSettingsPath(pathname: string): boolean {
  return (
    pathname === ROUTES.SETTINGS || pathname.startsWith(`${ROUTES.SETTINGS}/`)
  )
}

const TAB_CLASS =
  'relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-full text-2xs font-medium text-muted-foreground transition-colors duration-fast ease-standard active:bg-muted [&>svg]:relative [&>svg]:size-5.5'

/**
 * 底栏一格。当前页那块灰底是**同一个元素滑过去**（`layoutId` + `SPRING.slot`，与
 * 标签台页签、设置左栏同一手感），⛔ 不是每格各自亮灭（owner 2026-10-16）。
 * `active` 由底栏给：点下去就先挪过去，不等新页面加载完（点击后动作同时起步）。
 */
function MobileTab({
  item,
  active,
  onPress,
}: {
  item: ShellNavItem
  active: boolean
  /** `again` = 点的是已经在的那一格（回到顶部，⛔ 再导航一次）；`href` = 这一下去哪。 */
  onPress: (again: boolean, href: string | null) => void
}) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const reduceMotion = useReducedMotion()
  const lastChatPath = useLastChatPath()
  const Icon = item.icon
  // 底栏五格、一格 54 宽：「我的主页」叫「我的」（v10 稿），角色叫短名（英 Cast、日 キャラ）。
  const label =
    item.id === 'profile' || item.id === 'cards'
      ? tMobile(`tabs.${item.id}`)
      : t(item.labelKey)
  return (
    <Link
      // 「对话」回到上次那段（`useLastChatPath`），其余格子照条目走。
      href={item.id === 'chat' ? (lastChatPath ?? item.href) : item.href}
      onClick={(event) => {
        // 点已经在的那一格 = 回到顶部（iOS 底栏的习惯），⛔ 原地再导航一次。
        if (active) event.preventDefault()
        onPress(active, event.currentTarget.getAttribute('href'))
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(TAB_CLASS, active && 'font-semibold text-foreground')}
    >
      {active ? (
        <motion.span
          aria-hidden
          layoutId="mobile-tab-thumb"
          className="absolute inset-0 rounded-full bg-muted"
          transition={springTransition('slot', reduceMotion)}
        />
      ) : null}
      <Icon />
      {/* ⛔ `truncate`：差两三像素的字（日文「ギャラリー」）宁可贴着格边，也别截成「ギャラ…」。 */}
      <span className="relative whitespace-nowrap">{label}</span>
    </Link>
  )
}

/**
 * 底栏每一格各记各的滚动位置（iOS 底栏的习惯）：画廊滚到一半去素材，再点「画廊」回到刚才那里，
 * ⛔ 回到顶上重新翻。滚的是窗口；自己有滚动容器的页给那个容器挂 `data-mobile-scroll-root`。
 * 只在**点格子**进来时还原 —— 页里的链接、后退照旧由路由自己定。
 */
const MOBILE_SCROLL_ROOT_SELECTOR = '[data-mobile-scroll-root]'
const tabScrollTop = new Map<string, number>()
/** 内容是异步长出来的：最多追这么多帧（约 3 秒，素材页要现取），手一碰屏幕就停。 */
const TAB_SCROLL_RESTORE_FRAMES = 180

function mobileScrollRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(MOBILE_SCROLL_ROOT_SELECTOR)
}

function readScrollTop(): number {
  const root = mobileScrollRoot()
  return root ? root.scrollTop : window.scrollY
}

/** 点已经在的那一格：回到顶部（减少动效时直接到位）。 */
function scrollPageToTop(reduceMotion: boolean | null) {
  const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth'
  mobileScrollRoot()?.scrollTo({ top: 0, behavior })
  window.scrollTo({ top: 0, behavior })
}

function useTabScrollMemory(pathname: string): (href: string | null) => void {
  const pending = useRef<string | null>(null)

  useEffect(() => {
    if (pending.current !== pathname) return
    pending.current = null
    const target = tabScrollTop.get(pathname) ?? 0
    if (target <= 0) return
    let frame = 0
    let tries = 0
    let settled = 0
    let cancelled = false
    const cancel = () => {
      cancelled = true
    }
    const step = () => {
      if (cancelled) return
      const root = mobileScrollRoot()
      const max = root
        ? root.scrollHeight - root.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight
      if (max >= target - 1) {
        // `instant`：根上开着平滑滚动（`data-scroll-behavior`），还原要一下到位。
        ;(root ?? window).scrollTo({ top: target, behavior: 'instant' })
      }
      settled = Math.abs(readScrollTop() - target) < 2 ? settled + 1 : 0
      if (settled < 3 && ++tries < TAB_SCROLL_RESTORE_FRAMES)
        frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    window.addEventListener('touchstart', cancel, { passive: true })
    window.addEventListener('wheel', cancel, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('touchstart', cancel)
      window.removeEventListener('wheel', cancel)
    }
  }, [pathname])

  return (href) => {
    // 点下去那一刻记住这一页滚到哪 —— ⛔ 边滚边记：换页时高度先变、窗口被夹回 0，记下的是 0。
    tabScrollTop.set(pathname, readScrollTop())
    // 链接带着语言前缀（`/zh/gallery`），`usePathname` 不带：去掉第一段比对。
    pending.current = href ? stripLocale(href) : null
  }
}

function stripLocale(href: string): string {
  const path = href.split('?')[0]
  const [, first, ...rest] = path.split('/')
  if (!(routing.locales as readonly string[]).includes(first)) return path
  return `/${rest.join('/')}`
}

/** 页面上那条底栏。 */
function MobileTabBar({ pathname }: { pathname: string }) {
  const tMobile = useTranslations('MobileNav')
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const lastToolId = useLastStudioToolId()
  // 记下在哪一页打开的：换了页（面板里的链接、长按跳走）自然就收起。
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (next: boolean) => setOpenAt(next ? pathname : null)
  const barRef = useRef<HTMLElement>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  // 页面借这条栏放动作（素材页多选）：五格糊掉，同一格里动作由糊变清。
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null)
  useMobileTabBarActionsHost(actionsHost)
  const lent = useMobileTabBarActionsActive()
  // 页面往下滑时收起（借给动作栏、＋面板开着时不收）；软键盘起来时也让开 ——
  // 打字时底栏夹在输入框和键盘之间只会挡字（对话页、搜索框）。
  const keyboardOpen = useKeyboardInset() > 0
  const windowAway = useWindowScrollAway()
  const scrolledAway =
    (useMobileTabBarHidden() || windowAway || keyboardOpen) && !lent && !open
  // 刚点的那一格（记下点时在哪一页）：灰块先滑过去，地址一换就交回给路由判定。
  const [pressedTabAt, setPressedTab] = useState<{
    id: string
    at: string
  } | null>(null)
  const pressedTab = pressedTabAt?.at === pathname ? pressedTabAt : null

  useToastLift(barRef)
  const restoreTarget = useTabScrollMemory(pathname)

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current)
    },
    [],
  )

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const startPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    longPressed.current = false
    cancelPress()
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null
      longPressed.current = true
      const last =
        SHELL_NAV_TOOLS.find((item) => item.id === lastToolId) ??
        SHELL_NAV_TOOLS[0]
      setOpen(false)
      router.push(last.href)
    }, MOBILE_CREATE_LONG_PRESS_MS)
  }

  return (
    <>
      <MobileToolSheet
        open={open}
        onOpenChange={setOpen}
        pathname={pathname}
        mode="create"
      />

      <nav
        ref={barRef}
        aria-label={tMobile('tabs.label')}
        data-scrolled-away={scrolledAway || undefined}
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 px-4 pb-safe-inset-bottom transition-transform duration-base ease-standard motion-reduce:transition-none lg:hidden',
          scrolledAway && 'translate-y-full',
        )}
      >
        {/* 从台回来（或刚打开）时底栏从下面升上来：和台顶栏滑进来是一对。 */}
        <motion.div
          initial={reduceMotion ? false : { y: '140%' }}
          animate={{ y: 0 }}
          transition={springTransition('slot', reduceMotion)}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {/* iOS 26 式浮起的胶囊：五个去处；＋ 是旁边单独一颗黑圆键（iOS 稿 B）。 */}
          <div className="pointer-events-auto relative mb-2 h-15 min-w-0 flex-1 rounded-full border border-border p-1 shadow-pop surface-glass">
            <div
              inert={lent}
              className={cn(
                'grid h-full grid-cols-5 items-stretch transition-[opacity,filter] duration-fast ease-standard motion-reduce:transition-none',
                lent && 'pointer-events-none opacity-0 blur-xs',
              )}
            >
              {MOBILE_TABS.map((item) => (
                <MobileTab
                  key={item.id}
                  item={item}
                  active={
                    pressedTab
                      ? pressedTab.id === item.id
                      : isShellNavItemActive(item, pathname)
                  }
                  onPress={(again, href) => {
                    if (again) {
                      scrollPageToTop(reduceMotion)
                      return
                    }
                    setPressedTab({ id: item.id, at: pathname })
                    restoreTarget(href)
                  }}
                />
              ))}
            </div>
            <div
              ref={setActionsHost}
              className={cn(
                'absolute inset-0 transition-[opacity,filter] duration-fast ease-standard motion-reduce:transition-none',
                lent ? 'delay-100' : 'pointer-events-none opacity-0 blur-xs',
              )}
            />
          </div>
          <button
            type="button"
            aria-label={open ? tMobile('close') : tMobile('create')}
            aria-expanded={open}
            aria-haspopup="dialog"
            onPointerDown={startPress}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => {
              if (longPressed.current) {
                longPressed.current = false
                return
              }
              setOpen(!open)
            }}
            className="pointer-events-auto mb-2 flex size-15 shrink-0 select-none items-center justify-center rounded-full bg-foreground text-background shadow-pop transition-transform duration-fast ease-standard active:scale-95"
          >
            {/* ＋ 转 45° 就是 ×：同一个元素变形，不换图标。 */}
            <motion.span
              aria-hidden
              animate={{ rotate: open ? 45 : 0 }}
              transition={springTransition('slot', reduceMotion)}
              className="flex"
            >
              <Plus className="size-6" />
            </motion.span>
          </button>
        </motion.div>
      </nav>
    </>
  )
}

/**
 * 台上左缘右划 = 返回（owner 2026-11-03 手机方向「左缘右滑或 ‹ 回对话」）。只在装到主屏
 * （standalone）时接：浏览器里 Safari 自己有这个手势，再接一遍会退两次。
 */
function useEdgeSwipeBack(href: string) {
  const router = useRouter()
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!standalone) return
    let start: { x: number; y: number } | null = null
    const down = (event: TouchEvent) => {
      const touch = event.touches[0]
      start =
        event.touches.length === 1 && touch.clientX <= MOBILE_EDGE_SWIPE.edgePx
          ? { x: touch.clientX, y: touch.clientY }
          : null
    }
    const up = (event: TouchEvent) => {
      if (!start) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - start.x
      const dy = Math.abs(touch.clientY - start.y)
      start = null
      if (dx >= MOBILE_EDGE_SWIPE.triggerPx && dy <= MOBILE_EDGE_SWIPE.slopPx)
        router.push(href)
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchend', up, { passive: true })
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchend', up)
    }
  }, [href, router])
}

/**
 * 工作台里那条顶栏：`← · 图片 ▾ · （助手）`。
 * 44px 一条 + 顶部安全区（`box-content` 让 `pt-safe-inset-top` 往外长，不吃掉 44），
 * 主区的 `mobile-inset-topbar` 同步让出同样的高度。
 */
function MobileStudioBar({ pathname }: { pathname: string }) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const returnPath = useMobileReturnPath()
  const reduceMotion = useReducedMotion()
  const current = activeShellTool(pathname) ?? SHELL_NAV_TOOLS[0]
  const CurrentIcon = current.icon
  useEdgeSwipeBack(returnPath ?? ROUTES.STUDIO)
  // 记下在哪个台打开的：换了台（卡里的链接）自然就收起。
  const [switchingAt, setSwitchingAt] = useState<string | null>(null)
  const switching = switchingAt === pathname
  const setSwitching = (next: boolean) => setSwitchingAt(next ? pathname : null)

  return (
    <header className="fixed inset-x-0 top-0 z-40 box-content flex h-11 items-center bg-background px-1 pt-safe-inset-top lg:hidden">
      <Link
        href={returnPath ?? ROUTES.STUDIO}
        aria-label={tMobile('back')}
        className="flex size-9 shrink-0 items-center coarse:size-11 justify-center rounded-full text-foreground transition-colors duration-fast ease-standard active:bg-muted"
      >
        <ArrowLeft className="size-5" />
      </Link>

      {/* 进台时台名从右边滑进来（「推进来」的那一下），换台时也一样：key 跟着台走。 */}
      <motion.div
        key={current.id}
        initial={reduceMotion ? false : { x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={springTransition('slot', reduceMotion)}
        className="flex min-w-0 flex-1 justify-center"
      >
        {/* 点台名拉起和 ＋ 同一张卡换台（owner 2026-11-03 手机方向），⛔ 另起一个下拉菜单。 */}
        <button
          type="button"
          aria-label={tMobile('switchTool')}
          aria-haspopup="dialog"
          aria-expanded={switching}
          onClick={() => setSwitching(true)}
          className="flex h-8 min-w-0 items-center coarse:h-11 gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground transition-colors duration-fast ease-standard active:bg-muted aria-expanded:bg-muted"
        >
          <CurrentIcon className="size-4 shrink-0" />
          <span className="truncate">{t(current.labelKey)}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </motion.div>

      <MobileToolSheet
        open={switching}
        onOpenChange={setSwitching}
        pathname={pathname}
        mode="switch"
      />

      {/* 右端留给**助手头像**：它是工作台上那颗持久 fixed 的开关，落在这一格上。 */}
      <span className="size-9 shrink-0 coarse:size-11" aria-hidden />
    </header>
  )
}

export function MobileShell() {
  const pathname = usePathname()
  useRecordMobileNav(pathname)

  return isStudioBenchPath(pathname) ? (
    <MobileStudioBar pathname={pathname} />
  ) : (
    <MobileTabBar pathname={pathname} />
  )
}

/**
 * 主区（`SidebarInset`）给手机外壳让位：工作台让出顶栏，其余页让出底栏；
 * 桌面（≥768）两样都归零。`h-page` 读这里写下的 `--mobile-chrome-height`（globals.css）。
 */
export function MobileShellInset({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bench = isStudioBenchPath(pathname)
  const reduceMotion = useReducedMotion()
  const [scope, animate] = useAnimate<HTMLElement>()
  // 页 ⇄ 台：主区淡一下换过去（顶栏 / 底栏各自滑进来）。只动透明度 ——
  // ⛔ transform：主区里一堆 fixed 的输入条会跟着位移（transform 会变成它们的定位框）。
  const benchBefore = useRef(bench)
  useEffect(() => {
    if (benchBefore.current === bench) return
    benchBefore.current = bench
    if (reduceMotion || !scope.current) return
    if (
      !window.matchMedia?.(`(max-width: ${MOBILE_BREAKPOINT - 0.02}px)`).matches
    )
      return
    void animate(scope.current, { opacity: [0, 1] }, motionTransition('base'))
  }, [animate, bench, reduceMotion, scope])
  return (
    <SidebarInset
      ref={scope}
      id="main-content"
      className={cn(
        bench ? 'mobile-inset-topbar' : 'mobile-inset-tabbar',
        // ≥768 侧栏让给外壳的左栏（第 9f 步）：主卡不再浮起。设置页自己画同一副白板（ui-spec §1）。
        (isStudioShellPath(pathname) || isSettingsPath(pathname)) &&
          'lg:rounded-none lg:border-l-0 lg:shadow-none',
      )}
    >
      {children}
    </SidebarInset>
  )
}
