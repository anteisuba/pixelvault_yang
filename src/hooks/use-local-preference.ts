'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * 读/写一条 localStorage 偏好，**不用 effect**。
 *
 * ⚠ 为什么不是「`useState` 默认值 + effect 里读回来纠正」：那个写法会在
 * effect 里同步 setState，触发 react-hooks 的 `set-state-in-effect`
 * （级联渲染），而且首帧一定先闪一下默认值。`useSyncExternalStore` 的
 * 服务端快照恒为 `null`（服务端没有 localStorage），客户端首次渲染就读到真值，
 * 既没有 hydration mismatch 也没有 effect。
 *
 * ⚠ 同一个标签页内 `localStorage.setItem` **不会**触发 `storage` 事件（那是给
 * 别的标签页用的），所以写入后要自己广播一次，否则当前页面不会重渲染。
 */

const PREFERENCE_CHANGE_EVENT = 'pv:local-preference'

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(PREFERENCE_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(PREFERENCE_CHANGE_EVENT, onStoreChange)
  }
}

function readValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // localStorage unavailable (Safari private mode 等) —— 当成没存过。
    return null
  }
}

export function useLocalPreference(
  key: string,
): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readValue(key),
    () => null,
  )

  const setValue = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next)
      } catch {
        // 存不下就只当本次会话有效，不该因此崩掉交互。
      }
      window.dispatchEvent(new Event(PREFERENCE_CHANGE_EVENT))
    },
    [key],
  )

  return [value, setValue]
}
