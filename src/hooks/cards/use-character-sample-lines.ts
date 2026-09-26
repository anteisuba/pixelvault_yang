'use client'

import { useCallback, useState } from 'react'

import { sampleCharacterLinesAPI } from '@/lib/api-client'

/** 试读（卡片页「设定」一行）：用这个角色的口吻说两句。换卡时由调用方用 key 重置。 */
export function useCharacterSampleLines(cardId: string) {
  const [lines, setLines] = useState<string[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const response = await sampleCharacterLinesAPI(cardId)
    setIsLoading(false)
    if (response.success && response.data) setLines(response.data.lines)
    else setError(response.error ?? 'failed')
  }, [cardId])

  return { lines, isLoading, error, run, clear: () => setLines(null) }
}
