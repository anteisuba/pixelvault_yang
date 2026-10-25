'use client'

import { useEffect, useSyncExternalStore } from 'react'

import {
  deleteVoiceRoomAPI,
  listVoiceRoomsAPI,
  updateVoiceRoomAPI,
} from '@/lib/api-client/voiceroom'
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

/** 配音间那一页开着时，左边列表改名 / 删房间走它手上那一份（它自己会再发布）。 */
interface VoiceRoomEditors {
  renameRoom(roomId: string, name: string | null): Promise<void>
  removeRoom(roomId: string): Promise<void>
}

let editors: VoiceRoomEditors | null = null

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
  roomEditors: VoiceRoomEditors,
): void {
  useEffect(() => {
    setState({ rooms, activeRoomId })
  }, [rooms, activeRoomId])
  useEffect(() => {
    editors = roomEditors
  }, [roomEditors])
  useEffect(
    () => () => {
      editors = null
      setState({ ...state, activeRoomId: null })
    },
    [],
  )
}

/** 左边列表「最近」里给一间改名（用户 10-25）。 */
export async function renameShellVoiceRoom(
  roomId: string,
  name: string,
): Promise<boolean> {
  if (editors) {
    await editors.renameRoom(roomId, name)
    return true
  }
  const result = await updateVoiceRoomAPI({ roomId, name })
  if (!result.success || !result.data) return false
  const updated = result.data
  setState({
    ...state,
    rooms: state.rooms.map((room) => (room.id === roomId ? updated : room)),
  })
  return true
}

/** 左边列表「最近」里删一间；台词跟着走，生成物不动（同配音间里删）。 */
export async function deleteShellVoiceRoom(roomId: string): Promise<boolean> {
  if (editors) {
    await editors.removeRoom(roomId)
    return true
  }
  const result = await deleteVoiceRoomAPI(roomId)
  if (!result.success) return false
  setState({
    ...state,
    rooms: state.rooms.filter((room) => room.id !== roomId),
  })
  return true
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
