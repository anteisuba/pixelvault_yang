'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { useRouter } from '@/i18n/navigation'
import { withAssistantCharacter } from '@/types/assistant-persona'

/**
 * 现在陪你的那一位（用户 10-25：头像菜单点谁，助手就是谁）。`characterCardId` = null 是默认助手；
 * `voiceCardId` 是她角色卡上绑的嗓子（🔊 念用它）。
 */
export interface ChatPersonaRef {
  characterCardId: string | null
  voiceCardId: string | null
}

/**
 * 现在陪你的那一位 = 全局助手人设。
 *
 * ⚠ `ready` 之前 `ref` 是默认助手那一格（persona 还没读回来 / 她的嗓子还没查到）。
 */
export function useChatPersona() {
  const t = useTranslations('StudioOperator')
  const { persona, isLoaded } = useAssistantPersona()
  // 卡删了 `character` 就是 null：按默认助手算。
  const characterCardId = persona.character?.id ?? null
  const characters = useChatCharacters(characterCardId !== null)
  const voiceCardId =
    characters.characters.find((item) => item.character.id === characterCardId)
      ?.voiceCardId ?? null
  const ref: ChatPersonaRef = { characterCardId, voiceCardId }
  const name = persona.name?.trim() || t('timeline.assistantFallback')
  return {
    persona,
    ref,
    name,
    ready: isLoaded && (characterCardId === null || !characters.isLoading),
  }
}

/**
 * 换人设（头像菜单 / 角色页「和她聊」/ 旧聊天那一条）。`characterCardId` = null 换回默认助手。
 * `goHome`：换完去首页对话（聊天并回对话之后，「和她聊」就是在对话里跟她说话，②c）。
 * 回 true = 换上了（已经是她也算）。
 */
export function usePersonaSwitch() {
  const router = useRouter()
  const { persona, save } = useAssistantPersona()
  const [busy, setBusy] = useState(false)

  const switchTo = useCallback(
    async (
      characterCardId: string | null,
      options: { goHome?: boolean } = {},
    ) => {
      setBusy(true)
      try {
        const already = (persona.character?.id ?? null) === characterCardId
        if (!already) {
          const ok = await save(
            withAssistantCharacter(persona, characterCardId),
          )
          if (!ok) return false
        }
        if (options.goHome) router.push(ROUTES.STUDIO)
        return true
      } finally {
        setBusy(false)
      }
    },
    [persona, router, save],
  )

  return { switchTo, busy }
}
