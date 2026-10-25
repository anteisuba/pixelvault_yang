'use client'

import { useCallback, useState } from 'react'

import { VOICE_ROOM_SPEAKER_KIND } from '@/constants/voiceroom'
import { voiceRoomPath } from '@/constants/routes'
import { updateCharacterCardAPI } from '@/lib/api-client/cards'
import {
  createVoiceRoomAPI,
  listVoiceRoomsAPI,
} from '@/lib/api-client/voiceroom'
import { roomsWithSameCast, voiceRoomCastKey } from '@/lib/voiceroom-cast'
import { useRouter } from '@/i18n/navigation'
import type { ChatCharacterOption } from '@/hooks/use-chat-characters'
import type { VoiceRoomCastMember } from '@/types/voiceroom'

/**
 * 头像点角色 = 进她的配音间（用户 10-25：去掉聊天模式，和角色聊就是配音间）。
 *
 * 进的是「只有她一个人」的那一组里最近那一段；一段都没有就照她开一段。配音间按嗓子认人
 * （人设从绑了这副嗓子的角色卡读），所以还没绑音色的角色先挑一副、绑到她身上再进 ——
 * `needsVoice` 就是那一位，宿主据此弹挑音色框，挑完调 `bindVoiceAndOpen`。
 */
export function useOpenCharacterRoom(): {
  open(chat: ChatCharacterOption): Promise<void>
  needsVoice: ChatCharacterOption | null
  cancelVoice(): void
  bindVoiceAndOpen(voiceCardId: string): Promise<void>
  busy: boolean
} {
  const router = useRouter()
  const [needsVoice, setNeedsVoice] = useState<ChatCharacterOption | null>(null)
  const [busy, setBusy] = useState(false)

  const enter = useCallback(
    async (chat: ChatCharacterOption, voiceCardId: string) => {
      setBusy(true)
      try {
        const member: VoiceRoomCastMember = {
          id: voiceCardId,
          kind: VOICE_ROOM_SPEAKER_KIND.VOICE,
          name: chat.character.name,
          coverImage: chat.avatarUrl ?? null,
          // 从她进来的，人设就是她（同一副嗓子绑着好几个角色时不认错人）。
          characterCardId: chat.character.id,
        }
        const listed = await listVoiceRoomsAPI()
        const latest = roomsWithSameCast(
          listed.success ? (listed.data ?? []) : [],
          voiceRoomCastKey([member]),
        )[0]
        let roomId: string | null = latest?.id ?? null
        if (!roomId) {
          const created = await createVoiceRoomAPI({ cast: [member] })
          roomId = created.success ? (created.data?.id ?? null) : null
        }
        if (roomId) router.push(voiceRoomPath(roomId))
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  const open = useCallback(
    async (chat: ChatCharacterOption) => {
      if (chat.voiceCardId) await enter(chat, chat.voiceCardId)
      else setNeedsVoice(chat)
    },
    [enter],
  )

  const bindVoiceAndOpen = useCallback(
    async (voiceCardId: string) => {
      const chat = needsVoice
      setNeedsVoice(null)
      if (!chat) return
      await updateCharacterCardAPI(chat.character.id, { voiceCardId })
      await enter({ ...chat, voiceCardId }, voiceCardId)
    },
    [enter, needsVoice],
  )

  return {
    open,
    needsVoice,
    cancelVoice: () => setNeedsVoice(null),
    bindVoiceAndOpen,
    busy,
  }
}
