'use client'

import { useCallback, useContext } from 'react'

import { StudioLibraryTargetContext } from '@/components/business/studio/shell/StudioLibraryOverlay'
import { addOperatorMention } from '@/hooks/use-studio-operator-store'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import type { GenerationRecord } from '@/types'

/**
 * 库里图格的「交给助手」（ui-spec §9「图格」「库 + 助手」）：把这一张挂进助手输入框
 * （走统一引用那条管线，`addOperatorMention` → 正文末尾一枚 `<@image:id>` 胶囊，同一张只落一次），
 * 再把库右上的助手叫出来。**只挂不发**：要问什么用户自己打字。
 *
 * 不在库整页里（外壳没给落点）就返回 `null` —— 那里没有可以叫出来的助手，⛔ 画这颗键。
 */
export function useHandToAssistant():
  | ((generation: GenerationRecord) => void)
  | null {
  const slot = useContext(StudioLibraryTargetContext)
  const setAssistantOpen = slot?.setAssistantOpen
  const hand = useCallback(
    (generation: GenerationRecord) => {
      addOperatorMention(toOperatorAttachment(generation))
      setAssistantOpen?.(true)
    },
    [setAssistantOpen],
  )
  return setAssistantOpen ? hand : null
}
