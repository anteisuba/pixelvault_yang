'use client'

import {
  useContext,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'

import {
  STUDIO_LIBRARY_ITEMS,
  activeShellTool,
  type ShellNavItem,
} from '@/constants/navigation'
import { ROUTES } from '@/constants/routes'
import {
  STUDIO_LIBRARY_TAB_IDS,
  STUDIO_RAIL_MINE_IDS,
  studioLibraryPath,
  type StudioLibraryCategoryId,
} from '@/constants/studio-shell'
import {
  ChatCircleText,
  Library,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
} from '@/components/icons'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import {
  STUDIO_SHELL_BENCH_ITEMS,
  StudioBenchNavContext,
  activeBenchId,
} from '@/components/business/studio/shell/StudioShellBench'
import { useShellWorkHistory } from '@/components/business/studio/shell/StudioShellHistoryKeys'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SidebarMenuSlider } from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIntentPrefetch } from '@/hooks/use-intent-prefetch'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useNavIndicator } from '@/hooks/use-nav-indicator'
import { useStudioConversationActivity } from '@/hooks/use-studio-conversation-activity'
import { useStudioConversationBenchOverrides } from '@/hooks/use-studio-conversation-bench'
import { useStudioOperatorSelector } from '@/hooks/use-studio-operator-store'
import { useStudioRailExpanded } from '@/hooks/use-studio-rail-expanded'
import { Link, usePathname } from '@/i18n/navigation'
import {
  isStudioShellPath,
  libraryCategoryFromPath,
  studioBenchHref,
  studioConversationHref,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/**
 * 左栏一格（10-21 那版窄图标栏的 CSS 与动效，owner 11-04 加带字一档）：灰底上一列图标，
 * ⛔ 每格自己亮 —— 当前那一格靠滑过来的白浮片 + 左边墨竖条（`SidebarMenuSlider`），
 * 悬停是一块往暗走的幽灵块跟着滑（反极性，app-shell.md §5.1）。格子只换字色。
 * `data-slot` / `data-active` 是 `useNavIndicator` 认格子的记号。
 * 图标在两档里横坐标不变（收着 40 宽、带字铺满，左内边距同一个）：开合时只有字在长出来。
 */
const RAIL_ITEM_CLASS =
  'relative z-1 flex h-10 shrink-0 items-center gap-3 overflow-hidden rounded-md px-2.75 text-sidebar-foreground outline-hidden ring-sidebar-ring transition-[color,width] duration-base ease-standard hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent-strong data-[active=true]:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground [&>svg]:size-4.5 [&>svg]:shrink-0 [&>svg]:transition-transform [&>svg]:duration-fast [&>svg]:ease-standard hover:[&>svg]:scale-105 motion-reduce:transition-none'

const RAIL_LABEL_CLASS = 'min-w-0 truncate text-2sm whitespace-nowrap'

/** 收着 40 一格；带字那一档铺满一行。 */
const railWidth = (expanded: boolean) => (expanded ? 'w-full' : 'w-10')

const pageItems = (ids: readonly StudioLibraryCategoryId[]) =>
  ids.flatMap((id) => STUDIO_LIBRARY_ITEMS.filter((item) => item.id === id))
const MINE_ITEMS = pageItems(STUDIO_RAIL_MINE_IDS)
const LIBRARY_ITEMS = pageItems(STUDIO_LIBRARY_TAB_IDS)

/**
 * `/studio` 外壳左边那一栏（owner 11-04 定稿）：只管「去哪儿」，每一样一点就开。
 *
 * 从上到下：展开键 · 新对话 ｜工作台：图像 · LoRA · 配音 · 视频 · 3D · 画布
 * ｜我的：画廊 · 素材 · 提示词 · 角色 ｜库：LoRA 模型 · 酒馆 · 标签 · 音色 … 最底下账号。
 *
 * - 对话记录 ⛔ 不在这里：白板头最左那颗「记录」（`StudioShellHistoryKey`），首页和台上同一颗。
 * - 正在出图的那个台图标上一颗高亮小点（这段对话有任务在跑；还没开台就点在「新对话」上）。
 * - 放不下（`rail-short`）只把「库」那一组收成一颗，点开浮出那四样；放得下全都一点就开。
 * - 带字那一档浮在内容上（⛔ 把白板往右推），开合记在本机（`useStudioRailExpanded`）。
 */
export function StudioConversationList({ className }: { className?: string }) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const intent = useIntentPrefetch()
  const pathname = usePathname()
  const kind = studioShellRouteKind(pathname)
  const openCategory = libraryCategoryFromPath(pathname)
  const sessionId = useStudioOperatorSelector((state) => state.sessionId)
  const [expanded, setExpanded] = useStudioRailExpanded()
  const [librariesOpen, setLibrariesOpen] = useState(false)
  const librarySlot = useContext(StudioLibraryTargetContext)
  const benchNav = useContext(StudioBenchNavContext)
  const history = useShellWorkHistory()
  const libraryActive =
    openCategory !== null &&
    (STUDIO_LIBRARY_TAB_IDS as readonly string[]).includes(openCategory)
  const inShell = isStudioShellPath(pathname) && openCategory === null
  const activeBench =
    inShell && kind === 'bench' ? activeBenchId(pathname) : undefined
  const runningBench = useRunningBench(sessionId, activeBench)
  const navRef = useRef<HTMLElement>(null)
  const indicator = useNavIndicator(navRef, pathname, expanded)
  /** 库是整页、没有返回键：再点一下亮着的那一颗 = 收起库，回到进来之前那一页。 */
  const closeIfActive = (active: boolean) => (event: MouseEvent) => {
    if (!active || !librarySlot) return
    event.preventDefault()
    librarySlot.close()
  }
  const conversationHref = studioConversationHref(sessionId)

  const pageLink = (item: ShellNavItem, extraClass?: string) => {
    const id = item.id as StudioLibraryCategoryId
    const Icon = item.icon
    const label = tAll(item.labelKey)
    const active = openCategory === id
    const href = studioLibraryPath(id)
    return (
      <NavTip key={item.id} label={label} show={!expanded}>
        <Link
          href={href}
          prefetch={false}
          {...intent(href)}
          replace={openCategory !== null}
          onClick={closeIfActive(active)}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          data-slot="sidebar-menu-button"
          data-active={active}
          data-testid={`studio-shell-page-${item.id}`}
          className={cn(RAIL_ITEM_CLASS, railWidth(expanded), extraClass)}
        >
          <Icon />
          {expanded ? <span className={RAIL_LABEL_CLASS}>{label}</span> : null}
        </Link>
      </NavTip>
    )
  }

  const benchLink = (item: ShellNavItem) => {
    const Icon = item.icon
    const name = tAll(item.labelKey)
    const active = item.id === activeBench
    const running = item.id === runningBench
    const label = running ? t('benchRunning', { bench: name }) : name
    // 当前开着的那一颗再点 = 收台（与库那一组同一个手势）。
    const href = active
      ? conversationHref
      : studioBenchHref(item.href, sessionId)
    return (
      <NavTip
        key={item.id}
        label={active ? t('closeBench') : label}
        show={!expanded}
      >
        <Link
          href={href}
          prefetch={false}
          {...intent(href)}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          data-slot="sidebar-menu-button"
          data-active={active}
          data-bench={item.id}
          data-running={running || undefined}
          data-testid={`studio-shell-bench-${item.id}`}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return
            // 台框在场才借它的「推 / 滑」；库叠着、设置等页就照常跳地址。
            const nav = openCategory === null ? benchNav?.current : null
            if (!nav) return
            if (active) {
              event.preventDefault()
              nav.closeBench()
            } else if (activeBench) {
              event.preventDefault()
              nav.switchBench(item)
            }
          }}
          className={cn(RAIL_ITEM_CLASS, railWidth(expanded))}
        >
          <Icon />
          {running ? <RunningDot /> : null}
          {expanded ? <span className={RAIL_LABEL_CLASS}>{name}</span> : null}
        </Link>
      </NavTip>
    )
  }

  const toggleLabel = expanded ? t('railCollapse') : t('railExpand')

  return (
    <div className={cn('relative h-svh w-14 shrink-0', className)}>
      <nav
        ref={navRef}
        aria-label={t('conversations')}
        data-testid="studio-conversation-list"
        data-expanded={expanded}
        onPointerOver={indicator.onPointerOver}
        onPointerLeave={indicator.onPointerLeave}
        className={cn(
          'scrollbar-none absolute inset-y-0 left-0 z-50 flex flex-col items-start gap-0.5 overflow-x-hidden overflow-y-auto bg-sidebar px-2 py-3 transition-[width,box-shadow] duration-base ease-standard motion-reduce:transition-none',
          expanded ? 'w-56 rounded-r-16 shadow-pop' : 'w-14',
        )}
      >
        {/* 整栏唯一的两个运动主体（app-shell.md §5.1），排在格子前面 = 画在格子下面。 */}
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

        <NavTip label={toggleLabel} show={!expanded}>
          <button
            type="button"
            aria-label={toggleLabel}
            aria-expanded={expanded}
            data-testid="studio-rail-toggle"
            onClick={() => setExpanded(!expanded)}
            className={cn(RAIL_ITEM_CLASS, 'w-10')}
          >
            {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
        </NavTip>

        {/* 「新对话」只有这一颗（owner 11-05：黑圆不要了，和「对话」并成一颗，点了永远开新的）。
            ⛔ 不亮：它是动作不是去处；回到这段对话 = 再点亮着的台 / 库那一颗。 */}
        <NavTip label={t('newChat')} show={!expanded}>
          <button
            type="button"
            aria-label={t('newChat')}
            data-slot="sidebar-menu-button"
            data-testid="studio-rail-new-chat"
            disabled={history.newDisabled}
            onClick={history.onNew}
            className={cn(
              RAIL_ITEM_CLASS,
              railWidth(expanded),
              'disabled:opacity-50',
            )}
          >
            <ChatCircleText />
            {runningBench === null ? <RunningDot /> : null}
            {expanded ? (
              <span className={RAIL_LABEL_CLASS}>{t('newChat')}</span>
            ) : null}
          </button>
        </NavTip>

        <RailGroup label={t('benches')} expanded={expanded} />
        {STUDIO_SHELL_BENCH_ITEMS.map(benchLink)}

        <RailGroup label={t('mine')} expanded={expanded} />
        {MINE_ITEMS.map((item) => pageLink(item))}

        <RailGroup label={t('library')} expanded={expanded} />
        {/* 放得下：一样一颗；放不下（`rail-short`）：收成下面那一颗，点开浮出这四样。 */}
        {LIBRARY_ITEMS.map((item) => pageLink(item, 'rail-short:hidden'))}
        <Popover open={librariesOpen} onOpenChange={setLibrariesOpen}>
          <NavTip label={t('library')} show={!expanded}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t('library')}
                data-slot="sidebar-menu-button"
                data-active={libraryActive}
                data-testid="studio-shell-libraries"
                className={cn(
                  RAIL_ITEM_CLASS,
                  railWidth(expanded),
                  'hidden rail-short:flex',
                )}
              >
                <Library />
                {expanded ? (
                  <span className={RAIL_LABEL_CLASS}>{t('library')}</span>
                ) : null}
              </button>
            </PopoverTrigger>
          </NavTip>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={8}
            data-testid="studio-library-picker"
            className="flex w-48 flex-col gap-0.5 rounded-xl p-1.5"
          >
            {LIBRARY_ITEMS.map((item) => {
              const Icon = item.icon
              const label = tAll(item.labelKey)
              const active = openCategory === item.id
              return (
                <Link
                  key={item.id}
                  href={studioLibraryPath(item.id as StudioLibraryCategoryId)}
                  replace={openCategory !== null}
                  aria-current={active ? 'page' : undefined}
                  data-library={item.id}
                  onClick={() => setLibrariesOpen(false)}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-2sm text-foreground transition-colors duration-fast ease-standard hover:bg-accent focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none [&>svg]:size-4.5 [&>svg]:shrink-0',
                    active && 'bg-accent font-medium',
                  )}
                >
                  <Icon />
                  <span className="truncate">{label}</span>
                </Link>
              )
            })}
          </PopoverContent>
        </Popover>

        <StudioConversationListAccount expanded={expanded} />
      </nav>
    </div>
  )
}

