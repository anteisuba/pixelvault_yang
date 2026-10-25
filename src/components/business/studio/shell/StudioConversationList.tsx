'use client'

import { useContext, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { studioLibraryPath } from '@/constants/studio-shell'
import {
  ChatCircleText,
  Images,
  LayoutGrid,
  Library,
  SquarePen,
} from '@/components/icons'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { StudioConversationRecent } from '@/components/business/studio/shell/StudioConversationRecent'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import {
  StudioBenchPicker,
  activeBenchId,
} from '@/components/business/studio/shell/StudioShellBench'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import { useStudioOperatorHistoryView } from '@/hooks/use-studio-operator-history'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import {
  libraryCategoryFromPath,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/** 左栏的图标键（ui-spec §1 / §9「左栏」）：落在灰底上，当前那一颗 `fill-strong`。 */
const NAV_BUTTON_CLASS =
  'grid size-10 place-items-center rounded-12 text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-fill-strong data-[state=open]:text-foreground [&>svg]:size-4.5'

const NAV_ACTIVE_CLASS = 'bg-fill-strong text-foreground'

/** 浮出来的对话列表里的行（对话列表的行圆角 10）。 */
const ROW_CLASS =
  'flex h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-2sm text-foreground transition-colors duration-fast ease-standard hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus [&>svg]:size-4 [&>svg]:shrink-0'

const ROW_ACTIVE_CLASS = 'bg-row-selected font-medium'

/**
 * `/studio` 外壳左边那一栏（ui-spec §1）：64 宽的细图标栏落在灰底上，只放图标 ——
 * AN 字标、黑色「新对话」、对话 / 工作台 / 库 / 画廊、最底下头像。点「对话」从栏旁浮出对话列表
 * （300 宽；助手对话与配音间混排，9f-3）；点「工作台」浮出一条竖排的台（用户 10-25），
 * 点一个进那个台。
 *
 * ⚠ 读的是面板发布出来的历史与「新对话」那只手（`useStudioOperatorHistoryView` /
 *   `useStudioOperatorActions`），⛔ 这里再调一次驱动 hook。
 * ⚠ 点一段对话：首页上换地址（地址 → 对话由 `useStudioConversationUrl` 接）；开着台时
 *   就地换对话、台不动（地址里的 `?c=` 跟着换）。
 */
export function StudioConversationList({ className }: { className?: string }) {
  const t = useTranslations('StudioShell')
  const tNav = useTranslations('Navbar')
  const pathname = usePathname()
  const router = useRouter()
  const history = useStudioOperatorHistoryView()
  const actions = useStudioOperatorActions()
  const kind = studioShellRouteKind(pathname)
  const openCategory = libraryCategoryFromPath(pathname)
  const [listOpen, setListOpen] = useState(false)
  const [benchesOpen, setBenchesOpen] = useState(false)
  const openBenchId = kind === 'bench' ? activeBenchId(pathname) : undefined
  const librarySlot = useContext(StudioLibraryTargetContext)
  const libraryActive = openCategory !== null && openCategory !== 'gallery'
  /** 库是整页、没有返回键：再点一下亮着的那一颗 = 收起库，回到进来之前那一页。 */
  const closeIfActive = (active: boolean) => (event: MouseEvent) => {
    if (!active || !librarySlot) return
    event.preventDefault()
    librarySlot.close()
  }

  const startNewChat = () => {
    if (kind === 'home' && actions) {
      actions.newThread()
      return
    }
    router.push(ROUTES.STUDIO)
  }

  return (
    <nav
      aria-label={t('conversations')}
      data-testid="studio-conversation-list"
      className={cn(
        'h-svh w-16 shrink-0 flex-col items-center gap-1 py-3',
        className,
      )}
    >
      <Link
        href={ROUTES.STUDIO}
        aria-label={tNav('brand')}
        className="mb-2 grid size-10 place-items-center rounded-12 text-sm font-bold tracking-brand text-foreground focus-visible:outline-none focus-visible:shadow-focus"
      >
        AN
      </Link>
      <NavTip label={t('newChat')}>
        <button
          type="button"
          onClick={startNewChat}
          aria-label={t('newChat')}
          data-testid="studio-shell-new-chat"
          className="mb-2 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-fast ease-standard active:scale-96 focus-visible:outline-none focus-visible:shadow-focus [&>svg]:size-4.5"
        >
          <SquarePen />
        </button>
      </NavTip>

      <Popover open={listOpen} onOpenChange={setListOpen}>
        <NavTip label={t('conversations')}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('conversations')}
              data-testid="studio-shell-conversations"
              className={NAV_BUTTON_CLASS}
            >
              <ChatCircleText />
            </button>
          </PopoverTrigger>
        </NavTip>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="flex h-(--radix-popover-content-available-height) max-h-160 w-75 flex-col p-0"
        >
          <StudioConversationRecent
            history={history}
            routeKind={kind}
            pathname={pathname}
            rowClass={ROW_CLASS}
            rowActiveClass={ROW_ACTIVE_CLASS}
            onOpen={() => setListOpen(false)}
          />
        </PopoverContent>
      </Popover>

      <Popover open={benchesOpen} onOpenChange={setBenchesOpen}>
        <NavTip label={t('workbench')}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('workbench')}
              data-testid="studio-shell-benches"
              className={cn(NAV_BUTTON_CLASS, openBenchId && NAV_ACTIVE_CLASS)}
            >
              <LayoutGrid />
            </button>
          </PopoverTrigger>
        </NavTip>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-auto rounded-full bg-transparent p-0 shadow-none"
        >
          <StudioBenchPicker
            activeId={openBenchId}
            onPicked={() => setBenchesOpen(false)}
          />
        </PopoverContent>
      </Popover>

      {/* 库开着时换一类 = 换叠层里那一页，⛔ 多压一层历史（后退直接回到台）。 */}
      <NavTip label={t('library')}>
        <Link
          href={studioLibraryPath('assets')}
          replace={openCategory !== null}
          onClick={closeIfActive(libraryActive)}
          aria-label={t('library')}
          aria-current={libraryActive ? 'page' : undefined}
          className={cn(NAV_BUTTON_CLASS, libraryActive && NAV_ACTIVE_CLASS)}
        >
          <Library />
        </Link>
      </NavTip>
      <NavTip label={tNav('links.gallery')}>
        <Link
          href={studioLibraryPath('gallery')}
          replace={openCategory !== null}
          onClick={closeIfActive(openCategory === 'gallery')}
          aria-label={tNav('links.gallery')}
          aria-current={openCategory === 'gallery' ? 'page' : undefined}
          className={cn(
            NAV_BUTTON_CLASS,
            openCategory === 'gallery' && NAV_ACTIVE_CLASS,
          )}
        >
          <Images />
        </Link>
      </NavTip>

      <StudioConversationListAccount />
    </nav>
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
