'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'

import {
  clearSearchHistory,
  readSearchHistory,
  recordSearchTerm,
} from '@/lib/civitai-search-history'
import { deferEffectTask } from '@/lib/defer-effect-task'

export interface UseLoraSearchHistoryReturn {
  history: string[]
  /** 记一个搜过的词（不到 2 个字不记）。 */
  remember: (term: string) => void
  clear: () => void
}

/**
 * 库 B 搜索框的「最近搜过」：按登录用户各存一份（本机浏览器）。Civitai 与
 * Hugging Face 同一行搜索框、同一份历史。
 */
export function useLoraSearchHistory(): UseLoraSearchHistoryReturn {
  const { isLoaded, userId } = useAuth()
  const clerkId: string | null = isLoaded ? (userId ?? null) : null
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    return deferEffectTask(() => {
      setHistory(readSearchHistory(clerkId))
    })
  }, [clerkId])

  const remember = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (trimmed.length < 2) return
      setHistory(recordSearchTerm(trimmed, clerkId))
    },
    [clerkId],
  )
  const clear = useCallback(() => {
    setHistory(clearSearchHistory(clerkId))
  }, [clerkId])

  return { history, remember, clear }
}
