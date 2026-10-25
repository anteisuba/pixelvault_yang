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
interface ShellVoiceRooms {
  rooms: readonly VoiceRoomRecord[]
  /** 配音间那一页正开着的房间；不在那一页 = null。 */
  activeRoomId: string | null
}

let state: ShellVoiceRooms = { rooms: [], activeRoomId: null }
const listeners = new Set<() => void>()
const EMPTY: ShellVoiceRooms = { rooms: [], activeRoomId: null }

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
): void {
  useEffect(() => {
    setState({ rooms, activeRoomId })
  }, [rooms, activeRoomId])
  useEffect(
    () => () => {
      setState({ ...state, activeRoomId: null })
    },
    [],
  )
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
