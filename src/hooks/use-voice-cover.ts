'use client'

/**
 * 一副嗓子的**封面**（owner 2026-09-29：「从声音库拿到的，无论是声音还是作为音色，
 * 封面都带着」）。
 *
 * ⚠ 卡上只记 `voiceId`，⛔ 不把封面地址写进节点：op 载荷里不许有 URL（§5 纪律 1，
 * 让模型写地址等于让它编地址）。封面按 `voiceId` 现查 —— 先看这一会儿已经加载过的
 * 声音库 / 我的音色（`rememberVoiceCovers`），没见过的再向声音库问一次（服务端缓存
 * 5 分钟、平台 key、不要登录），问过的不再问。
 */

import { useEffect, useSyncExternalStore } from 'react'

import { getVoiceAPI } from '@/lib/api-client'

/** `voiceId` → 封面；`null` = 问过了，这副嗓子没有封面。 */
const covers = new Map<string, string | null>()
const asked = new Set<string>()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 声音库 / 我的音色加载回来时顺手记下每副嗓子的封面（⛔ 为了封面单独再拉一次库）。 */
export function rememberVoiceCovers(
  entries: Iterable<{
    readonly voiceId: string | null | undefined
    readonly cover: string | null | undefined
  }>,
): void {
  let changed = false
  for (const { voiceId, cover } of entries) {
    if (!voiceId || !cover || covers.get(voiceId) === cover) continue
    covers.set(voiceId, cover)
    changed = true
  }
  if (changed) notify()
}

/** 这副嗓子的封面（没有 / 还没问到 = `null`）。 */
export function useVoiceCover(
  voiceId: string | null | undefined,
): string | null {
  const cover = useSyncExternalStore(
    subscribe,
    () => (voiceId ? (covers.get(voiceId) ?? null) : null),
    () => null,
  )

  useEffect(() => {
    if (!voiceId || covers.has(voiceId) || asked.has(voiceId)) return
    asked.add(voiceId)
    void getVoiceAPI(voiceId).then((resolved) => {
      if (covers.has(voiceId)) return
      covers.set(
        voiceId,
        resolved.success ? (resolved.data?.coverImage ?? null) : null,
      )
      notify()
    })
  }, [voiceId])

  return cover
}