/**
 * 正在出的那个台（这段对话有任务在跑）：开着台就是这一台；只剩对话时按这段对话记住的台认；
 * 两样都没有（在对话里直接出）= `null`，点落在「对话」上。没在跑 = `undefined`。
 */
function useRunningBench(
  sessionId: string | null,
  activeBench: string | undefined,
): string | null | undefined {
  const ids = useMemo(() => (sessionId ? [sessionId] : []), [sessionId])
  const activity = useStudioConversationActivity(ids, sessionId)
  const benches = useStudioConversationBenchOverrides()
  if (!sessionId || !activity.get(sessionId)?.progress) return undefined
  if (activeBench) return activeBench
  const remembered = benches.get(sessionId)
  return (remembered ? activeShellTool(remembered)?.id : undefined) ?? null
}

/** 图标右上角那颗高亮小点（读屏走那一格的名字：「图像 · 正在出」）。 */
function RunningDot() {
  return (
    <span
      aria-hidden
      data-testid="studio-rail-running-dot"
      className="absolute top-2 left-6.5 size-2 rounded-full bg-highlight ring-2 ring-sidebar"
    />
  )
}

/**
 * 组与组之间（收着是一根细线，带字时写组名）。两档同一个高度，开合时下面的格子 ⛔ 上下跳。
 */
