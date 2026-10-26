'use client'

import { useCallback, useState } from 'react'

import { ASSISTANT_ROUTE_ERROR_CODES } from '@/constants/assistant-operator'
import type {
  CharacterDialogueDraft,
  CharacterDialogueDraftKind,
} from '@/types'
import { draftCharacterDialogueAPI } from '@/lib/api-client'
import type { SampleLinesFailureReason } from '@/hooks/cards/use-character-sample-lines'

/**
 * 起草（卡片页「对话」一组，10-26「更像真人」A）：对话示例 / 开场白空着时照设定写。
 * 写回卡由调用方拿结果走普通保存；同一时间只起草一样。
 */
export function useCharacterDialogueDraft(cardId: string) {
  const [running, setRunning] = useState<CharacterDialogueDraftKind | null>(
    null,
  )
  const [failed, setFailed] = useState<CharacterDialogueDraftKind | null>(null)
  const [reason, setReason] = useState<SampleLinesFailureReason | null>(null)

  const run = useCallback(
    async (
      kind: CharacterDialogueDraftKind,
    ): Promise<CharacterDialogueDraft | null> => {
      setRunning(kind)
      setFailed(null)
      setReason(null)
      const response = await draftCharacterDialogueAPI(cardId, kind)
      setRunning(null)
      if (response.success && response.data) return response.data
      setFailed(kind)
      const message = response.error ?? 'failed'
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
      return null
    },
    [cardId],
  )

  return { running, failed, reason, run }
}
