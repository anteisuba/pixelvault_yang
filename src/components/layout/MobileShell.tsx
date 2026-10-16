'use client'

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  MOBILE_CREATE_LONG_PRESS_MS,
  MOBILE_TABS,
  SHELL_NAV_TOOLS,
  activeShellTool,
  isShellNavItemActive,
  isStudioPath,
  type ShellNavItem,
} from '@/constants/navigation'
import { CHIP_POPOVER, springTransition } from '@/constants/motion'
import { ROUTES, studioImageGeneratePath } from '@/constants/routes'
import { ArrowLeft, ArrowUp, ChevronDown, Plus } from '@/components/icons'
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
} from '@/components/ui/responsive-menu'
import { SidebarInset } from '@/components/ui/sidebar'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import {
  useLastStudioToolId,
  useMobileReturnPath,
  useRecordMobileNav,
} from '@/hooks/use-mobile-nav-memory'
import {
  useMobileTabBarActionsActive,
  useMobileTabBarActionsHost,
} from '@/hooks/use-mobile-tabbar-actions'
import { useToastLift } from '@/hooks/use-toast-lift'
import { cn } from '@/lib/utils'

/**
 * 手机（<768）的导航壳 —— 方向 P3「底栏」（owner 2026-10-07 选 P3，2026-10-09
 * 手机稿 v10 定稿，`docs/references/pages/app-shell.md` §6）。
 *
 * - **页面上**：浮起的胶囊底栏 `素材 · 画廊 · 角色 · 我的` + 右边一颗黑圆 ＋（手机 iOS 稿，
 *   owner 2026-10-16 选 B）。＋ 点开是新建面板（顶上一句话出图 + 3×2 六个工具，上次用的
 *   那个标「上次」），长按 ＋ 直接进上次的工具。
 * - **工作台里**（`/studio/**`）：底栏收起，顶上一条 `← · 图片 ▾ · （助手）`。
 *   ← 回到进来之前那一页；中间就地换工具；右端那一格留给助手头像（它自己 fixed 上来）。
 *
 * ⚠ 768–1023 是平板，走桌面侧栏（owner 2026-10-09 平板 = 缩小版电脑），不走这个壳。
 * ⛔ 条目只来自 `src/constants/navigation.ts`，这里不抄第二份。
 * ⛔ 账号菜单不挂在底栏：它在「我的」页封面右上的 ⚙（v10「我的」稿）。
 */

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
  onPress: () => void
}) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const reduceMotion = useReducedMotion()
  const Icon = item.icon
  // 底栏格子窄：「我的主页」在这里叫「我的」（v10 稿）。
  const label =
    item.id === 'profile' ? tMobile('tabs.profile') : t(item.labelKey)
  return (
    <Link
      href={item.href}
      onClick={onPress}
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
      <span className="relative max-w-full truncate">{label}</span>
    </Link>
  )
}

