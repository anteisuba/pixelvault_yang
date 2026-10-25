'use client'

import { useEffect, useState } from 'react'

import { listCharacterCardsAPI } from '@/lib/api-client/cards'
import { characterCoverUrl } from '@/lib/card-bus'
import type { StudioOperatorChatRequest } from '@/hooks/use-studio-operator-store'

/**
 * 助手会话菜单「和角色聊…」那一列（附录L）：你自己的角色（只取主卡，变体不列），
 * 每个带开场白，选一个就开一段聊天会话。
 *
 * ⚠ 只在菜单打开时取（`enabled`），取过一次就留着；取不到就是空列表，菜单那一项照常在。
 */
export type ChatCharacterOption = StudioOperatorChatRequest & {
  /** 她的嗓子（角色卡默认音色）：头像点她进配音间按它认人；没绑 = null。 */
  voiceCardId: string | null
}

export function useChatCharacters(enabled: boolean): {
  characters: ChatCharacterOption[]
  isLoading: boolean
} {
  const [characters, setCharacters] = useState<ChatCharacterOption[] | null>(
    null,
  )

  useEffect(() => {
    if (!enabled || characters !== null) return
    let active = true
    void listCharacterCardsAPI().then((result) => {
      if (!active) return
      setCharacters(
        (result.success ? (result.data ?? []) : []).map((card) => ({
          character: {
            id: card.id,
            name: card.name,
            userRole: card.chatUserRole,
          },
          opening: card.persona?.opening ?? '',
          alternateOpenings: card.tavern?.alternateGreetings ?? [],
          avatarUrl: characterCoverUrl(card),
          voiceCardId: card.voiceCardId,
        })),
      )
    })
    return () => {
      active = false
    }
  }, [enabled, characters])

  return {
    characters: characters ?? [],
    isLoading: enabled && characters === null,
  }
}
