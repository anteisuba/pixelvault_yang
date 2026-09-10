'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  MODEL_PICKER_CHANNEL_STORAGE_KEY,
  MODEL_PICKER_DEFAULT_SCOPE,
  MODEL_PICKER_RECENT_LIMIT,
  MODEL_PICKER_RECENT_STORAGE_KEY,
} from '@/constants/model-picker'

/**
 * 模型选择器的两样记忆：**手选的渠道**（按型号）与**最近用过的型号**。
 *
 * 都是纯本地偏好，不上服务端 —— 换一台机器重新按自动规则来是可接受的，而为
 * 「上次点了 fal」开一张表不是。读写全裹 try/catch：隐私窗口里 localStorage
 * 会直接抛，选择器不该因此打不开。
 */

type ScopedRecord = Record<string, string>
type ScopedList = Record<string, string[]>

function readJson<T>(storageKey: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

function writeJson(storageKey: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // 配额满 / 隐私模式：记不住而已，不影响选择。
  }
}

export interface ModelPickerMemory {
  /** 该型号被手选过的渠道 id；没有就返回 null（走自动规则）。 */
  manualChannelOf: (modelKey: string) => string | null
  rememberChannel: (modelKey: string, channelId: string) => void
  /** 最近用过的型号键，最近的在前，最多 `MODEL_PICKER_RECENT_LIMIT` 条。 */
  recentModelKeys: readonly string[]
  rememberRecent: (modelKey: string) => void
}

export function useModelPickerMemory(
  scope: string = MODEL_PICKER_DEFAULT_SCOPE,
): ModelPickerMemory {
  const [channels, setChannels] = useState<ScopedRecord>({})
  const [recent, setRecent] = useState<readonly string[]>([])

  // 只在挂载后读 —— localStorage 在服务端不存在，初值直接读会让 SSR 与首帧不一致。
  // 这不是「从渲染输入推得出来的状态」，是**向外部系统取一次数据后回填**，与
  // 全仓既有 hook 同一个写法（`use-voiceroom` / `use-context-cards`）。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时读一次 localStorage（外部系统），不是级联推导
    setChannels(readJson<ScopedRecord>(MODEL_PICKER_CHANNEL_STORAGE_KEY, {}))
    setRecent(
      readJson<ScopedList>(MODEL_PICKER_RECENT_STORAGE_KEY, {})[scope] ?? [],
    )
  }, [scope])

  const manualChannelOf = useCallback(
    (modelKey: string) => channels[`${scope}:${modelKey}`] ?? null,
    [channels, scope],
  )

  const rememberChannel = useCallback(
    (modelKey: string, channelId: string) => {
      setChannels((prev) => {
        const next = { ...prev, [`${scope}:${modelKey}`]: channelId }
        writeJson(MODEL_PICKER_CHANNEL_STORAGE_KEY, next)
        return next
      })
    },
    [scope],
  )

  const rememberRecent = useCallback(
    (modelKey: string) => {
      setRecent((prev) => {
        const next = [modelKey, ...prev.filter((k) => k !== modelKey)].slice(
          0,
          MODEL_PICKER_RECENT_LIMIT,
        )
        const all = readJson<ScopedList>(MODEL_PICKER_RECENT_STORAGE_KEY, {})
        writeJson(MODEL_PICKER_RECENT_STORAGE_KEY, { ...all, [scope]: next })
        return next
      })
    },
    [scope],
  )

  return {
    manualChannelOf,
    rememberChannel,
    recentModelKeys: recent,
    rememberRecent,
  }
}
