'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ROUTES, studioConversationPath } from '@/constants/routes'
import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import { ChevronDown, History, PanelLeftOpen } from '@/components/icons'
import {
  StudioOperatorAvatarSwitcher,
  StudioOperatorCurrentAvatar,
} from '@/components/business/studio/assistant-operator/StudioOperatorAvatarSwitcher'
import { SessionActivityBadge } from '@/components/business/studio/assistant-operator/StudioOperatorHeader'
import { STUDIO_SHELL_AVATAR_ATTR } from '@/components/business/studio/shell/StudioShellAvatarFlight'
import {
  ShellHistoryMenu,
  type ShellHistoryItem,
} from '@/components/business/studio/shell/ShellHistoryMenu'
import {
  deleteAssistantConversationAPI,
  listAssistantConversationsAPI,
  renameAssistantConversationAPI,
} from '@/lib/api-client'
import { useChatPersona } from '@/hooks/use-chat-persona'
import { useStudioConversationActivity } from '@/hooks/use-studio-conversation-activity'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import { useStudioOperatorHistoryView } from '@/hooks/use-studio-operator-history'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { usePathname, useRouter } from '@/i18n/navigation'
import { studioShellRouteKind } from '@/lib/studio-shell-route'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'

/** 对话头里的图标键（和头部 ⋯ 同一档）。 */
const HEADER_KEY_CLASS =
  'grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-surface-fill data-[state=open]:text-foreground motion-reduce:transition-none [&>svg]:size-4.5'

/**
 * 工作台的对话记录（框里那一列与手机上对话头那颗下拉同一份）。
 *
 * ⚠ 对话面板在场时读它发布的那份历史（`useStudioOperatorHistoryView`），选一段就地换上；
 *   不在场就自己拿一份列表（`refresh` 时拿），选一段去 `/studio/c/<编号>`。
 */
export function useShellWorkHistory() {
  const tOperator = useTranslations('StudioOperator')
  const pathname = usePathname()
  const router = useRouter()
  const kind = studioShellRouteKind(pathname)
  const actions = useStudioOperatorActions()
  const view = useStudioOperatorHistoryView()
  const { status } = useStudioOperatorState()
  const working = view !== null && status === 'working'
  const inPlace = view !== null && (kind === 'home' || kind === 'bench')

  /** 面板不在场时自己拿的那份。 */
  const [own, setOwn] = useState<AssistantConversationSummary[] | null>(null)
  const [ownBusy, setOwnBusy] = useState<{
    renaming: string | null
    deleting: string | null
  }>({ renaming: null, deleting: null })
  const [ownError, setOwnError] = useState<string | null>(null)

  const sessions = useMemo(
    () => (view ? view.sessions : (own ?? [])),
    [view, own],
  )
  const ids = useMemo(() => sessions.map((session) => session.id), [sessions])
  const currentId = inPlace ? (view?.currentSessionId ?? null) : null
  const activity = useStudioConversationActivity(ids, currentId)

  const items: ShellHistoryItem[] = sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    badge: (
      <SessionActivityBadge
        view={activity.get(session.id)}
        unseenLabel={tOperator('history.unseen')}
      />
    ),
  }))
  const find = (id: string) => sessions.find((session) => session.id === id)

  const loadOwn = async () => {
    const result = await listAssistantConversationsAPI({
      operatorOnly: true,
      limit: STUDIO_OPERATOR_HISTORY.listLimit,
    })
    if (result.success) {
      setOwn(result.data)
      setOwnError(null)
    } else setOwnError(result.error)
  }

  return {
    items,
    currentId,
    loading: view ? view.isHydrating : own === null,
    error: view ? view.error : ownError,
    newDisabled: working,
    renamingId: view ? view.renamingSessionId : ownBusy.renaming,
    deletingId: view ? view.deletingSessionId : ownBusy.deleting,
    selectDisabled: () => working || Boolean(view?.loadingSessionId),
    deleteDisabled: (id: string) => working && id === currentId,
    refresh: () => {
      if (view) view.refreshSessions(true)
      else void loadOwn()
    },
    onNew: () => {
      if (kind === 'home' && actions) {
        actions.newThread()
        return
      }
      router.push(ROUTES.STUDIO)
    },
    onSelect: (id: string) => {
      const session = find(id)
      if (inPlace && view && session) view.selectSession(session)
      else router.push(studioConversationPath(id))
    },
    onRename: (id: string, title: string) => {
      const session = find(id)
      if (!session) return
      if (view) {
        void view.renameSession(session, title)
        return
      }
      setOwnBusy((busy) => ({ ...busy, renaming: id }))
      void renameAssistantConversationAPI(id, title).then((result) => {
        setOwnBusy((busy) => ({ ...busy, renaming: null }))
        if (result.success)
          setOwn((list) =>
            (list ?? []).map((item) =>
              item.id === id ? { ...item, title: result.data.title } : item,
            ),
          )
        else setOwnError(result.error)
      })
    },
    onDelete: async (id: string) => {
      const session = find(id)
      if (!session) return false
      if (view) return view.deleteSession(session)
      setOwnBusy((busy) => ({ ...busy, deleting: id }))
      const result = await deleteAssistantConversationAPI(id)
      setOwnBusy((busy) => ({ ...busy, deleting: null }))
      if (!result.success) {
        setOwnError(result.error)
        return false
      }
      setOwn((list) => (list ?? []).filter((item) => item.id !== id))
      return true
    },
  }
}

