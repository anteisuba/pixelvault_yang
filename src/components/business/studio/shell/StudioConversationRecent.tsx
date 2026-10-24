'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { voiceRoomPath } from '@/constants/routes'
import { STUDIO_SHELL_RECENT_LIMIT } from '@/constants/studio-shell'
import {
  conversationBenchOf,
  useStudioConversationBenchOverrides,
} from '@/hooks/use-studio-conversation-bench'
import {
  useStudioConversationActivity,
  type StudioConversationActivityView,
} from '@/hooks/use-studio-conversation-activity'
import { useShellVoiceRooms } from '@/hooks/use-shell-voice-rooms'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import { useRouter } from '@/i18n/navigation'
import { deriveAssistantConversationTitle } from '@/lib/assistant-conversation-title'
import {
  studioBenchHref,
  studioConversationHref,
} from '@/lib/studio-shell-route'
import { cn } from '@/lib/utils'
import type { StudioShellRouteKind } from '@/constants/studio-shell'

type RecentItem =
  | {
      kind: 'chat'
      id: string
      title: string
      updatedAt: string
      bench: string | null
    }
  | {
      kind: 'room'
      id: string
      title: string
      updatedAt: string
      cover: string | null
      initial: string
    }

/**
 * 左边列表「最近」那一段（第 9f 步 9f-3）：助手对话和配音间混排，按最近用过的时间。
 *
 * - 封面：对话 = 这段里最新出的那一张（还没出过就只有标题）；配音间 = 班底第一位的头像。
 * - 进度圈：这段对话有任务在跑，封面上盖一圈，右边写「出好了几个 / 一共几个」。
 * - 小点：你不在这段的时候它出完了；点开就消失（只记在本机）。
 * - 点一段对话：回到它最后开着的台（台跟着对话走）；同一个台上就地换对话、台不动。
 */
export function StudioConversationRecent({
  history,
  routeKind,
  pathname,
  rowClass,
  rowActiveClass,
}: {
  history: UseStudioOperatorHistoryResult | null
  routeKind: StudioShellRouteKind
  pathname: string
  rowClass: string
  rowActiveClass: string
}) {
  const t = useTranslations('StudioShell')
  const tOperator = useTranslations('StudioOperator')
  const tRoom = useTranslations('VoiceRoom')
  const router = useRouter()
  const benchOverrides = useStudioConversationBenchOverrides()
  const { rooms, activeRoomId } = useShellVoiceRooms()
  const onAudio = routeKind === 'page'
  const currentChatId = onAudio ? null : (history?.currentSessionId ?? null)

  const items = useMemo<RecentItem[]>(() => {
    const chats: RecentItem[] = (history?.sessions ?? []).map((session) => ({
      kind: 'chat',
      id: session.id,
      title:
        deriveAssistantConversationTitle(session.title) ??
        tOperator('history.untitled'),
      updatedAt: session.updatedAt,
      bench: conversationBenchOf(session.id, session.bench, benchOverrides),
    }))
    const roomItems: RecentItem[] = rooms.map((room) => ({
      kind: 'room',
      id: room.id,
      title: room.name ?? tRoom('untitledRoom'),
      updatedAt: room.updatedAt,
      cover: room.cast[0]?.coverImage ?? null,
      initial: [...(room.cast[0]?.name ?? room.name ?? '?')][0] ?? '?',
    }))
    return [...chats, ...roomItems]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, STUDIO_SHELL_RECENT_LIMIT)
  }, [benchOverrides, history?.sessions, rooms, tOperator, tRoom])

  const chatIds = useMemo(
    () => items.flatMap((item) => (item.kind === 'chat' ? [item.id] : [])),
    [items],
  )
  const activity = useStudioConversationActivity(chatIds, currentChatId)

  const openChat = (id: string, bench: string | null) => {
    if (bench) {
      // 同一个台上：就地换对话，台不卸载（地址里的 `?c=` 跟着换）。
      if (routeKind === 'bench' && pathname === bench && history) {
        history.openSession(id)
        return
      }
      router.push(studioBenchHref(bench, id))
      return
    }
    router.push(studioConversationHref(id))
  }

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <h2 className="px-4 pb-1 text-xs font-medium text-sidebar-subtle">
        {t('recent')}
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {items.map((item) => {
          const active =
            item.kind === 'chat'
              ? currentChatId === item.id
              : onAudio && activeRoomId === item.id
          const view = item.kind === 'chat' ? activity.get(item.id) : undefined
          return (
            <li key={`${item.kind}:${item.id}`}>
              <button
                type="button"
                onClick={() =>
                  item.kind === 'chat'
                    ? openChat(item.id, item.bench)
                    : router.push(voiceRoomPath(item.id))
                }
                aria-current={active ? 'true' : undefined}
                title={item.title}
                data-testid="studio-recent-row"
                data-kind={item.kind}
                className={cn(rowClass, 'h-10', active && rowActiveClass)}
              >
                {item.kind === 'room' ? (
                  <RoomCover cover={item.cover} initial={item.initial} />
                ) : view?.cover || view?.progress ? (
                  <ChatCover view={view} />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {view?.progress ? (
                  <span className="shrink-0 text-xs tabular-nums text-sidebar-subtle">
                    {view.progress.done}/{view.progress.total}
                  </span>
                ) : view?.unseen ? (
                  <span
                    aria-label={t('newResult')}
                    data-testid="studio-recent-unseen"
                    className="size-1.5 shrink-0 rounded-full bg-primary"
                  />
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const COVER_CLASS =
  'relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-md bg-sidebar-accent'

function ChatCover({ view }: { view: StudioConversationActivityView }) {
  return (
    <span className={COVER_CLASS} data-testid="studio-recent-cover">
      {view.cover ? (
        // 封面是 R2 / CDN 上的缩略图，走 next/image 也只是原样转一手（images.unoptimized）。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.cover}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : null}
      {view.progress ? <ProgressRing {...view.progress} /> : null}
    </span>
  )
}

function RoomCover({
  cover,
  initial,
}: {
  cover: string | null
  initial: string
}) {
  return (
    <span className={cn(COVER_CLASS, 'rounded-full text-xs')}>
      {cover ? (
        // 音色封面来自任意外部主机（Fish 市场），同 `VoiceAvatar`。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  )
}

const RING_RADIUS = 10
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** 封面上盖的那一圈：出好的那一截是亮的。 */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const share = total > 0 ? done / total : 0
  return (
    <span
      data-testid="studio-recent-progress"
      className="absolute inset-0 grid place-items-center bg-black/40"
    >
      <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="2.5"
          className="stroke-white/40"
        />
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - Math.max(share, 0.08))}
          className="stroke-white"
        />
      </svg>
    </span>
  )
}
