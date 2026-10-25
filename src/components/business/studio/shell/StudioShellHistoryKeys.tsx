'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  ROUTES,
  studioConversationPath,
  voiceRoomPath,
} from '@/constants/routes'
import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import {
  VOICE_ROOM_NAME_MAX_LENGTH,
  VOICE_ROOM_SPEAKER_KIND,
} from '@/constants/voiceroom'
import { ChatCircle, SquarePen } from '@/components/icons'
import { GroupDisc } from '@/components/business/studio/assistant-operator/StudioOperatorAvatarSwitcher'
import { SessionActivityBadge } from '@/components/business/studio/assistant-operator/StudioOperatorHeader'
import {
  ShellHistoryMenu,
  type ShellHistoryItem,
} from '@/components/business/studio/shell/ShellHistoryMenu'
import {
  deleteAssistantConversationAPI,
  listAssistantConversationsAPI,
  renameAssistantConversationAPI,
} from '@/lib/api-client'
import {
  deleteVoiceRoomAPI,
  updateVoiceRoomAPI,
} from '@/lib/api-client/voiceroom'
import { useChatPersona, useOpenPersonaChat } from '@/hooks/use-chat-persona'
import {
  refreshShellVoiceRooms,
  setShellVoiceRooms,
  useShellVoiceRooms,
} from '@/hooks/use-shell-voice-rooms'
import { useStudioConversationActivity } from '@/hooks/use-studio-conversation-activity'
import { useStudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import { useStudioOperatorHistoryView } from '@/hooks/use-studio-operator-history'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { usePathname, useRouter } from '@/i18n/navigation'
import { studioShellRouteKind } from '@/lib/studio-shell-route'
import { roomsForPersona } from '@/lib/voiceroom-cast'
import { cn } from '@/lib/utils'
import type { AssistantConversationSummary } from '@/types/assistant-conversation'

/** 左栏的图标键（与 `StudioConversationList` 同一份皮肤）。 */
const NAV_BUTTON_CLASS =
  'grid size-10 place-items-center rounded-12 text-ink-2 transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-fill-strong data-[state=open]:text-foreground [&>svg]:size-4.5'

/**
 * 「新对话」那一颗（用户 10-25 定 B）：白底小方块，比别的图标显眼一点，⛔ 黑圆。
 * 开着浮层时压一档底，和别的键开着时同一种说法。
 */
const NEW_CHAT_BUTTON_CLASS =
  'mb-2 grid size-10 place-items-center rounded-12 bg-raise text-foreground shadow-soft transition-[transform,background-color] duration-fast ease-standard active:scale-96 focus-visible:outline-none focus-visible:shadow-focus data-[state=open]:bg-fill-strong data-[state=open]:shadow-none motion-reduce:transition-none [&>svg]:size-4.5'

/**
 * 工作台的对话：左栏「新对话」那颗点开 = 第一行「＋ 新对话」+ 以前的几段（用户 10-25 定 A，
 * 对话顶上标题 ▾ 的历史挪到这里）。
 *
 * ⚠ 对话面板在场时读它发布的那份历史（`useStudioOperatorHistoryView`），选一段就地换上；
 *   不在场（「聊天」那一页、整页的库）就自己拿一份列表，选一段去 `/studio/c/<编号>`。
 */
export function StudioShellNewChatKey() {
  const t = useTranslations('StudioShell')
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

  const startNewChat = () => {
    if (kind === 'home' && actions) {
      actions.newThread()
      return
    }
    router.push(ROUTES.STUDIO)
  }

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

  return (
    <ShellHistoryMenu
      testId="studio-shell-work-history"
      tooltip={t('newChat')}
      newLabel={t('newChat')}
      newDisabled={working}
      onNew={startNewChat}
      items={items}
      currentId={currentId}
      loading={view ? view.isHydrating : own === null}
      error={view ? view.error : ownError}
      selectDisabled={() => working || Boolean(view?.loadingSessionId) || false}
      deleteDisabled={(id) => working && id === currentId}
      renamingId={view ? view.renamingSessionId : ownBusy.renaming}
      deletingId={view ? view.deletingSessionId : ownBusy.deleting}
      onOpenChange={(open) => {
        if (!open) return
        if (view) view.refreshSessions(true)
        else void loadOwn()
      }}
      onSelect={(id) => {
        const session = find(id)
        if (inPlace && view && session) view.selectSession(session)
        else router.push(studioConversationPath(id))
      }}
      onRename={(id, title) => {
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
      }}
      onDelete={async (id) => {
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
      }}
    >
      <button
        type="button"
        aria-label={t('newChat')}
        data-testid="studio-shell-new-chat"
        className={NEW_CHAT_BUTTON_CLASS}
      >
        <SquarePen />
      </button>
    </ShellHistoryMenu>
  )
}

/**
 * 「聊天」（用户 10-25：配音间改名聊天，和工作台的对话分开）：点开 = 「＋ 和 X 新聊天」+ 和现在这一位
 * （全局助手人设）的几段，有她的群也算。换了人设，这里跟着换。
 */
export function StudioShellChatKey({ active }: { active: boolean }) {
  const t = useTranslations('StudioShell')
  const router = useRouter()
  const chatPersona = useChatPersona()
  const personaChat = useOpenPersonaChat()
  const { rooms, activeRoomId, actions } = useShellVoiceRooms()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mine = chatPersona.ready ? roomsForPersona(rooms, chatPersona.ref) : []
  const items: ShellHistoryItem[] = mine.map((room) => {
    const voices = room.cast.filter(
      (member) => member.kind === VOICE_ROOM_SPEAKER_KIND.VOICE,
    )
    return {
      id: room.id,
      title:
        room.name ??
        (voices.length > 1
          ? voices.map((member) => member.name).join(' · ')
          : null),
      updatedAt: room.updatedAt,
      leading:
        voices.length > 1 ? (
          <span className="size-5.5 shrink-0">
            <GroupDisc members={voices} />
          </span>
        ) : undefined,
    }
  })

  const rename = async (id: string, name: string | null) => {
    if (actions) return actions.rename(id, name)
    const result = await updateVoiceRoomAPI({ roomId: id, name })
    if (!result.success || !result.data) {
      setError(result.error ?? null)
      return
    }
    const updated = result.data
    setShellVoiceRooms(rooms.map((room) => (room.id === id ? updated : room)))
  }

  return (
    <ShellHistoryMenu
      testId="studio-shell-chat-history"
      tooltip={t('chat')}
      newLabel={t('newChatWith', { name: chatPersona.name })}
      newDisabled={!chatPersona.ready || personaChat.busy}
      onNew={() => void personaChat.open(chatPersona.target, { fresh: true })}
      items={items}
      currentId={activeRoomId}
      loading={!chatPersona.ready}
      error={error}
      titleMaxLength={VOICE_ROOM_NAME_MAX_LENGTH}
      renamingId={renamingId}
      deletingId={deletingId}
      onOpenChange={(open) => {
        // 「聊天」那一页开着时它手上那份才是真的；不在那一页就重新问一次。
        if (open && !actions) void refreshShellVoiceRooms()
      }}
      onSelect={(id) => {
        if (id !== activeRoomId) router.push(voiceRoomPath(id))
      }}
      onRename={(id, title) => {
        setRenamingId(id)
        void rename(id, title.trim() || null).finally(() => setRenamingId(null))
      }}
      onDelete={async (id) => {
        setDeletingId(id)
        try {
          if (actions) {
            await actions.remove(id)
            return true
          }
          const result = await deleteVoiceRoomAPI(id)
          if (!result.success) {
            setError(result.error ?? null)
            return false
          }
          setShellVoiceRooms(rooms.filter((room) => room.id !== id))
          return true
        } finally {
          setDeletingId(null)
        }
      }}
    >
      <button
        type="button"
        aria-label={t('chat')}
        aria-current={active ? 'page' : undefined}
        data-testid="studio-shell-voice-room"
        className={cn(
          NAV_BUTTON_CLASS,
          active && 'bg-fill-strong text-foreground',
        )}
      >
        <ChatCircle />
      </button>
    </ShellHistoryMenu>
  )
}