/** 手机上对话头最左那颗（桌面上是框里那一列，`StudioShellHistoryColumn`）：点开 = 「＋ 新对话」+ 以前的几段。 */
export function StudioShellHistoryKey() {
  const t = useTranslations('StudioShell')
  const { refresh, ...history } = useShellWorkHistory()

  return (
    <ShellHistoryMenu
      testId="studio-shell-work-history"
      tooltip={t('history')}
      newLabel={t('newChat')}
      {...history}
      onOpenChange={(open) => {
        if (open) refresh()
      }}
    >
      <button
        type="button"
        aria-label={t('history')}
        data-testid="studio-shell-history"
        className={HEADER_KEY_CLASS}
      >
        <History />
      </button>
    </ShellHistoryMenu>
  )
}

/** 框里那一列收起时，对话头最左那颗：点它把那一列拉回来（样件 v5）。 */
export function StudioShellHistoryExpandKey({
  onExpand,
}: {
  onExpand(): void
}) {
  const t = useTranslations('StudioShell')
  return (
    <button
      type="button"
      aria-label={t('historyShow')}
      title={t('historyShow')}
      data-testid="studio-shell-history-expand"
      onClick={onExpand}
      className={HEADER_KEY_CLASS}
    >
      <PanelLeftOpen />
    </button>
  )
}

/**
 * 头像 + 名字 ▾（对话头，用户 10-26 定稿 v5）：点开换人（`StudioOperatorAvatarSwitcher`）。
 * 正看着以前的聊天（只读）时写那个角色的名字，和头像同一个判据。
 */
export function StudioShellPersonaKey() {
  const t = useTranslations('StudioShell')
  const chatPersona = useChatPersona()
  const { chatCharacter } = useStudioOperatorState()
  const name = chatCharacter?.name ?? chatPersona.name

  return (
    <StudioOperatorAvatarSwitcher>
      <button
        type="button"
        aria-label={t('switchPersona', { name })}
        data-testid="studio-shell-persona"
        className="group/persona flex h-9 min-w-0 shrink items-center gap-2 rounded-full py-0 pr-2 pl-0.5 text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-surface-fill motion-reduce:transition-none"
      >
        <span
          {...{ [STUDIO_SHELL_AVATAR_ATTR]: 'header' }}
          className="size-8 shrink-0 rounded-full"
        >
          <StudioOperatorCurrentAvatar />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard group-data-[state=open]/persona:rotate-180 motion-reduce:transition-none"
        />
      </button>
    </StudioOperatorAvatarSwitcher>
  )
}
