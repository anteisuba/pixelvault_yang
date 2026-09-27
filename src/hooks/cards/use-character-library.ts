'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

import type { CharacterCardRecord } from '@/types'
import { listCharacterCardsAPI } from '@/lib/api-client'
import {
  makeCardCacheKey,
  readCardCache,
  writeCardCache,
} from '@/lib/card-cache'

/**
 * **只读**的角色库（画布用角色 ④，owner 09-27）：画布左栏与画布上每一张角色卡都读它。
 *
 * ⭐ 全页一份：一张画布上有几张角色卡都只拉一次（同一个进行中的请求被复用）；
 *   与 `useCharacterCards` 共用同一份模块缓存，角色页刚拉过这里就不再转圈。
 * ⭐ 画布只记「是她」，卡面要现读最新：回到这个标签页时静默再拉一次 —— 用户常在
 *   另一个标签页的角色页里改了图或设定再回来。
 * ⚠ 这里不做增删改：那是角色页（`useCharacterCards`）的事。
 */

const CACHE_KEY = makeCardCacheKey('character')

interface LibraryState {
  readonly cards: readonly CharacterCardRecord[]
  readonly loaded: boolean
  readonly failed: boolean
}

let state: LibraryState = {
  cards: readCardCache<CharacterCardRecord[]>(CACHE_KEY) ?? [],
  loaded: readCardCache<CharacterCardRecord[]>(CACHE_KEY) !== undefined,
  failed: false,
}
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(next: LibraryState) {
  state = next
  listeners.forEach((listener) => listener())
}

function load(): Promise<void> {
  if (inflight) return inflight
  inflight = listCharacterCardsAPI()
    .then((response) => {
      if (response.success && response.data) {
        writeCardCache(CACHE_KEY, response.data)
        emit({ cards: response.data, loaded: true, failed: false })
      } else {
        emit({ ...state, loaded: true, failed: state.cards.length === 0 })
      }
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

/** 找她：根卡或变体都认（旧画布可能绑过变体 id）。 */
export function findLibraryCharacter(
  cards: readonly CharacterCardRecord[],
  id: string,
): CharacterCardRecord | null {
  for (const card of cards) {
    if (card.id === id) return card
    const variant = card.variants.find((item) => item.id === id)
    if (variant) return variant
  }
  return null
}

export function useCharacterLibrary() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const find = useCallback(
    (id: string) => findLibraryCharacter(snapshot.cards, id),
    [snapshot.cards],
  )

  return {
    cards: snapshot.cards,
    /** 至少拉回过一次（缓存命中也算）—— 在这之前「找不到她」不等于「她被删了」。 */
    loaded: snapshot.loaded,
    failed: snapshot.failed,
    find,
    refresh: load,
  }
}
