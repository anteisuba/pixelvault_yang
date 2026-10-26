'use client'

import {
  useContext,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_LIBRARY_ITEMS } from '@/constants/navigation'
import {
  STUDIO_LIBRARY_TAB_IDS,
  studioLibraryPath,
  type StudioLibraryCategoryId,
} from '@/constants/studio-shell'
import { ChatCircleText, Library } from '@/components/icons'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { StudioLibraryPicker } from '@/components/business/studio/shell/StudioShellBench'
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
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { Link, usePathname } from '@/i18n/navigation'
import {
  isStudioShellPath,
  libraryCategoryFromPath,
  studioConversationHref,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/**
 * 左栏一格（用户 10-26：回到 10-21 那版窄图标栏的 CSS 与动效）：灰底上一列图标，
 * ⛔ 每格自己亮 —— 当前那一格靠滑过来的白浮片 + 左边墨竖条（`SidebarMenuSlider`），
 * 悬停是一块往暗走的幽灵块跟着滑（反极性，app-shell.md §5.1）。格子只换字色。
 * `data-slot` / `data-active` 是 `useNavIndicator` 认格子的记号。
 */
const RAIL_ITEM_CLASS =
  'relative z-1 grid size-10 place-items-center rounded-md text-sidebar-foreground outline-hidden ring-sidebar-ring transition-colors duration-fast ease-standard hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent-strong data-[active=true]:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground [&>svg]:size-4.5 [&>svg]:transition-transform [&>svg]:duration-fast [&>svg]:ease-standard hover:[&>svg]:scale-105 motion-reduce:transition-none'

/** 左栏单独一颗、点开整页的那几样：画廊 · 素材 · 提示词在上（用户 10-26），角色在下一组。 */
const TOP_PAGE_IDS: readonly StudioLibraryCategoryId[] = [
  'gallery',
  'assets',
  'prompts',
]
const pageItems = (ids: readonly StudioLibraryCategoryId[]) =>
  ids.flatMap((id) =>
    STUDIO_LIBRARY_ITEMS.filter((item) => item.id === id).map((item) => ({
      ...item,
      id,
    })),
  )
const TOP_PAGE_ITEMS = pageItems(TOP_PAGE_IDS)
const CARDS_ITEMS = pageItems(['cards'])

/**
 * `/studio` 外壳左边那一栏（用户 10-26 整理）：
 * 对话（回到和她的这一段）｜画廊 · 素材 · 提示词｜角色 · 库▾ … 最底下账号。
 *
 * - 换人只在白框左上头像▾，新对话 / 历史 / 聊天在对话头上 —— ⛔ 左栏不再放头像、新对话、聊天。
 * - 台从白框右边缘那条细线浮出（首页也有）—— ⛔ 左栏不再放「工作台」。
 * - 「库」点开浮出一条竖排的库（LoRA · 酒馆 · 标签 · 音色），点一个进那一个。
 */
export function StudioConversationList({ className }: { className?: string }) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const intent = useIntentPrefetch()
  const pathname = usePathname()
  const kind = studioShellRouteKind(pathname)
  const openCategory = libraryCategoryFromPath(pathname)
  const { sessionId } = useStudioOperatorState()
  const [librariesOpen, setLibrariesOpen] = useState(false)
  const librarySlot = useContext(StudioLibraryTargetContext)
  const libraryActive =
    openCategory !== null &&
    (STUDIO_LIBRARY_TAB_IDS as readonly string[]).includes(openCategory)
  /** 对话亮着：首页、开着台（台也是这段对话的一部分）。整页的库、外壳以外的页（设置等，`AppRail`）不算。 */
  const conversationActive =
    isStudioShellPath(pathname) &&
    (kind === 'home' || kind === 'bench') &&
    openCategory === null
  const navRef = useRef<HTMLElement>(null)
  const indicator = useNavIndicator(navRef, pathname)
  /** 库是整页、没有返回键：再点一下亮着的那一颗 = 收起库，回到进来之前那一页。 */
  const closeIfActive = (active: boolean) => (event: MouseEvent) => {
    if (!active || !librarySlot) return
    event.preventDefault()
    librarySlot.close()
  }
  const conversationHref = studioConversationHref(sessionId)

  const pageLink = (item: (typeof TOP_PAGE_ITEMS)[number]) => {
    const Icon = item.icon
    const label = tAll(item.labelKey)
    const active = openCategory === item.id
    const href = studioLibraryPath(item.id)
    return (
      <NavTip key={item.id} label={label}>
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
          className={RAIL_ITEM_CLASS}
        >
          <Icon />
        </Link>
      </NavTip>
    )
  }

  return (
    <nav
      ref={navRef}
      aria-label={t('conversations')}
      data-testid="studio-conversation-list"
      onPointerOver={indicator.onPointerOver}
      onPointerLeave={indicator.onPointerLeave}
      className={cn(
        'relative h-svh w-14 shrink-0 flex-col items-center gap-1 bg-sidebar py-3',
        className,
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

      <NavTip label={t('conversation')}>
        <Link
          href={conversationHref}
          prefetch={false}
          {...intent(conversationHref)}
          aria-label={t('conversation')}
          aria-current={conversationActive ? 'page' : undefined}
          data-slot="sidebar-menu-button"
          data-active={conversationActive}
          data-testid="studio-shell-conversation-key"
          className={RAIL_ITEM_CLASS}
        >
          <ChatCircleText />
        </Link>
      </NavTip>

      <RailDivider />
      {TOP_PAGE_ITEMS.map(pageLink)}
      <RailDivider />
      {CARDS_ITEMS.map(pageLink)}

      <Popover open={librariesOpen} onOpenChange={setLibrariesOpen}>
        <NavTip label={t('library')}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('library')}
              data-slot="sidebar-menu-button"
              data-active={libraryActive}
              data-testid="studio-shell-libraries"
              className={RAIL_ITEM_CLASS}
            >
              <Library />
            </button>
          </PopoverTrigger>
        </NavTip>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-auto rounded-full bg-transparent p-0 shadow-none"
        >
          <StudioLibraryPicker
            activeId={libraryActive ? openCategory : null}
            replace={openCategory !== null}
            onPicked={() => setLibrariesOpen(false)}
          />
        </PopoverContent>
      </Popover>

      <StudioConversationListAccount />
    </nav>
  )
}

/** 两组之间那根细线（10-21 那版收起档的段标题）。 */
function RailDivider() {
  return (
    <span aria-hidden className="my-1.5 h-px w-6 shrink-0 bg-sidebar-border" />
  )
}

function StudioConversationListAccount() {
  const t = useTranslations('Navbar')
  const { profile } = useMyProfile()

  return (
    <div className="mt-auto">
      <AccountMenu side="right" align="end" showProfile>
        <button
          type="button"
          aria-label={t('account')}
          className="grid size-10 place-items-center rounded-full focus-visible:outline-none focus-visible:shadow-focus"
        >
          <ProfileAvatar
            avatarUrl={profile?.avatarUrl}
            size={32}
            className="size-8"
            iconClassName="size-4"
          />
        </button>
      </AccountMenu>
    </div>
  )
}

function NavTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
