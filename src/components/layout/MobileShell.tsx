'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useAnimate, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  SHELL_NAV_TOOLS,
  activeShellTool,
  isStudioBenchPath,
} from '@/constants/navigation'
import { motionTransition, springTransition } from '@/constants/motion'
import { ROUTES } from '@/constants/routes'
import { ChevronDown } from '@/components/icons'
import { SidebarInset } from '@/components/ui/sidebar'
import { MobileChatDrawer } from '@/components/business/studio/shell/MobileChatDrawer'
import { MobileDrawerTrigger } from '@/components/layout/MobileDrawerTrigger'
import { MobileToolSheet } from '@/components/layout/MobileToolSheet'
import { usePathname } from '@/i18n/navigation'
import { useRecordMobileNav } from '@/hooks/use-mobile-nav-memory'
import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile'
import { isStudioShellPath } from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/**
 * 手机（<768）的导航壳：
 * - **全站统一双栏左侧滑抽屉**（`MobileChatDrawer`）：左窄轨放对话 / 7 个创作台 / 素材 / 画廊 / 角色，
 *   右通顶栏放全高对话历史与底栏「我的」；全站所有页（含 7 个创作台）均挂载，左上 `[◧]` 或左缘右滑呼出。
 * - **工作台里**（`/studio/**` 除对话页）：顶上一条 `[◧]  ·  [当前台 ▾]  ·  （助手头像）`。
 */

/** `/settings` 与它的分区页（自己画白板，主卡不再浮起）。 */
function isSettingsPath(pathname: string): boolean {
  return (
    pathname === ROUTES.SETTINGS || pathname.startsWith(`${ROUTES.SETTINGS}/`)
  )
}

/**
 * 工作台里那条顶栏：`[◧]  ·  [当前台 ▾]  ·  （助手）`。
 * 44px 一条 + 顶部安全区（`box-content` 让 `pt-safe-inset-top` 往外长，不吃掉 44），
 * 主区的 `mobile-inset-topbar` 同步让出同样的高度。
 */
function MobileStudioBar({ pathname }: { pathname: string }) {
  const t = useTranslations()
  const tMobile = useTranslations('MobileNav')
  const reduceMotion = useReducedMotion()
  const current = activeShellTool(pathname) ?? SHELL_NAV_TOOLS[0]
  const CurrentIcon = current.icon
  // 记下在哪个台打开的：换了台（卡里的链接）自然就收起。
  const [switchingAt, setSwitchingAt] = useState<string | null>(null)
  const switching = switchingAt === pathname
  const setSwitching = (next: boolean) => setSwitchingAt(next ? pathname : null)

  return (
    <header className="fixed inset-x-0 top-0 z-40 box-content flex h-12 items-center border-b border-border/50 bg-bubble/90 px-3 pt-safe-inset-top backdrop-blur-md dark:bg-background/90 lg:hidden">
      <MobileDrawerTrigger />

      {/* 进台时台名从右边滑进来（「推进来」的那一下），换台时也一样：key 跟着台走。 */}
      <motion.div
        key={current.id}
        initial={reduceMotion ? false : { x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={springTransition('slot', reduceMotion)}
        className="flex min-w-0 flex-1 justify-center"
      >
        <button
          type="button"
          aria-label={tMobile('switchTool')}
          aria-haspopup="dialog"
          aria-expanded={switching}
          onClick={() => setSwitching(true)}
          className="touch-target-y flex h-8 min-w-0 items-center gap-1.5 rounded-full bg-card/90 px-3 text-2sm font-semibold text-foreground shadow-soft transition-colors duration-fast ease-standard active:bg-muted aria-expanded:bg-muted dark:bg-muted"
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
      <span className="size-9 shrink-0" aria-hidden />
    </header>
  )
}

export function MobileShell() {
  const pathname = usePathname()
  useRecordMobileNav(pathname)

  return (
    <>
      {isStudioBenchPath(pathname) ? (
        <MobileStudioBar pathname={pathname} />
      ) : null}
      <MobileChatDrawer />
    </>
  )
}

/**
 * 主区（`SidebarInset`）给手机外壳让位：工作台让出顶栏，其余所有页面全屏贴底（统一侧边栏后无悬浮底栏）；
 * 桌面（≥768）全部归零。`h-page` 读这里写下的 `--mobile-chrome-height`（globals.css）。
 */
export function MobileShellInset({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bench = isStudioBenchPath(pathname)
  const reduceMotion = useReducedMotion()
  const [scope, animate] = useAnimate<HTMLElement>()
  // 页 ⇄ 台：主区淡一下换过去（顶栏滑进来）。只动透明度 ——
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
        bench ? 'mobile-inset-topbar' : 'mobile-inset-chat',
        // ≥768 侧栏让给外壳的左栏（第 9f 步）：主卡不再浮起。设置页自己画同一副白板（ui-spec §1）。
        (isStudioShellPath(pathname) || isSettingsPath(pathname)) &&
          'lg:rounded-none lg:border-l-0 lg:shadow-none',
      )}
    >
      {children}
    </SidebarInset>
  )
}
