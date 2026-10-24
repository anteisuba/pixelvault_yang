'use client'

import { useTranslations } from 'next-intl'

import { SHELL_NAV_GO } from '@/constants/navigation'
import { ROUTES } from '@/constants/routes'
import {
  STUDIO_LIBRARY_CATEGORY_IDS,
  STUDIO_SHELL_LIST_WIDTH_CLASS,
  STUDIO_SHELL_RECENT_LIMIT,
  studioLibraryPath,
} from '@/constants/studio-shell'
import { AudioLines, ChevronDown, SquarePen } from '@/components/icons'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { ProfileAvatar } from '@/components/layout/ProfileAvatar'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import { useStudioOperatorHistoryView } from '@/hooks/use-studio-operator-history'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
import {
  libraryCategoryFromPath,
  studioConversationHref,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'

/** 库的几类（点了叠在中间，`/library/<类>`）；名字与图标取全站「去处」那份清单。 */
const LIBRARY_ROWS = STUDIO_LIBRARY_CATEGORY_IDS.flatMap((id) =>
  SHELL_NAV_GO.filter((item) => item.id === id).map((item) => ({
    ...item,
    id,
  })),
)

const ROW_CLASS =
  'flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground transition-colors duration-fast ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring [&>svg]:size-4 [&>svg]:shrink-0'

const ROW_ACTIVE_CLASS =
  'bg-sidebar-active-surface font-medium text-sidebar-accent-foreground shadow-sidebar-chip hover:bg-sidebar-active-surface'

/**
 * `/studio` 外壳左边那一栏 —— **在哪儿**（第 9f 步方向 E，9f-1 先做简版）：
 * 新对话 · 库（素材 / 角色 / 提示词 / 音色 / 画廊，叠在中间）· 配音间 · 最近对话 · 账号。
 *
 * ⚠ 读的是面板发布出来的历史与「新对话」那只手（`useStudioOperatorHistoryView` /
 *   `useStudioOperatorActions`），⛔ 这里再调一次驱动 hook。
 * ⚠ 点一段对话：首页上换地址（地址 → 对话由 `useStudioConversationUrl` 接）；开着台时
 *   就地换对话、台不动（地址里的 `?c=` 跟着换）。
 */
export function StudioConversationList({ className }: { className?: string }) {
  const t = useTranslations('StudioShell')
  const tAll = useTranslations()
  const tOperator = useTranslations('StudioOperator')
  const pathname = usePathname()
  const router = useRouter()
  const history = useStudioOperatorHistoryView()
  const actions = useStudioOperatorActions()
  const kind = studioShellRouteKind(pathname)
  const openCategory = libraryCategoryFromPath(pathname)
  const recent = (history?.sessions ?? []).slice(0, STUDIO_SHELL_RECENT_LIMIT)

  const startNewChat = () => {
    if (kind === 'home' && actions) {
      actions.newThread()
      return
    }
    router.push(ROUTES.STUDIO)
  }

  const openConversation = (id: string) => {
    if (kind === 'bench' && history) {
      history.openSession(id)
      return
    }
    router.push(studioConversationHref(id))
  }

  return (
    <nav
      aria-label={t('conversations')}
      data-testid="studio-conversation-list"
      className={cn(
        STUDIO_SHELL_LIST_WIDTH_CLASS,
        'h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5 p-2">
        <Link
          href={ROUTES.STUDIO}
          className="mb-1 px-2 py-1 text-base font-bold leading-none tracking-brand text-sidebar-accent-foreground"
        >
          {tAll('Navbar.brand')}
        </Link>
        <button
          type="button"
          onClick={startNewChat}
          data-testid="studio-shell-new-chat"
          className={ROW_CLASS}
        >
          <SquarePen />
          <span className="truncate">{t('newChat')}</span>
        </button>
      </div>

      <ul aria-label={t('library')} className="flex flex-col gap-0.5 px-2">
        {LIBRARY_ROWS.map((item) => {
          const Icon = item.icon
          const active = item.id === openCategory
          return (
            <li key={item.id}>
              {/* 库开着时换一类 = 换叠层里那一页，⛔ 多压一层历史（后退直接回到台）。 */}
              <Link
                href={studioLibraryPath(item.id)}
                replace={openCategory !== null}
                aria-current={active ? 'page' : undefined}
                className={cn(ROW_CLASS, active && ROW_ACTIVE_CLASS)}
              >
                <Icon />
                <span className="truncate">{tAll(item.labelKey)}</span>
              </Link>
            </li>
          )
        })}
        <li>
          <Link
            href={ROUTES.STUDIO_AUDIO}
            aria-current={kind === 'page' ? 'page' : undefined}
            className={cn(ROW_CLASS, kind === 'page' && ROW_ACTIVE_CLASS)}
          >
            <AudioLines />
            <span className="truncate">
              {tAll('StudioTools.tools.audio.label')}
            </span>
          </Link>
        </li>
      </ul>

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <h2 className="px-4 pb-1 text-xs font-medium text-sidebar-subtle">
          {t('recent')}
        </h2>
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {recent.map((session) => {
            const active = history?.currentSessionId === session.id
            const title =
              deriveAssistantConversationTitle(session.title) ??
              tOperator('history.untitled')
            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => openConversation(session.id)}
                  aria-current={active ? 'true' : undefined}
                  title={title}
                  className={cn(ROW_CLASS, active && ROW_ACTIVE_CLASS)}
                >
                  <span className="truncate">{title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <StudioConversationListAccount />
    </nav>
  )
}

function StudioConversationListAccount() {
  const t = useTranslations('Navbar')
  const { profile } = useMyProfile()
  const name = profile?.displayName ?? profile?.username

  return (
    <div className="border-t border-sidebar-border p-2">
      <AccountMenu side="top" align="start" showProfile>
        <button
          type="button"
          aria-label={t('account')}
          className="flex h-9 w-full items-center gap-2 overflow-hidden rounded-md px-1 text-left text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring transition-colors duration-fast ease-standard hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[state=open]:bg-sidebar-accent-strong"
        >
          <ProfileAvatar
            avatarUrl={profile?.avatarUrl}
            size={24}
            className="size-6 shrink-0"
            iconClassName="size-3.5"
          />
          <span className="min-w-0 flex-1 truncate">
            {name ?? t('account')}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-sidebar-subtle" />
        </button>
      </AccountMenu>
    </div>
  )
}
