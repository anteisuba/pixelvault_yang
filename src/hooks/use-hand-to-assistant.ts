'use client'

import { useCallback, useContext } from 'react'

import { ASSISTANT_MENTION_SCOPE_IDS } from '@/constants/assistant-mention'
import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { queueOperatorMention } from '@/hooks/use-studio-operator-store'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import { mentionFromAttachment } from '@/lib/assistant-mention'
import type { GenerationRecord } from '@/types'
import type { AssistantMention } from '@/types/assistant-mention'

/**
 * 库里图格的「交给助手」（ui-spec §9「图格」「库 + 助手」）：把这一样挂进助手输入框
 * （走统一引用那条管线 → 正文末尾一枚 `<@kind:id>` 胶囊，同一样只落一次），
 * 再把库右上的助手叫出来。**只挂不发**：要问什么用户自己打字。
 *
 * 不在库整页里（外壳没给落点）就返回 `null` —— 那里没有可以叫出来的助手，⛔ 画这颗键。
 */
export function useHandMentionToAssistant():
  | ((mention: AssistantMention) => void)
  | null {
  const slot = useContext(StudioLibraryTargetContext)
  const setAssistantOpen = slot?.setAssistantOpen
  const hand = useCallback(
    (mention: AssistantMention) => {
      queueOperatorMention(mention)
      setAssistantOpen?.(true)
    },
    [setAssistantOpen],
  )
  return setAssistantOpen ? hand : null
}

/** 素材 / 画廊的格子：递一张生成记录。 */
export function useHandToAssistant():
  | ((generation: GenerationRecord) => void)
  | null {
  const handMention = useHandMentionToAssistant()
  const hand = useCallback(
    (generation: GenerationRecord) =>
      handMention?.(
        mentionFromAttachment(
          toOperatorAttachment(generation),
          ASSISTANT_MENTION_SCOPE_IDS.library,
        ),
      ),
    [handMention],
  )
  return handMention ? hand : null
}
