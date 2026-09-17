'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import {
  MODEL_PICKER_CHANNEL_STORAGE_KEY,
  MODEL_PICKER_DEFAULT_SCOPE,
  MODEL_PICKER_RECENT_LIMIT,
  MODEL_PICKER_RECENT_STORAGE_KEY,
} from '@/constants/model-picker'
import {
  getPendingModel,
  modelPickerGateKey,
  setPendingModel as writePendingModel,
  subscribePendingModels,
} from '@/lib/model-picker-gate'

/**
 * 模型选择器的三样记忆：**手选的渠道**（按型号）、**最近用过的型号**，以及
 * **选了型号还没选渠道**的那一个（按作用域，至多一个）。
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
  /**
   * 「选了型号但还没点渠道」的那个型号键；没有就是 null。
   *
   * ⚠ 这是 D2 Q1 删掉「自动渠道」之后必然存在的中间态，⛔ 不要用「随便挑一条渠道」
   * 把它抹平 —— 那就是被删掉的自动规则。
   */
  pendingModelKey: string | null
  setPendingModel: (modelKey: string | null) => void
  /** 该型号被手选过的渠道 id；没有就返回 null（走自动规则）。 */
  manualChannelOf: (modelKey: string) => string | null
  rememberChannel: (modelKey: string, channelId: string) => void
  /** 最近用过的型号键，最近的在前，最多 `MODEL_PICKER_RECENT_LIMIT` 条。 */
  recentModelKeys: readonly string[]
  rememberRecent: (modelKey: string) => void
}

export function useModelPickerMemory(
  scope: string = MODEL_PICKER_DEFAULT_SCOPE,
  /** 同一 scope 下多个选择器各管各的未选渠道时传（画布按节点 id）。 */
  gateId?: string,
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

  // ⚠ 未选渠道住模块级 store（`model-picker-gate`），不住组件 state：写下它的是
  // 选择器，读它的是生成按钮，两者在不同的组件树里（见该文件头注）。
  const gateKey = modelPickerGateKey(scope, gateId)
  const pending = useSyncExternalStore(
    subscribePendingModels,
    () => getPendingModel(gateKey),
    () => null,
  )
  const setPendingModel = useCallback(
    (modelKey: string | null) => writePendingModel(gateKey, modelKey),
    [gateKey],
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
    pendingModelKey: pending,
    setPendingModel,
    manualChannelOf,
    rememberChannel,
    recentModelKeys: recent,
    rememberRecent,
  }
}
