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
  MOBILE_TABS_LEFT,
  MOBILE_TABS_RIGHT,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarInset } from '@/components/ui/sidebar'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import {
  useLastStudioToolId,
  useMobileReturnPath,
  useRecordMobileNav,
} from '@/hooks/use-mobile-nav-memory'
import { useToastLift } from '@/hooks/use-toast-lift'
import { cn } from '@/lib/utils'

/**
 * 手机（<768）的导航壳 —— 方向 P3「底栏」（owner 2026-10-07 选 P3，2026-10-09
 * 手机稿 v10 定稿，`docs/references/pages/app-shell.md` §6）。
 *
 * - **页面上**：底栏 `素材 · 画廊 · ＋ · 角色 · 我的`。＋ 点开是新建面板（顶上一句话
 *   出图 + 六个工具，上次用的那个标「上次」），长按 ＋ 直接进上次的工具。
 * - **工作台里**（`/studio/**`）：底栏收起，顶上一条 `← · 图片 ▾ · （助手）`。
 *   ← 回到进来之前那一页；中间就地换工具；右端那一格留给助手头像（它自己 fixed 上来）。
 *
 * ⚠ 768–1023 是平板，走桌面侧栏（owner 2026-10-09 平板 = 缩小版电脑），不走这个壳。
 * ⛔ 条目只来自 `src/constants/navigation.ts`，这里不抄第二份。
 * ⛔ 账号菜单不挂在底栏：它在「我的」页封面右上的 ⚙（v10「我的」稿）。
 */

const TAB_CLASS =
  'flex min-w-0 flex-col items-center justify-center gap-0.5 text-2xs font-medium text-muted-foreground transition-colors duration-fast ease-standard [&>svg]:size-6'

function MobileTab({
  item,
  pathname,
}: {
  item: ShellNavItem
  pathname: string
}) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const Icon = item.icon
  const isActive = isShellNavItemActive(item, pathname)
  // 底栏格子窄：「我的主页」在这里叫「我的」（v10 稿）。
  const label =
    item.id === 'profile' ? tMobile('tabs.profile') : t(item.labelKey)
  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(TAB_CLASS, isActive && 'font-semibold text-foreground')}
    >
      <Icon />
      <span className="max-w-full truncate">{label}</span>
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
        className="fixed inset-x-3 bottom-mobile-tabbar z-40 mb-2 origin-bottom rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-overlay lg:hidden"
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

        <ul className="mt-1.5 flex flex-col">
          {SHELL_NAV_TOOLS.map((item) => {
            const Icon = item.icon
            const isActive = isShellNavItemActive(item, pathname)
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm text-foreground transition-colors duration-fast ease-standard active:bg-muted"
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {t(item.labelKey)}
                  </span>
                  {item.id === lastToolId ? (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border pb-safe-inset-bottom pt-1.5 surface-glass lg:hidden"
      >
        <div className="grid h-13 grid-cols-5 items-stretch">
          {MOBILE_TABS_LEFT.map((item) => (
            <MobileTab key={item.id} item={item} pathname={pathname} />
          ))}
          <div className="flex items-start justify-center">
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
              className="flex size-13 -translate-y-2.5 select-none items-center justify-center rounded-2xl bg-foreground text-background shadow-overlay transition-transform duration-fast ease-standard active:scale-95"
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
          </div>
          {MOBILE_TABS_RIGHT.map((item) => (
            <MobileTab key={item.id} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
    </>
  )
}

/** 工作台里那条顶栏：`← · 图片 ▾ · （助手）`。 */
function MobileStudioBar({ pathname }: { pathname: string }) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const returnPath = useMobileReturnPath()
  const current = activeShellTool(pathname) ?? SHELL_NAV_TOOLS[0]
  const CurrentIcon = current.icon

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-11 items-center bg-background px-1 lg:hidden">
      <Link
        href={returnPath ?? ROUTES.ASSETS}
        aria-label={tMobile('back')}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-fast ease-standard active:bg-muted"
      >
        <ArrowLeft className="size-5" />
      </Link>

      <div className="flex min-w-0 flex-1 justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={tMobile('switchTool')}
              className="flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground transition-colors duration-fast ease-standard active:bg-muted data-[state=open]:bg-muted"
            >
              <CurrentIcon className="size-4 shrink-0" />
              <span className="truncate">{t(current.labelKey)}</span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
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
                <DropdownMenuItem
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
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 右端留给**助手头像**：它是工作台上那颗持久 fixed 的开关，落在这一格上。 */}
      <span className="size-9 shrink-0" aria-hidden />
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
