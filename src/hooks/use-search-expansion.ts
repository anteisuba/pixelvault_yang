'use client'

import { useEffect, useState } from 'react'

import { SEARCH_EXPANSION } from '@/constants/semantic-search'
import { expandSearchQueryAPI } from '@/lib/api-client'

const NONE: readonly string[] = []

/**
 * 库页面的搜索词翻成的英文标签写法（下雨 → rain）：停打 `DEBOUNCE_MS` 才去问，
 * 回来前、出错、搜索框空着都是空 —— 页面先照字面筛，翻好了再把对上的接在后面。
 */
export function useSearchExpansion(query: string): readonly string[] {
  const text = query.trim()
  const [result, setResult] = useState<{
    text: string
    words: readonly string[]
  }>({ text: '', words: NONE })

  useEffect(() => {
    if (!text) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      expandSearchQueryAPI(text, controller.signal)
        .then((words) => setResult({ text, words }))
        .catch(() => undefined)
    }, SEARCH_EXPANSION.DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [text])

  return result.text === text && text ? result.words : NONE
}
