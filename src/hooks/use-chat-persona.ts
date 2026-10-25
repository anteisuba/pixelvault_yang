'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'

import { voiceRoomPath } from '@/constants/routes'
import { getAssistantPersonaAPI } from '@/lib/api-client'
import {
  createVoiceRoomAPI,
  listVoiceRoomsAPI,
} from '@/lib/api-client/voiceroom'
import {
  personaCastMember,
  soloRoomsForPersona,
  type ChatPersonaRef,
} from '@/lib/voiceroom-cast'
import { useAssistantPersona } from '@/hooks/use-assistant-persona'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { refreshShellVoiceRooms } from '@/hooks/use-shell-voice-rooms'
import { useRouter } from '@/i18n/navigation'
import {
  withAssistantCharacter,
  type AssistantPersona,
} from '@/types/assistant-persona'

/** 开一段聊天时那一位的样子（角色 = 她的卡、名字、头像、嗓子；默认助手 = 全是 null 那一格）。 */
export interface ChatPersonaTarget {
  characterCardId: string | null
  voiceCardId: string | null
  name: string
  coverImage: string | null
}

/**
 * 「聊天」现在跟着的那一位 = 全局助手人设（用户 10-25：头像菜单点谁，助手就是谁；聊天的人设跟着它）。
 *
 * ⚠ `ready` 之前 `ref` 是默认助手那一格（persona 还没读回来 / 她的嗓子还没查到），⛔ 拿它去挑房间。
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
  const target: ChatPersonaTarget = {
    characterCardId,
    voiceCardId,
    name,
    coverImage: persona.avatarUrl,
  }
  return {
    persona,
    ref,
    target,
    name,
    ready: isLoaded && (characterCardId === null || !characters.isLoading),
  }
}

/** 读回来的 persona → 开聊天用的那一格（换完人设那一拍，手上的 persona 还是旧的）。 */
function targetOf(
  persona: AssistantPersona,
  voiceCardId: string | null,
  fallbackName: string,
): ChatPersonaTarget {
  return {
    characterCardId: persona.character?.id ?? null,
    voiceCardId,
    name: persona.name?.trim() || fallbackName,
    coverImage: persona.avatarUrl,
  }
}

/**
 * 进和某一位的聊天：她最近那一段（只有她一个人的），`fresh` 或一段都没有就照她新开一段。
 * `switchTo`：先把全局人设换成她（头像菜单 / 角色页「和她聊」），再按要不要进聊天走。
 *
 * ⛔ 不强制设音色（用户 10-25）：没绑嗓子的就先占位只打字，开 🔊 时再挑。
 */
export function useOpenPersonaChat() {
  const t = useTranslations('StudioOperator')
  const router = useRouter()
  const { persona, save } = useAssistantPersona()
  const [busy, setBusy] = useState(false)

  const open = useCallback(
    async (target: ChatPersonaTarget, options: { fresh?: boolean } = {}) => {
      setBusy(true)
      try {
        let roomId: string | null = null
        if (!options.fresh) {
          const listed = await listVoiceRoomsAPI()
          roomId =
            soloRoomsForPersona(listed.success ? (listed.data ?? []) : [], {
              characterCardId: target.characterCardId,
              voiceCardId: target.voiceCardId,
            })[0]?.id ?? null
        }
        if (!roomId) {
          const created = await createVoiceRoomAPI({
            cast: [personaCastMember(target)],
          })
          roomId = created.success ? (created.data?.id ?? null) : null
          if (roomId) void refreshShellVoiceRooms()
        }
        if (roomId) router.push(voiceRoomPath(roomId))
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  /**
   * 换人设。`characterCardId` = null 换回默认助手。`voiceCardId` 是她角色卡上的嗓子（进聊天时认房间用）。
   * 回 true = 换上了（已经是她也算）。
   */
  const switchTo = useCallback(
    async (
      characterCardId: string | null,
      options: { voiceCardId?: string | null; openChat?: boolean } = {},
    ) => {
      const already = (persona.character?.id ?? null) === characterCardId
      if (!already) {
        const ok = await save(withAssistantCharacter(persona, characterCardId))
        if (!ok) return false
      }
      if (!options.openChat) return true
      // 换完那一拍手上的 persona 还是旧的：读一份新的拿名字和头像。
      const fresh = already ? null : await getAssistantPersonaAPI()
      await open(
        targetOf(
          fresh?.success ? fresh.data : persona,
          options.voiceCardId ?? null,
          t('timeline.assistantFallback'),
        ),
      )
      return true
    },
    [open, persona, save, t],
  )

  return { open, switchTo, busy }
}