/** ＋ 面板：从 ＋ 长出来（缩放 + 由糊变清，原点在按钮那一侧）。 */
function CreatePanel({
  pathname,
  onClose,
}: {
  pathname: string
  onClose: () => void
}) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const lastToolId = useLastStudioToolId()
  const [prompt, setPrompt] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = prompt.trim()
    if (!text) return
    onClose()
    router.push(studioImageGeneratePath(text))
  }

  return (
    <>
      {/* 点面板外面任何地方都收起（不吞掉底栏：它在面板下面一层之上）。 */}
      <div
        aria-hidden
        className="fixed inset-0 z-30 lg:hidden"
        onPointerDown={onClose}
      />
      <motion.div
        role="dialog"
        aria-label={tMobile('create')}
        initial={
          reduceMotion
            ? { opacity: 0 }
            : {
                opacity: 0,
                scale: CHIP_POPOVER.fromScale,
                filter: `blur(${CHIP_POPOVER.blurPx}px)`,
              }
        }
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={
          reduceMotion
            ? { opacity: 0 }
            : {
                opacity: 0,
                scale: CHIP_POPOVER.fromScale,
                filter: `blur(${CHIP_POPOVER.blurPx}px)`,
              }
        }
        transition={springTransition('slot', reduceMotion)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        className="fixed inset-x-3 bottom-mobile-tabbar z-40 mb-2 origin-bottom-right rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-overlay lg:hidden"
      >
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-xl bg-muted px-3 py-1.5"
        >
          {/* 16px 字号：iOS 低于它聚焦会整页放大。 */}
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={tMobile('quickPlaceholder')}
            aria-label={tMobile('quickPlaceholder')}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label={tMobile('quickGo')}
            disabled={!prompt.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity duration-fast ease-standard disabled:opacity-30"
          >
            <ArrowUp className="size-4" />
          </button>
        </form>

        <ul className="mt-2 grid grid-cols-3 gap-1">
          {SHELL_NAV_TOOLS.map((item) => {
            const Icon = item.icon
            const isActive = isShellNavItemActive(item, pathname)
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative flex h-19 flex-col items-center justify-center gap-1.5 rounded-xl text-xs text-foreground transition-colors duration-fast ease-standard active:bg-muted aria-[current=page]:bg-muted"
                >
                  <Icon className="size-6 shrink-0" />
                  <span className="max-w-full truncate px-1">
                    {t(item.labelKey)}
                  </span>
                  {item.id === lastToolId ? (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-muted px-1.5 text-3xs font-medium text-muted-foreground">
                      {tMobile('last')}
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </motion.div>
    </>
  )
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
  // 刚点的那一格（记下点时在哪一页）：灰块先滑过去，地址一换就交回给路由判定。
  const [pressedTabAt, setPressedTab] = useState<{
    id: string
    at: string
  } | null>(null)
  const pressedTab = pressedTabAt?.at === pathname ? pressedTabAt : null

  useToastLift(barRef)

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
      <AnimatePresence>
        {open ? (
          <CreatePanel pathname={pathname} onClose={() => setOpen(false)} />
        ) : null}
      </AnimatePresence>

      <nav
        ref={barRef}
        aria-label={tMobile('tabs.label')}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 px-4 pb-safe-inset-bottom lg:hidden"
      >
        {/* iOS 26 式浮起的胶囊：四个去处；＋ 是旁边单独一颗黑圆键（iOS 稿 B）。 */}
        <div className="pointer-events-auto relative mb-2 h-15 min-w-0 flex-1 rounded-full border border-border p-1 shadow-overlay surface-glass">
          <div
            inert={lent}
            className={cn(
              'grid h-full grid-cols-4 items-stretch transition-[opacity,filter] duration-fast ease-standard motion-reduce:transition-none',
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
                onPress={() => setPressedTab({ id: item.id, at: pathname })}
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
          className="pointer-events-auto mb-2 flex size-15 shrink-0 select-none items-center justify-center rounded-full bg-foreground text-background shadow-overlay transition-transform duration-fast ease-standard active:scale-95"
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
      </nav>
    </>
  )
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
  const current = activeShellTool(pathname) ?? SHELL_NAV_TOOLS[0]
  const CurrentIcon = current.icon

  return (
    <header className="fixed inset-x-0 top-0 z-40 box-content flex h-11 items-center bg-background px-1 pt-safe-inset-top lg:hidden">
      <Link
        href={returnPath ?? ROUTES.ASSETS}
        aria-label={tMobile('back')}
        className="flex size-9 shrink-0 items-center coarse:size-11 justify-center rounded-full text-foreground transition-colors duration-fast ease-standard active:bg-muted"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <div className="flex min-w-0 flex-1 justify-center">
        <ResponsiveMenu>
          <ResponsiveMenuTrigger asChild>
            <button
              type="button"
              aria-label={tMobile('switchTool')}
              className="flex h-8 min-w-0 items-center coarse:h-11 gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground transition-colors duration-fast ease-standard active:bg-muted data-[state=open]:bg-muted"
            >
              <CurrentIcon className="size-4 shrink-0" />
              <span className="truncate">{t(current.labelKey)}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </ResponsiveMenuTrigger>
          <ResponsiveMenuContent
            label={tMobile('switchTool')}
            align="center"
            sideOffset={6}
            collisionPadding={8}
            motionPreset="grow"
            className="w-48 rounded-xl p-1.5 shadow-overlay"
          >
            {SHELL_NAV_TOOLS.map((item) => {
              const Icon = item.icon
              const isActive = item.id === current.id
              return (
                <ResponsiveMenuItem
                  key={item.id}
                  asChild
                  className={cn(
                    'h-10 gap-3 rounded-lg',
                    isActive && 'bg-muted',
                  )}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="size-4" />
                    {t(item.labelKey)}
                  </Link>
                </ResponsiveMenuItem>
              )
            })}
          </ResponsiveMenuContent>
        </ResponsiveMenu>
      </div>

      {/* 右端留给**助手头像**：它是工作台上那颗持久 fixed 的开关，落在这一格上。 */}
      <span className="size-9 shrink-0 coarse:size-11" aria-hidden />
    </header>
  )
}

export function MobileShell() {
  const pathname = usePathname()
  useRecordMobileNav(pathname)

  return isStudioPath(pathname) ? (
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
  return (
    <SidebarInset
      id="main-content"
      className={
        isStudioPath(pathname) ? 'mobile-inset-topbar' : 'mobile-inset-tabbar'
      }
    >
      {children}
    </SidebarInset>
  )
}
