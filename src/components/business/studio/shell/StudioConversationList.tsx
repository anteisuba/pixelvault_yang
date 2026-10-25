'use client'

import { useContext, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { STUDIO_LIBRARY_ITEMS } from '@/constants/navigation'
import {
  STUDIO_LIBRARY_TAB_IDS,
  studioLibraryPath,
  type StudioLibraryCategoryId,
} from '@/constants/studio-shell'
import { Images, LayoutGrid, Library } from '@/components/icons'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import {
  StudioOperatorAvatarSwitcher,
  StudioOperatorCurrentAvatar,
} from '@/components/business/studio/assistant-operator/StudioOperatorAvatarSwitcher'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import {
  StudioShellChatKey,
  StudioShellNewChatKey,
} from '@/components/business/studio/shell/StudioShellHistoryKeys'
import {
  StudioBenchPicker,
  StudioLibraryPicker,
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
import { useStudioShellAvatar } from '@/hooks/use-studio-shell-avatar'
import { Link, usePathname } from '@/i18n/navigation'
import {
  libraryCategoryFromPath,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/** 左栏的图标键（ui-spec §1 / §9「左栏」）：落在灰底上，当前那一颗 `fill-strong`。 */
const NAV_BUTTON_CLASS =
  'grid size-10 place-items-center rounded-12 text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-fill-strong data-[state=open]:text-foreground [&>svg]:size-4.5'

const NAV_ACTIVE_CLASS = 'bg-fill-strong text-foreground'

/** 左栏单独一颗、点开整页的那几样（用户 10-25）：素材 · 角色 · 提示词。 */
const PAGE_ITEM_IDS: readonly StudioLibraryCategoryId[] = [
  'assets',
  'cards',
  'prompts',
]
const PAGE_ITEMS = PAGE_ITEM_IDS.flatMap((id) =>
  STUDIO_LIBRARY_ITEMS.filter((item) => item.id === id).map((item) => ({
    ...item,
    id,
  })),
)

/**
 * `/studio` 外壳左边那一栏（ui-spec §1）：64 宽的细图标栏落在灰底上，只放图标 ——
 * 助手头像（点开换全局人设）、白底「新对话」、画廊 / 聊天 / 工作台 / 库 / 素材 / 角色 / 提示词、最底下头像（顺序
 * 用户 10-25 定）。点「工作台」浮出一条竖排的台、点「库」浮出一条竖排的库（LoRA · 酒馆 · 标签 · 音色），点一个进那一个。
 *
 * ⛔ 没有常驻的对话列表（用户 10-25）：工作台的历史在「新对话」那颗里，聊天记录在「聊天」那颗里
 *   （只列现在这一位的）；两边分开，人设都跟最上面那格走。
 */
export function StudioConversationList({ className }: { className?: string }) {
  const t = useTranslations('StudioShell')
  const tNav = useTranslations('Navbar')
  const tAll = useTranslations()
  const tOperator = useTranslations('StudioOperator')
  const avatar = useStudioShellAvatar()
  const pathname = usePathname()
  const kind = studioShellRouteKind(pathname)
  const openCategory = libraryCategoryFromPath(pathname)
  const [benchesOpen, setBenchesOpen] = useState(false)
  const [librariesOpen, setLibrariesOpen] = useState(false)
  const voiceRoomActive =
    pathname === ROUTES.STUDIO_AUDIO ||
    pathname.startsWith(`${ROUTES.STUDIO_AUDIO}/`)
  const openBenchId =
    kind === 'bench' && !voiceRoomActive ? activeBenchId(pathname) : undefined
  const librarySlot = useContext(StudioLibraryTargetContext)
  const libraryActive =
    openCategory !== null &&
    (STUDIO_LIBRARY_TAB_IDS as readonly string[]).includes(openCategory)
  /** 库是整页、没有返回键：再点一下亮着的那一颗 = 收起库，回到进来之前那一页。 */
  const closeIfActive = (active: boolean) => (event: MouseEvent) => {
    if (!active || !librarySlot) return
    event.preventDefault()
    librarySlot.close()
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
      {/* 最上面那格 = 全局助手，点开换人设（用户 10-25）；收起 / 展开交给对话头那颗。
          换了人对话收着就拉回来。 */}
      <StudioOperatorAvatarSwitcher
        side="right"
        onPicked={avatar.expand ?? undefined}
      >
        <button
          type="button"
          aria-label={tOperator('mode.pickCharacter')}
          data-testid="studio-shell-avatar"
          className="mb-2 grid size-10 place-items-center rounded-full focus-visible:outline-none focus-visible:shadow-focus"
        >
          <span className="size-9 rounded-full transition-transform duration-fast ease-standard active:scale-96 motion-reduce:transition-none">
            <StudioOperatorCurrentAvatar fly={false} />
          </span>
        </button>
      </StudioOperatorAvatarSwitcher>
      <StudioShellNewChatKey />

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

      {/* 聊天（用户 10-25：配音间改名聊天）：点开是和现在这一位的聊天记录。 */}
      <StudioShellChatKey active={voiceRoomActive} />

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

      <Popover open={librariesOpen} onOpenChange={setLibrariesOpen}>
        <NavTip label={t('library')}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('library')}
              data-testid="studio-shell-libraries"
              className={cn(
                NAV_BUTTON_CLASS,
                libraryActive && NAV_ACTIVE_CLASS,
              )}
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

      {/* 素材 / 角色 / 提示词各一颗（用户 10-25），点开整页；开着时换一样 = 换叠层里那一页，⛔ 多压一层历史。 */}
      {PAGE_ITEMS.map((item) => {
        const Icon = item.icon
        const label = tAll(item.labelKey)
        const active = openCategory === item.id
        return (
          <NavTip key={item.id} label={label}>
            <Link
              href={studioLibraryPath(item.id)}
              replace={openCategory !== null}
              onClick={closeIfActive(active)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              data-testid={`studio-shell-page-${item.id}`}
              className={cn(NAV_BUTTON_CLASS, active && NAV_ACTIVE_CLASS)}
            >
              <Icon />
            </Link>
          </NavTip>
        )
      })}

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
