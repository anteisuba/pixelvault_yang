'use client'

import { useCallback, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'
import { ChevronDown, UserCircle } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { CANVAS_SHELL_SIDEBAR_ENTRY_ATTR } from '@/constants/canvas-shell'
import { CHIP_POPOVER, SPRING, motionTransition } from '@/constants/motion'
import {
  SHELL_NAV_CANVAS_ENTRIES,
  SHELL_NAV_CANVAS_ITEM_ID,
  SHELL_NAV_SECTIONS,
  isShellNavItemActive,
  type ShellNavItem,
} from '@/constants/navigation'
import { ROUTES } from '@/constants/routes'
import { Link, usePathname } from '@/i18n/navigation'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSlider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  toggleCanvasShellPanel,
  useCanvasShellPanel,
} from '@/hooks/node/use-canvas-shell-panel'
import { useHasHydrated } from '@/hooks/use-has-hydrated'
import { useNavIndicator } from '@/hooks/use-nav-indicator'
import { useMyProfile } from '@/hooks/use-my-profile'
import { cn } from '@/lib/utils'

/**
 * 收起时原地糊掉的那几样字（owner 2026-10-08 侧栏原型 v1：标签、段标题、账号名）。
 * 淡出 + `blur-xs` 走脊柱 `duration-base`，与轨宽那条弹簧同时起步、⛔ 不排队。
 * ⚠ 收起后一律不接鼠标（app-shell.md §5.1「看不见的东西不许接住鼠标」）。
 */
const COLLAPSE_BLUR_CLASS =
  'transition-[opacity,filter] duration-base ease-standard group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:blur-xs'

/** 内沟展开 / 收起同一档 4px（`--sidebar-rail-gutter`）——收展时图标不横跳。 */
const SIDEBAR_FOOTER_CLASS = 'gap-1 p-1'

/**
 * AppSidebar — 全局导航轨。施工基准：`docs/references/pages/app-shell.md`。
 *
 * 形态「分段浮岛」（2026-08-18 owner 拍板）：壳底浅灰，轨坐在灰底上，主区是
 * 一张左缘浮起的白卡。轨宽 144 展开 / 40 收起。
 *
 * 收展（owner 2026-10-08 侧栏原型 v1）：轨宽走弹簧推挤主卡；字原地糊掉，
 * 图标横向不动（行高、内沟、内距两档同值）；段标题那一行收成细线，图标跟着
 * 同一条弹簧微微上滑（owner 2026-10-09）；收起后悬停一项出黑色名字提示。
 *
 * 结构：品牌 + 折叠钮 · 去处段 · 工具段 · 最底一行「账号」。
 * 条目清单**只在** `src/constants/navigation.ts`，任何断点都从那里取。
 *
 * ⚠ 三条别退回去的东西（都是改版前真机量出来的问题）：
 * 1. 菜单项的 `transition-property` **必须含 color** —— 改版前只有
 *    `width,height,padding`，所以切工具时颜色是瞬时跳变的。
 * 2. 激活与 hover **反极性**：hover 往暗、active 往亮。同向时只有 1.1:1。
 * 3. 激活态靠**墨竖条 + 字重墨色跃迁**承重，白浮片只是材质（对壳底 1.24:1）。
 */
