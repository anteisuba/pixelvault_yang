'use client'

import { useSyncExternalStore } from 'react'

import {
  ASSISTANT_KERNEL_IDS,
  ASSISTANT_KERNEL_STORAGE_KEY,
} from '@/constants/assistant-v3'

/**
 * 本地开关选了重设计的新内核没有（`antei:assistant-kernel=next`）。只用在「这台挂不挂新面板」
 * 那一处（配音台，第 9b 步）：服务端照旧只对 owner 认，第 9c 步切给所有人时整个拿掉。
 */
function readsNext(): boolean {
  try {
    return (
      window.localStorage.getItem(ASSISTANT_KERNEL_STORAGE_KEY) ===
      ASSISTANT_KERNEL_IDS.next
    )
  } catch {
    return false
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

export function useNextAssistantKernel(): boolean {
  return useSyncExternalStore(subscribe, readsNext, () => false)
}
