'use client'

import { useCallback, useState } from 'react'

import { ASSISTANT_ROUTE_ERROR_CODES } from '@/constants/assistant-operator'
import { sampleCharacterLinesAPI } from '@/lib/api-client'

/**
 * 没读成的原因 —— 只在是**助手那一家**跑不了时才有（选的模型缺 key / 一家都没配，
 * owner 2026-10-15「全跟助手」）：界面把那句翻译过的原话照实说出来。
 */
export interface SampleLinesFailureReason {
  error: string
  errorCode?: string
  i18nKey?: string
}

/** 试读（卡片页「设定」一行）：用这个角色的口吻说两句。换卡时由调用方用 key 重置。 */
export function useCharacterSampleLines(cardId: string) {
  const [lines, setLines] = useState<string[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<SampleLinesFailureReason | null>(null)

  const run = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setReason(null)
    const response = await sampleCharacterLinesAPI(cardId)
    setIsLoading(false)
    if (response.success && response.data) {
      setLines(response.data.lines)
      return
    }
    const message = response.error ?? 'failed'
    setError(message)
    if (
      response.errorCode &&
      ASSISTANT_ROUTE_ERROR_CODES.includes(response.errorCode)
    ) {
      setReason({
        error: message,
        errorCode: response.errorCode,
        ...(response.i18nKey ? { i18nKey: response.i18nKey } : {}),
      })
    }
  }, [cardId])

  return { lines, isLoading, error, reason, run, clear: () => setLines(null) }
}