export function AppSidebar() {
  const { isMobile } = useSidebar()

  // <768 **完全没有侧栏**（方向 M2「顶栏当切换器」）——由 MobileShell 接管。
  // 768–1023 是平板：同一条侧栏，钉死在收起档（owner 2026-10-09 平板 v10）。
  // 不挡的话，原语的移动分支会挂一个永远打不开的 Sheet 在 DOM 里。
  // 首帧 useIsMobile 返回 false，与 SSR 一致，不会水合不匹配。
  if (isMobile) return null

  return (
    <Sidebar collapsible="icon" className="z-40 text-sidebar-foreground">
      <AppSidebarHeader />
      <AppSidebarContent />
      <AppSidebarFooter />
    </Sidebar>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Header — brand + collapse toggle
// ──────────────────────────────────────────────────────────────────────

function AppSidebarHeader() {
  const t = useTranslations('Navbar')
  const { state, isMobile } = useSidebar()
  const isCollapsed = !isMobile && state === 'collapsed'

  // Brand link is rendered unconditionally (no SignedIn / SignedOut wrapper)
  // — Clerk's auth status is unknown at SSR time, so wrapping it caused a
  // hydration mismatch where the server saw only <SidebarTrigger> while the
  // client (after Clerk hydrated) inserted an <a> before it. Pointing the
  // brand at /studio works for both states: signed-in users land in their
  // workspace; signed-out users hit the protected-route redirect to sign-in.
  return (
    <SidebarHeader className="p-1">
      {/* 收起时品牌名原地糊掉、折叠钮跟着轨的右沿一起收到 40 档正中 ——
          ⛔ 不 `hidden` 掉品牌名：那会让折叠钮在第一帧就跳到正中。 */}
      <div className="flex min-h-9 items-center justify-between">
        <Link
          href={ROUTES.STUDIO}
          aria-hidden={isCollapsed || undefined}
          tabIndex={isCollapsed ? -1 : undefined}
          className={cn(
            'flex min-w-0 shrink items-center overflow-hidden rounded-md px-2 py-1 whitespace-nowrap text-sidebar-accent-foreground transition-[color,background-color,opacity,filter] duration-base ease-standard hover:bg-sidebar-accent',
            'group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:blur-xs',
          )}
        >
          {/* 静态字。改版前这里挂着 HyperText 的逐字乱码 hover 动画 ——
              一个每天要看几百次的导航元素上放炫技动画，与
              `interaction.md §5`「动效只服务状态 / 连续性 / 反馈」冲突。 */}
          <span className="text-base font-bold leading-none tracking-brand">
            {t('brand')}
          </span>
        </Link>
        {/* 头像不在这里了（D11 ④）—— 它下沉到最底与「设置」合成账号入口。
            顶端只剩品牌与折叠钮。 */}
        {/* 平板（768–1023）侧栏不展开（`SidebarProvider` 钉死收起档），折叠钮跟着藏起来。 */}
        <SidebarTrigger className="size-11 shrink-0 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground max-desk:hidden md:size-8" />
      </div>
    </SidebarHeader>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Content — main nav links
// ──────────────────────────────────────────────────────────────────────

function AppSidebarContent() {
  const pathname = usePathname()
  const t = useTranslations()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const navScopeRef = useRef<HTMLDivElement>(null)
  const { mounted: canvasMounted } = useCanvasShellPanel()

  const indicator = useNavIndicator(navScopeRef, pathname, state)

  const closeMobileSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  // 导航不依赖登录态：登入与未登入渲染完全一致。受保护的路由（提示词 / 素材 /
  // 工作台 / 卡片）由 Clerk 中间件在点击时拦截，所以这里可以 SSR 优先，不必等
  // Clerk 水合 —— 之前那个 `useUser().isLoaded` 闸门对 `Clerk.loaded === false`
  // 的访客永远不会翻 true，会把整条侧栏留空。激活态来自 pathname，服务端与
  // 客户端都算得出，不存在水合不一致。
  const renderItem = (item: ShellNavItem) => {
    const Icon = item.icon
    const label = t(item.labelKey)
    const active = isShellNavItemActive(item, pathname)
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton asChild isActive={active} tooltip={label}>
          <Link
            href={item.href}
            aria-label={label}
            onClick={closeMobileSidebar}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
        {item.id === SHELL_NAV_CANVAS_ITEM_ID ? (
          <AppSidebarCanvasEntries visible={active && canvasMounted} />
        ) : null}
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarContent
      ref={navScopeRef}
      onPointerOver={indicator.onPointerOver}
      onPointerLeave={indicator.onPointerLeave}
      className="relative gap-1 py-1 md:gap-1"
    >
      {/* 整栏唯一的两个运动主体（app-shell.md §5.1）。DOM 上排在菜单之前，
          所以画在项的下面；两块都只动 transform。 */}
      <SidebarMenuSlider
        rect={indicator.hover}
        tone="hover"
        visible={indicator.hoverVisible}
        jumped={indicator.hoverJumped}
      />
      <SidebarMenuSlider
        rect={indicator.active}
        tone="active"
        visible={indicator.active !== null}
        tracking={indicator.activeTracking}
      />

      {SHELL_NAV_SECTIONS.map((section) => (
        <SidebarGroup key={section.id} className="p-1">
          {/* 段标题「去处 / 工具」：收起时字原地糊掉，这一行 28 → 12 收成一根细线
              （owner 2026-10-09 侧栏留白选 A）。高度与轨宽走**同一条**弹簧、同时起步，
              下面的图标跟着微微上滑；细线只淡入，⛔ 不走弹簧。 */}
          <div className="relative h-7 overflow-hidden transition-[height] duration-spring-expand ease-spring-expand group-data-[collapsible=icon]:h-3">
            <SidebarGroupLabel className="h-7 px-2 text-sidebar-subtle">
              {t(section.labelKey)}
            </SidebarGroupLabel>
            <div
              aria-hidden
              data-slot="sidebar-group-divider"
              className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-sidebar-border opacity-0 transition-opacity duration-base ease-standard group-data-[collapsible=icon]:opacity-100"
            />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => renderItem(item))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}

// ──────────────────────────────────────────────────────────────────────
// 画布子项 —— 画布自己的左侧图标栏并进来（owner 2026-10-08 画布换皮 + 侧栏原型 v1）
// ──────────────────────────────────────────────────────────────────────

/**
 * 「画布」下面长出来的六个子项（添加节点 / 节点 / 当前项目 / 历史对话 / 角色 / 素材库 ——
 * 哪几个在这里只看 `SHELL_NAV_CANVAS_ENTRIES`）。点一个 = 画布在侧栏旁边打开那一格
 * 面板（`ShellSidePanels` 从这一个所在的那一行长出来），再点收起。
 *
 * 长相（owner 2026-10-08 侧栏第 3 题选 A「缩进成几行」）：
 * - 展开 144：缩进的几行，每行带名字，**一整块浅灰**包住；开着的那一个是白底。
 * - 收起 40：同一块浅灰包住一列图标（名字随轨一起糊掉，悬停出黑色名字提示）。
 * - 进画布时从「画布」那一行底下**长出来**（高度 0 → auto 走 `SPRING.expand`，
 *   内容由糊变清）；离开画布反着收回去。几件事同时起步，⛔ 不逐个错开。
 *
 * ⚠ 只在画布路由上、画布真的挂着时出现（`useCanvasShellPanel().mounted`）。
 *   状态与画布共用一份模块级 store，⛔ 侧栏不另存一份「开着哪格」。
 * ⚠ 开着的那一个 = 白底 + 墨字 + `aria-pressed`；⛔ 不借路由的激活白浮片与竖条
 *   （那一块只属于当前路由）。
 */
function AppSidebarCanvasEntries({ visible }: { readonly visible: boolean }) {
  const t = useTranslations()
  const { activePanel } = useCanvasShellPanel()
  const reduceMotion = useReducedMotion() ?? false

  const shown = reduceMotion
    ? { opacity: 1 }
    : {
        height: 'auto',
        opacity: 1,
        filter: 'blur(0px)',
        // 长完之后放开裁剪：白底那一格的投影不该被裁掉。
        transitionEnd: { filter: 'none', overflow: 'visible' },
      }
  const hidden = reduceMotion
    ? { opacity: 0 }
    : {
        height: 0,
        opacity: 0,
        filter: `blur(${CHIP_POPOVER.blurPx}px)`,
        overflow: 'hidden',
      }

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="canvas-entries"
          data-testid="sidebar-canvas-entries"
          initial={hidden}
          animate={shown}
          exit={hidden}
          transition={
            reduceMotion
              ? motionTransition('fast', true)
              : {
                  ...SPRING.expand,
                  // 透明度与模糊不走弹簧：过冲会把它们推出终点。
                  opacity: motionTransition('base'),
                  filter: motionTransition('base'),
                }
          }
        >
          <ul
            role="group"
            aria-label={t('StudioTools.tools.node.label')}
            className="mt-0.5 ml-3 flex flex-col gap-0.5 rounded-md bg-sidebar-accent p-0.5 transition-[margin] duration-spring-expand ease-spring-expand group-data-[collapsible=icon]:ml-0"
          >
            {SHELL_NAV_CANVAS_ENTRIES.map((entry) => {
              const Icon = entry.icon
              const label = t(entry.labelKey)
              const pressed = activePanel === entry.id
              return (
                <li key={entry.id}>
                  <SidebarMenuButton
                    type="button"
                    size="sm"
                    tooltip={label}
                    aria-label={label}
                    aria-pressed={pressed}
                    {...{ [CANVAS_SHELL_SIDEBAR_ENTRY_ATTR]: entry.id }}
                    onClick={() => toggleCanvasShellPanel(entry.id)}
                    className={cn(
                      // 收起 40：浅灰块 32 宽、内边 2px，图标在 28 宽的格里居中。
                      'h-8 group-data-[collapsible=icon]:px-1.5',
                      pressed &&
                        'bg-sidebar-active-surface font-medium text-sidebar-accent-foreground shadow-sidebar-chip',
                    )}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </li>
              )
            })}
          </ul>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Footer — 账号入口
// ──────────────────────────────────────────────────────────────────────

/**
 * 最底那一行就是账号入口（D11 ④，2026-09-20 owner 确认画板）：
 * 头像 + 名字 + ▾，整行一颗触发器，点开账号菜单从这一行**往上长出来**
 * （语言分段条 / 设置 / 退出登录，owner 2026-10-08 侧栏原型 v1）。收起 40 名字
 * 与 ▾ 原地糊掉、头像不动，仍是一颗**真 button**，tooltip「账号」，菜单改成
 * **往右长** —— 那一档它是**唯一**的账号入口，键盘必须到得了。
 *
 * ⚠ 底色三档走侧栏的**反极性**（app-shell.md §5.1，别破例）：
 * hover 往暗 `--sidebar-accent` → pressed / 菜单打开更暗
 * `--sidebar-accent-strong`。⛔ 不动字重、⛔ 行不能抖（只过渡颜色）。
 *
 * ⛔ 这一行不读任何账户数字：额度在 `/settings/usage`，失效 key 在
 * `/settings/keys`，⛔ 不挂红点 / 角标。
 */
function AppSidebarFooter() {
  const t = useTranslations('Navbar')
  const { isLoaded } = useUser()
  const hasHydrated = useHasHydrated()
  const { state, isMobile } = useSidebar()
  const { profile } = useMyProfile()
  const isCollapsed = !isMobile && state === 'collapsed'
  const name = profile?.displayName ?? profile?.username

  return (
    <SidebarFooter className={SIDEBAR_FOOTER_CLASS}>
      {hasHydrated && isLoaded ? (
        <>
          <SignedIn>
            <div className="border-t border-sidebar-border pt-1">
              <AccountMenu
                side={isCollapsed ? 'right' : 'top'}
                align={isCollapsed ? 'end' : 'start'}
                tooltip={isCollapsed ? t('account') : undefined}
              >
                <button
                  type="button"
                  aria-label={t('account')}
                  /* 引导第 4 步的锚点。「设置」那一行收进菜单后落到这里 ——
                     ⛔ 别把它挂进菜单内容里：那一层只在打开后才挂载，
                     `OnboardingTooltip` 查不到目标就只能把气泡居中。 */
                  data-onboarding="apiKey"
                  className="flex h-9 w-full items-center gap-2 overflow-hidden rounded-md px-1 text-left text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring transition-colors duration-fast ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent-strong data-[state=open]:bg-sidebar-accent-strong data-[state=open]:text-sidebar-accent-foreground motion-reduce:transition-none"
                >
                  {/* 头像在 40 档正中（4 沟 + 4 内距 + 24 + 4 + 4），展开时也站在
                      同一处 —— 收展全程不动。 */}
                  <ProfileAvatar
                    avatarUrl={profile?.avatarUrl}
                    size={24}
                    className="size-6 shrink-0"
                    iconClassName="size-3.5"
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate group-data-[collapsible=icon]:shrink-0 group-data-[collapsible=icon]:text-clip',
                      COLLAPSE_BLUR_CLASS,
                    )}
                  >
                    {name ?? t('account')}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 shrink-0 text-sidebar-subtle',
                      COLLAPSE_BLUR_CLASS,
                    )}
                  />
                </button>
              </AccountMenu>
            </div>
          </SignedIn>

          <SignedOut>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="w-full rounded-full border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:px-0"
            >
              <Link href={ROUTES.SIGN_IN}>
                <span className="group-data-[collapsible=icon]:hidden">
                  {t('signIn')}
                </span>
                <UserCircle className="hidden size-4 group-data-[collapsible=icon]:inline-block" />
              </Link>
            </Button>
          </SignedOut>
        </>
      ) : (
        <SidebarFooterLoadingState />
      )}
    </SidebarFooter>
  )
}

function SidebarFooterLoadingState() {
  return (
    <div className="flex h-9 items-center gap-2 overflow-hidden border-t border-sidebar-border px-1 pt-1">
      <div className="size-6 shrink-0 rounded-full bg-sidebar-accent" />
      <div
        className={cn(
          'h-3 w-12 shrink-0 rounded-sm bg-sidebar-accent',
          COLLAPSE_BLUR_CLASS,
        )}
      />
    </div>
  )
}