function RailGroup({ label, expanded }: { label: string; expanded: boolean }) {
  return expanded ? (
    <span className="flex h-4 w-full shrink-0 items-end px-2.75 text-2xs text-muted-foreground">
      {label}
    </span>
  ) : (
    <span
      aria-hidden
      className="flex h-4 w-10 shrink-0 items-center justify-center"
    >
      <span className="h-px w-6 bg-sidebar-border" />
    </span>
  )
}

/**
 * 最底下账号。收着是一颗头像（点开账号菜单，里面有「我的主页」）；带字那一档是一行
 *「我的主页」+ 一颗 ⋯（设置 · 外观 · 语言 · 退出）。
 */
function StudioConversationListAccount({ expanded }: { expanded: boolean }) {
  const t = useTranslations('Navbar')
  const pathname = usePathname()
  const { profile } = useMyProfile()
  const avatar = (
    <ProfileAvatar
      avatarUrl={profile?.avatarUrl}
      name={profile?.displayName ?? profile?.username}
      size={32}
      className="size-8 shrink-0"
      iconClassName="size-4"
    />
  )

  if (!expanded) {
    return (
      <div className="mt-auto pt-1">
        <AccountMenu side="right" align="end" showProfile>
          <button
            type="button"
            aria-label={t('account')}
            data-testid="studio-rail-account"
            className="grid size-10 place-items-center rounded-full focus-visible:outline-none focus-visible:shadow-focus"
          >
            {avatar}
          </button>
        </AccountMenu>
      </div>
    )
  }

  const profileActive = pathname === ROUTES.MY_PROFILE
  return (
    <div className="mt-auto flex w-full items-center gap-1 pt-1">
      <Link
        href={ROUTES.MY_PROFILE}
        aria-current={profileActive ? 'page' : undefined}
        data-slot="sidebar-menu-button"
        data-active={profileActive}
        data-testid="studio-rail-profile"
        className={cn(RAIL_ITEM_CLASS, 'min-w-0 flex-1 px-1')}
      >
        {avatar}
        <span className={RAIL_LABEL_CLASS}>{t('links.profile')}</span>
      </Link>
      <AccountMenu side="right" align="end">
        <button
          type="button"
          aria-label={t('account')}
          data-testid="studio-rail-account"
          className="grid size-10 shrink-0 place-items-center rounded-md text-sidebar-foreground transition-colors duration-fast ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-sidebar-accent motion-reduce:transition-none [&>svg]:size-4.5"
        >
          <MoreHorizontal />
        </button>
      </AccountMenu>
    </div>
  )
}

/** 收着才有悬停提示（带字那一档字就在眼前）。 */
function NavTip({
  label,
  show,
  children,
}: {
  label: string
  show: boolean
  children: ReactNode
}) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
