'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { listVoiceRoomsAPI } from '@/lib/api-client/voiceroom'
import type { VoiceRoomRecord } from '@/types/voiceroom'

/**
 * 外壳里要知道的配音间：最上面那格换人的菜单列「群」、头像画「此刻在哪一间」（用户 10-25）。
 *
 * 外壳自己挂上时问一次；配音间那一页开着时由它**发布**手上那份（建 / 改名 / 删 / 说了一句都
 * 会换），外壳直接用 —— ⛔ 两边各问各的、改了班底头像还是旧的。
 */
/** 「聊天」那一页开着时它交出来的改名 / 删除（页面手上那份才是真的，⛔ 外壳绕过它直接打 API）。 */
export interface ShellVoiceRoomActions {
  rename(roomId: string, name: string | null): Promise<void>
  remove(roomId: string): Promise<void>
}

interface ShellVoiceRooms {
  rooms: readonly VoiceRoomRecord[]
  /** 配音间那一页正开着的房间；不在那一页 = null。 */
  activeRoomId: string | null
  /** 那一页开着 = 它的那两只手；不在那一页 = null（外壳自己打 API、改自己这份）。 */
  actions: ShellVoiceRoomActions | null
}

let state: ShellVoiceRooms = { rooms: [], activeRoomId: null, actions: null }
const listeners = new Set<() => void>()
const EMPTY: ShellVoiceRooms = { rooms: [], activeRoomId: null, actions: null }

function setState(next: ShellVoiceRooms) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 配音间那一页：手上的房间与开着的那一间交给外壳。 */
export function usePublishVoiceRooms(
  rooms: readonly VoiceRoomRecord[],
  activeRoomId: string | null,
  actions: ShellVoiceRoomActions,
): void {
  useEffect(() => {
    setState({ rooms, activeRoomId, actions })
  }, [rooms, activeRoomId, actions])
  useEffect(
    () => () => {
      setState({ ...state, activeRoomId: null, actions: null })
    },
    [],
  )
}

/** 外壳自己改了（不在那一页时改名 / 删除 / 新开）：手上那份跟着换。 */
export function setShellVoiceRooms(rooms: readonly VoiceRoomRecord[]): void {
  setState({ ...state, rooms })
}

/** 重新问一次（外壳替人开了一段之后）。 */
export async function refreshShellVoiceRooms(): Promise<void> {
  const result = await listVoiceRoomsAPI()
  if (result.success && result.data) setState({ ...state, rooms: result.data })
}

export function useShellVoiceRooms(): ShellVoiceRooms {
  useEffect(() => {
    let cancelled = false
    void listVoiceRoomsAPI().then((result) => {
      // 配音间那一页已经发布过了就以它为准。
      if (cancelled || !result.success || !result.data) return
      if (state.rooms.length === 0) setState({ ...state, rooms: result.data })
    })
    return () => {
      cancelled = true
    }
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  )
}
