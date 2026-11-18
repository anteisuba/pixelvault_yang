'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { ASSISTANT_CHAT_MODE_IDS } from '@/constants/assistant-protocol'
import {
  getCachedAssistantCharacter,
  useAssistantPersona,
} from '@/hooks/use-assistant-persona'
import { useOperatorChatMode } from '@/hooks/use-chat-persona'
import { useMyProfile } from '@/hooks/use-my-profile'
import {
  appendOperatorEntry,
  getOperatorState,
  nextOperatorEntryId,
  resolveOperatorChatMode,
  useStudioOperatorSelector,
} from '@/hooks/use-studio-operator-store'
import { characterCardsQuery } from '@/lib/character-cards-query'
import { queryClient } from '@/lib/query-client'
import { cardGreetings } from '@/lib/tavern-card'
import type { StudioOperatorMessageEntry } from '@/types/studio-assistant-operator'

/**
 * **她先开口**（酒馆 first_mes / alternate_greetings）：和角色聊的新会话里，她卡上的开场白是对话里
 * 真的第一条消息，备选开场白是这一条左右切的版本。
 *
 * ── 为什么没开口前它不进线程 ──────────────────────────────────────
 * 还没说话时它只是**摆出来**的（面板按这里给的那份画）：放进 `entries` 的话，线程就不空了 ——
 * 自动保存会给「看了一眼就走」的人在历史里留一条只有开场白的会话，换档 / 换人还得把它摘掉。
 * 你发第一句的那一下（`send`）才把此刻选中的那一版接进线程，当作历史里第一条她的话进上下文。
 *
 * ⚠ 只在：线程是空的 · 人设是某个角色 · 这段在「聊天」档 · 她写了开场白。工作档、只读的旧聊天、
 *   没写开场白的角色一律不出。⛔ 不念（不触发 TTS）：它不是这一轮服务端说的话。
 */

interface OfferedGreeting {
  /** 摆给哪一条线程（换会话 / 新会话 = 换了一条，选到第几版跟着清掉）。 */
  threadId: string
  /** 摆的是谁的开场白（面板收着时换了人，发出去那一刻对不上就不接）。 */
  characterId: string
  versions: readonly string[]
  index: number
}

let offered: OfferedGreeting | null = null
const listeners = new Set<() => void>()

function publish(next: OfferedGreeting | null): void {
  offered = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function sameVersions(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((text, index) => text === b[index])
}

/** 面板摆出来的那一份（`null` = 不摆）。线程换了、版本变了才重置选中的那一版。 */
export function offerOperatorGreeting(
  threadId: string,
  characterId: string | null,
  versions: readonly string[],
): void {
  if (!characterId || versions.length === 0) {
    if (offered) publish(null)
    return
  }
  if (
    offered &&
    offered.threadId === threadId &&
    offered.characterId === characterId &&
    sameVersions(offered.versions, versions)
  )
    return
  publish({ threadId, characterId, versions, index: 0 })
}

/** 左右切开场白的那几版。 */
export function selectOperatorGreeting(index: number): void {
  if (!offered || index < 0 || index >= offered.versions.length) return
  if (offered.index === index) return
  publish({ ...offered, index })
}

/** 此刻摆着的那一条（画成与她的回复同一种消息行）；没有 = `null`。 */
export function offeredGreetingEntry(
  current: OfferedGreeting | null = offered,
): StudioOperatorMessageEntry | null {
  if (!current) return null
  const text = current.versions[current.index]
  if (!text) return null
  return {
    kind: 'message',
    id: 'greeting',
    text,
    chat: true,
    greeting: true,
    ...(current.versions.length > 1
      ? { versions: current.versions, versionIndex: current.index }
      : {}),
  }
}

/**
 * 你发第一句的那一下：选中的那版开场白接进线程，排在你这句前面（之后它就是历史里她的第一句）。
 * 只在线程还空着、摆的就是这条线程时接；接一次就收起来。
 */
export function commitOperatorGreeting(): void {
  const current = offered
  if (!current) return
  const thread = getOperatorState()
  // 面板收着时换了档 / 换了人，摆着的那份没人撤：发出去这一刻再认一次「还在和她聊」。
  const character = getCachedAssistantCharacter()
  if (
    character?.id !== current.characterId ||
    thread.chatCharacter !== null ||
    resolveOperatorChatMode(thread, true) !== ASSISTANT_CHAT_MODE_IDS.chat ||
    current.threadId !== thread.localThreadId ||
    thread.entries.length > 0 ||
    thread.history.length > 0
  )
    return
  const text = current.versions[current.index]
  publish(null)
  if (!text) return
  appendOperatorEntry({
    kind: 'message',
    id: nextOperatorEntryId('message'),
    text,
    chat: true,
    greeting: true,
  })
}

/**
 * 面板用：算出这一刻该不该摆开场白、摆哪几版，并登记给 `send`。`threadEmpty` 由面板给（它数的
 * 是画出来的那两份条目）。
 */
export function useOperatorGreeting(threadEmpty: boolean): {
  entry: StudioOperatorMessageEntry | null
  select(index: number): void
} {
  const t = useTranslations('StudioOperator.chat')
  const { persona } = useAssistantPersona()
  const chatMode = useOperatorChatMode()
  const { profile } = useMyProfile()
  const characterId = persona.character?.id ?? null
  const chatting =
    threadEmpty &&
    characterId !== null &&
    chatMode.available &&
    chatMode.mode === ASSISTANT_CHAT_MODE_IDS.chat
  const cards = useQuery(
    { ...characterCardsQuery, enabled: chatting },
    queryClient,
  )
  const card = chatting
    ? (cards.data ?? []).find((item) => item.id === characterId)
    : undefined
  // 「怎么称呼你」那一格优先；留空 = 账号名（与助手的称呼同一条规矩）。
  const user =
    persona.addressUserAs?.trim() ||
    profile?.displayName?.trim() ||
    profile?.username?.trim() ||
    t('greetingUserFallback')
  const versions = useMemo(
    () =>
      card
        ? cardGreetings(
            {
              name: card.name,
              opening: card.persona?.opening ?? '',
              alternateGreetings: card.tavern?.alternateGreetings ?? [],
            },
            user,
          )
        : [],
    [card, user],
  )
  const threadId = useStudioOperatorSelector((state) => state.localThreadId)
  useEffect(() => {
    offerOperatorGreeting(threadId, characterId, versions)
  }, [threadId, characterId, versions])
  const current = useSyncExternalStore(
    subscribe,
    () => offered,
    () => null,
  )
  return {
    entry:
      current && current.threadId === threadId && versions.length > 0
        ? offeredGreetingEntry(current)
        : null,
    select: selectOperatorGreeting,
  }
}
