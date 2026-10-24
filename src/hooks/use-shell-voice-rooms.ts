'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { listVoiceRoomsAPI } from '@/lib/api-client/voiceroom'
import type { VoiceRoomRecord } from '@/types/voiceroom'

/**
 * 外壳左边列表里的配音间（第 9f 步 9f-3：配音间是一种对话，和助手对话混排）。
 *
 * 列表自己挂上时问一次；配音间那一页开着时由它**发布**手上那份（建 / 改名 / 删 / 说了一句都
 * 会换），列表直接用 —— ⛔ 两边各问各的、改了名左边还是旧的。
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

/** 配音间那一页：手上的房间与开着的那一间交给左边列表。 */
export function usePublishVoiceRooms(
  rooms: readonly VoiceRoomRecord[],
  activeRoomId: string | null,
): void {
  useEffect(() => {
    setState({ rooms, activeRoomId })
  }, [rooms, activeRoomId])
  useEffect(() => () => setState({ ...state, activeRoomId: null }), [])
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
